'use strict';

/**
 * Tamil Nadu Power Center — Catalyst Advanced I/O function.
 *
 * Zero npm dependencies: plain Node http handling, hand-rolled routing.
 * Deploys as-is; nothing to install.
 *
 * All state lives in Zoho Projects. This function is stateless apart from a
 * short read-through cache that keeps the CM Command Center inside the
 * 30-second rule without hammering the Projects API.
 */

const schema = require('./zoho-schema');
const zoho = require('./zoho-client');
const engine = require('./engine');
const auth = require('./auth');
const { DEMO_COMPLAINTS } = require('./seed');

const { DEPARTMENTS, MODULES, ISSUE_STATUS, SEVERITY, ISSUE_FIELDS, DIRECTIVE_FIELDS, FEEDBACK_FIELDS } = schema;

/* ------------------------------------------------------------------ *
 * Read-through cache
 * ------------------------------------------------------------------ */

const CACHE_TTL_MS = 30000;
let cache = { at: 0, complaints: null };

async function loadAllComplaints({ force = false } = {}) {
  if (!force && cache.complaints && Date.now() - cache.at < CACHE_TTL_MS) {
    return { complaints: cache.complaints, cachedAt: new Date(cache.at).toISOString(), fromCache: true };
  }

  const results = await Promise.all(
    DEPARTMENTS.map(async (dept) => {
      try {
        const issues = await zoho.listIssues(dept.id);
        return issues.map((i) => engine.normalizeComplaint(i, dept));
      } catch (err) {
        // A department that cannot be read is a DATA GAP, never a zero.
        return { __error: true, departmentId: dept.id, message: err.message };
      }
    })
  );

  const complaints = [];
  const gaps = [];
  for (const r of results) {
    if (Array.isArray(r)) complaints.push(...r);
    else gaps.push(r);
  }

  cache = { at: Date.now(), complaints, gaps };
  return { complaints, gaps, cachedAt: new Date(cache.at).toISOString(), fromCache: false };
}

function invalidateCache() {
  cache = { at: 0, complaints: null };
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  });
  res.end(body);
}

const fail = (res, status, code, message, extra = {}) =>
  send(res, status, { error: { code, message, ...extra } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) reject(new Error('Payload too large'));
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Catalyst may prefix the path with /server/<function-name>. Strip it. */
function normalizePath(rawUrl) {
  const url = new URL(rawUrl, 'http://localhost');
  let path = url.pathname.replace(/\/+$/, '') || '/';
  path = path.replace(/^\/server\/[^/]+/, '') || '/';
  return { path, query: Object.fromEntries(url.searchParams) };
}

function principal(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token ? auth.verify(token) : null;
}

function departmentById(id) {
  return DEPARTMENTS.find((d) => d.id === String(id)) || null;
}

function accountabilityFor(department) {
  if (!department) return null;
  return {
    political: { role: 'Minister', holder: department.minister },
    administrative: { role: 'Principal Secretary', holder: department.secretary },
    note: 'Political and administrative accountability are shown separately and are never collapsed into one person.',
  };
}

/* ------------------------------------------------------------------ *
 * Route handlers
 * ------------------------------------------------------------------ */

const routes = [];
const route = (method, pattern, permission, handler) =>
  routes.push({ method, pattern, permission, handler });

// --- health -----------------------------------------------------------
route('GET', /^\/health$/, null, async (ctx) =>
  send(ctx.res, 200, {
    service: 'tn-power-center',
    status: 'ok',
    backbone: 'Zoho Projects',
    portalId: schema.PORTAL_ID,
    departments: DEPARTMENTS.length,
    zohoConfigured: Boolean(process.env.ZOHO_REFRESH_TOKEN),
    time: new Date().toISOString(),
  })
);

// --- auth -------------------------------------------------------------
route('POST', /^\/auth\/login$/, null, async (ctx) => {
  const { email, password } = ctx.body;
  const result = auth.login(email, password);
  if (!result) return fail(ctx.res, 401, 'UNAUTHORIZED', 'Invalid email or password.');
  return send(ctx.res, 200, result);
});

route('GET', /^\/auth\/me$/, 'complaint:read', async (ctx) =>
  send(ctx.res, 200, { user: auth.publicUser(ctx.claims) })
);

// --- command centre ---------------------------------------------------
route('GET', /^\/dashboard$/, 'department:read', async (ctx) => {
  const { complaints, gaps, cachedAt } = await loadAllComplaints();
  const now = new Date();

  const visibleDepartments = auth.scopedDepartments(ctx.claims, DEPARTMENTS);
  const visibleIds = new Set(visibleDepartments.map((d) => d.id));
  const visible = complaints.filter((c) => visibleIds.has(c.departmentId));

  const scorecards = visibleDepartments.map((dept) =>
    engine.departmentScorecard(dept, visible.filter((c) => c.departmentId === dept.id), now)
  );

  const flags = auth.can(ctx.claims, 'redflag:read')
    ? engine.redFlags(visible, now).map((f) => ({
        ...f,
        accountability: { ...f.accountability, ...accountabilityFor(departmentById(f.departmentId)) },
      }))
    : [];

  return send(ctx.res, 200, {
    pulse: engine.statePulse(scorecards),
    scorecards: scorecards.sort((a, b) => (a.score ?? 999) - (b.score ?? 999)),
    redFlags: flags,
    districts: engine.districtPulse(visible, now),
    totals: {
      complaints: visible.length,
      breached: visible.filter((c) => engine.slaState(c, now).state === 'BREACHED').length,
      atRisk: visible.filter((c) => engine.slaState(c, now).state === 'AT_RISK').length,
      awaitingCitizen: visible.filter((c) => c.statusKey === 'AWAITING_CITIZEN').length,
    },
    freshness: {
      source: 'Zoho Projects',
      lastUpdated: cachedAt,
      state: 'FRESH',
      dataGaps: (gaps || []).map((g) => ({ departmentId: g.departmentId, reason: g.message })),
      note: 'Departments that cannot be read are reported as DATA GAPS, never as zero complaints.',
    },
    scope: ctx.claims.scope,
    generatedAt: now.toISOString(),
  });
});

// --- complaints -------------------------------------------------------
route('GET', /^\/complaints$/, 'complaint:read', async (ctx) => {
  const { complaints } = await loadAllComplaints();
  const now = new Date();
  const q = ctx.query;

  let list = complaints.filter((c) => auth.inScope(ctx.claims, c.departmentId));

  if (q.departmentId) list = list.filter((c) => c.departmentId === q.departmentId);
  if (q.district) list = list.filter((c) => c.district === q.district);
  if (q.stage) list = list.filter((c) => c.stage === q.stage);
  if (q.sla) list = list.filter((c) => engine.slaState(c, now).state === q.sla);
  if (q.q) {
    const needle = q.q.toLowerCase();
    list = list.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        c.description.toLowerCase().includes(needle) ||
        (c.citizenRef || '').toLowerCase().includes(needle)
    );
  }

  const withSla = list
    .map((c) => ({ ...c, sla: engine.slaState(c, now) }))
    .sort((a, b) => b.sla.breachHours - a.sla.breachHours || b.severityWeight - a.severityWeight);

  return send(ctx.res, 200, { data: withSla, count: withSla.length });
});

route('GET', /^\/complaints\/([^/]+)$/, 'complaint:read', async (ctx) => {
  const id = ctx.params[0];
  const { complaints } = await loadAllComplaints();
  const complaint = complaints.find((c) => c.id === id);
  if (!complaint) return fail(ctx.res, 404, 'NOT_FOUND', 'Complaint not found.');
  if (!auth.inScope(ctx.claims, complaint.departmentId))
    return fail(ctx.res, 403, 'FORBIDDEN', 'This complaint is outside your authorised scope.');

  const now = new Date();
  const dept = departmentById(complaint.departmentId);

  let comments = [];
  try {
    comments = await zoho.listIssueComments(complaint.departmentId, complaint.id);
  } catch {
    comments = [];
  }

  return send(ctx.res, 200, {
    complaint: { ...complaint, sla: engine.slaState(complaint, now) },
    accountability: accountabilityFor(dept),
    classification: {
      department: complaint.departmentName,
      category: complaint.category,
      sentiment: complaint.sentiment,
      confidence: complaint.aiConfidence,
      note: 'Classification is advisory. A human may re-route at any time; the correction is stored as structured feedback.',
    },
    timeline: comments.map((c) => ({
      at: c.created_time || c.added_time || null,
      by: (c.added_by && c.added_by.name) || (c.created_by && c.created_by.name) || 'System',
      content: String(c.content || '').replace(/<[^>]+>/g, ''),
    })),
    zohoUrl: `https://projects.zoho.in/portal/${process.env.ZOHO_PORTAL_NAME || 'jeyasuriyadotjscmzohotestdotcom'}#buginfo/${complaint.departmentId}/${complaint.id}`,
  });
});

// Citizen intake. Public in spirit, but kept behind the session for the demo.
route('POST', /^\/complaints$/, 'complaint:read', async (ctx) => {
  const { title, description, district, citizenRef } = ctx.body;
  if (!title || String(title).trim().length < 8)
    return fail(ctx.res, 400, 'BAD_REQUEST', 'A complaint title of at least 8 characters is required.');

  const classification = engine.classify(title, description);
  const dept =
    DEPARTMENTS.find((d) => d.name === classification.department) ||
    DEPARTMENTS.find((d) => d.short === 'Municipal & Water');

  const severityId =
    { Showstopper: SEVERITY.SHOWSTOPPER, Critical: SEVERITY.CRITICAL, Major: SEVERITY.MAJOR, Minor: SEVERITY.MINOR }[
      classification.severity
    ] || SEVERITY.MINOR;

  const reportedAt = new Date().toISOString();
  const slaDue = new Date(
    Date.now() + engine.resolutionHours(classification.severity) * 3600000
  ).toISOString();

  const payload = {
    name: String(title).slice(0, 200),
    description: `${description || ''}\n\n[Filed through Power Center citizen intake]`.trim(),
    [ISSUE_FIELDS.citizenRef]: citizenRef || `TN-${Math.floor(100000 + Math.random() * 899999)}`,
    [ISSUE_FIELDS.district]: district || 'Unassigned',
    [ISSUE_FIELDS.category]: classification.category,
    [ISSUE_FIELDS.sentiment]: classification.sentiment,
    [ISSUE_FIELDS.aiConfidence]: String(classification.confidence),
    [ISSUE_FIELDS.satisfaction]: 'Pending',
    [ISSUE_FIELDS.reportedAt]: reportedAt,
    [ISSUE_FIELDS.slaDue]: slaDue,
    severity: { id: severityId },
    status: { id: ISSUE_STATUS.OPEN },
  };

  const created = await zoho.createIssue(dept.id, payload);
  invalidateCache();

  return send(ctx.res, 201, {
    complaint: { id: created && created.id, key: created && created.prefix, department: dept.name },
    classification,
    sla: { dueAt: slaDue, resolutionHours: engine.resolutionHours(classification.severity) },
    routing: {
      layer1: 'No deterministic rule matched; fell through to classification.',
      layer2: `Classifier selected ${dept.name} / ${classification.category} at ${Math.round(classification.confidence * 100)}% confidence.`,
      decision: classification.routing,
    },
  });
});

route('POST', /^\/complaints\/([^/]+)\/status$/, 'complaint:update', async (ctx) => {
  const id = ctx.params[0];
  const { status, note } = ctx.body;
  const statusId = ISSUE_STATUS[status];
  if (!statusId) return fail(ctx.res, 422, 'UNPROCESSABLE', `Unknown status "${status}".`);

  const { complaints } = await loadAllComplaints();
  const complaint = complaints.find((c) => c.id === id);
  if (!complaint) return fail(ctx.res, 404, 'NOT_FOUND', 'Complaint not found.');
  if (!auth.inScope(ctx.claims, complaint.departmentId))
    return fail(ctx.res, 403, 'FORBIDDEN', 'Outside your authorised scope.');

  // A department cannot close a complaint the citizen has not accepted.
  if (status === 'CLOSED' && complaint.satisfaction !== 'Satisfied') {
    return fail(
      ctx.res,
      422,
      'CITIZEN_VALIDATION_REQUIRED',
      'This complaint cannot be closed administratively. The citizen has not confirmed the resolution.'
    );
  }

  await zoho.updateIssue(complaint.departmentId, id, { status: { id: statusId } });
  if (note) {
    await zoho.addIssueComment(complaint.departmentId, id, `${note}\n\n— ${ctx.claims.name} (${ctx.claims.role})`);
  }
  invalidateCache();
  return send(ctx.res, 200, { ok: true, id, status });
});

// Citizen validation — the loop that stops administrative closure hiding failure.
route('POST', /^\/complaints\/([^/]+)\/feedback$/, 'complaint:read', async (ctx) => {
  const id = ctx.params[0];
  const { satisfied, rating, comment } = ctx.body;
  const { complaints } = await loadAllComplaints();
  const complaint = complaints.find((c) => c.id === id);
  if (!complaint) return fail(ctx.res, 404, 'NOT_FOUND', 'Complaint not found.');

  const isSatisfied = satisfied === true || satisfied === 'Yes';

  await zoho.updateIssue(complaint.departmentId, id, {
    [ISSUE_FIELDS.satisfaction]: isSatisfied ? 'Satisfied' : 'Unsatisfied',
    status: { id: isSatisfied ? ISSUE_STATUS.CLOSED : ISSUE_STATUS.REOPENED },
  });

  await zoho.createRecord(MODULES.feedback, {
    name: `Validation for ${complaint.key || complaint.id} — ${isSatisfied ? 'Accepted' : 'Rejected'}`,
    description: comment || (isSatisfied ? 'Citizen accepted the resolution.' : 'Citizen rejected the resolution.'),
    [FEEDBACK_FIELDS.complaintRef]: complaint.id,
    [FEEDBACK_FIELDS.satisfied]: isSatisfied ? 'Yes' : 'No',
    [FEEDBACK_FIELDS.rating]: String(rating || (isSatisfied ? 5 : 1)),
    [FEEDBACK_FIELDS.department]: complaint.departmentName,
  });

  invalidateCache();
  return send(ctx.res, 200, {
    ok: true,
    outcome: isSatisfied ? 'CLOSED' : 'REOPENED',
    message: isSatisfied
      ? 'Citizen confirmed the resolution. Complaint closed and the department score updated.'
      : 'Citizen rejected the resolution. Complaint reopened and escalated; the department score has been reduced.',
  });
});

// --- red flags --------------------------------------------------------
route('GET', /^\/red-flags$/, 'redflag:read', async (ctx) => {
  const { complaints } = await loadAllComplaints();
  const visible = complaints.filter((c) => auth.inScope(ctx.claims, c.departmentId));
  const flags = engine.redFlags(visible, new Date()).map((f) => ({
    ...f,
    accountability: { ...f.accountability, ...accountabilityFor(departmentById(f.departmentId)) },
  }));
  return send(ctx.res, 200, { data: flags, count: flags.length });
});

// --- directives -------------------------------------------------------
route('GET', /^\/directives$/, 'department:read', async (ctx) => {
  const records = await zoho.listRecords(MODULES.directive);
  return send(ctx.res, 200, {
    data: records.map((r) => ({
      id: r.id,
      title: r.name,
      objective: r[DIRECTIVE_FIELDS.objective] || '',
      department: r[DIRECTIVE_FIELDS.department] || '',
      accountableAuthority: r[DIRECTIVE_FIELDS.accountableAuthority] || '',
      deadline: r[DIRECTIVE_FIELDS.deadline] || '',
      status: r[DIRECTIVE_FIELDS.status] || 'DRAFT',
      createdAt: r.created_time,
    })),
  });
});

/**
 * Issue a CM directive. This is a privileged action.
 * The War Room analyst reaches this endpoint and is refused — visibility
 * without authority, enforced server-side.
 */
route('POST', /^\/directives$/, 'directive:issue', async (ctx) => {
  const { title, objective, departmentId, deadline, redFlagId } = ctx.body;
  if (!title || !objective) return fail(ctx.res, 400, 'BAD_REQUEST', 'Title and objective are required.');

  const dept = departmentById(departmentId);
  if (!dept) return fail(ctx.res, 400, 'BAD_REQUEST', 'Unknown department.');

  const record = await zoho.createRecord(MODULES.directive, {
    name: String(title).slice(0, 200),
    description: `Issued by ${ctx.claims.name}. Source red flag: ${redFlagId || 'manual'}.`,
    [DIRECTIVE_FIELDS.objective]: objective,
    [DIRECTIVE_FIELDS.department]: dept.name,
    [DIRECTIVE_FIELDS.accountableAuthority]: dept.secretary,
    [DIRECTIVE_FIELDS.deadline]: deadline || '',
    [DIRECTIVE_FIELDS.status]: 'ISSUED',
  });

  // A directive is an executable object, not a document: it lands as real work.
  let task = null;
  try {
    task = await zoho.createTask(dept.id, {
      name: `[CM DIRECTIVE] ${String(title).slice(0, 150)}`,
      description: `${objective}\n\nAccountable: ${dept.secretary}\nDeadline: ${deadline || 'not set'}\nIssued by: ${ctx.claims.name}`,
    });
  } catch (err) {
    task = { error: err.message };
  }

  invalidateCache();
  return send(ctx.res, 201, {
    directive: { id: record && record.id, title, department: dept.name, status: 'ISSUED' },
    execution: { zohoTaskId: task && task.id ? task.id : null, project: dept.name, detail: task && task.error ? task.error : 'Task created in the department project.' },
    audit: { actor: ctx.claims.sub, role: ctx.claims.role, at: new Date().toISOString() },
  });
});

// --- demo data seeding ------------------------------------------------
route('POST', /^\/admin\/seed$/, 'directive:issue', async (ctx) => {
  const created = [];
  const failed = [];
  for (const spec of DEMO_COMPLAINTS) {
    const dept = DEPARTMENTS.find((d) => d.short === spec.dept);
    if (!dept) continue;
    try {
      const issue = await zoho.createIssue(dept.id, {
        name: spec.title,
        description: `DEMO DATA. ${spec.description}`,
        [ISSUE_FIELDS.citizenRef]: spec.citizenRef,
        [ISSUE_FIELDS.district]: spec.district,
        [ISSUE_FIELDS.category]: spec.category,
        [ISSUE_FIELDS.sentiment]: spec.sentiment,
        [ISSUE_FIELDS.aiConfidence]: spec.confidence,
        [ISSUE_FIELDS.satisfaction]: spec.satisfaction,
        [ISSUE_FIELDS.reportedAt]: spec.reportedAt,
        [ISSUE_FIELDS.slaDue]: spec.slaDue,
        severity: { id: SEVERITY[spec.severity] },
        status: { id: ISSUE_STATUS[spec.status] },
      });
      created.push({ id: issue && issue.id, title: spec.title });
    } catch (err) {
      failed.push({ title: spec.title, reason: err.message });
    }
  }
  invalidateCache();
  return send(ctx.res, 200, { created: created.length, failed, note: 'All records are labelled DEMO DATA.' });
});

/* ------------------------------------------------------------------ *
 * Dispatcher
 * ------------------------------------------------------------------ */

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    });
    return res.end();
  }

  let path, query;
  try {
    ({ path, query } = normalizePath(req.url || '/'));
  } catch {
    return fail(res, 400, 'BAD_REQUEST', 'Malformed URL.');
  }

  const match = routes.find((r) => r.method === req.method && r.pattern.test(path));
  if (!match) return fail(res, 404, 'NOT_FOUND', `No route for ${req.method} ${path}`);

  const claims = principal(req);
  if (match.permission) {
    if (!claims) return fail(res, 401, 'UNAUTHORIZED', 'A valid session is required.');
    if (!auth.can(claims, match.permission)) {
      return fail(res, 403, 'FORBIDDEN', `Your role does not hold "${match.permission}".`, {
        role: claims.role,
        requiredPermission: match.permission,
        hint:
          match.permission === 'directive:issue'
            ? 'Visibility and authority are separate. This role can investigate and prepare, but only the Chief Minister can issue a directive.'
            : undefined,
      });
    }
  }

  let body = {};
  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      body = await readBody(req);
    } catch (err) {
      return fail(res, 400, 'BAD_REQUEST', err.message);
    }
  }

  const params = (path.match(match.pattern) || []).slice(1);

  try {
    await match.handler({ req, res, claims, body, query, params, path });
  } catch (err) {
    const status = err.code === 'ZOHO_NOT_CONFIGURED' ? 503 : 500;
    return fail(res, status, err.code || 'INTERNAL', err.message, {
      detail: process.env.NODE_ENV === 'production' ? undefined : err.detail,
    });
  }
};

// Exported for tests.
module.exports.__internals = { normalizePath, loadAllComplaints, accountabilityFor };
