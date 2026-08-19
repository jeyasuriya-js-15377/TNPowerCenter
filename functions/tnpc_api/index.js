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
const { resolveDepartments } = require('./resolve-departments');

const { DEPARTMENTS, OFFICERS, MODULES, ISSUE_STATUS, SEVERITY, ISSUE_FIELDS, DIRECTIVE_FIELDS, FEEDBACK_FIELDS } = schema;

/* ------------------------------------------------------------------ *
 * Read-through cache
 * ------------------------------------------------------------------ */

// 38 departments means 38 project reads. A longer window and a bounded pool are
// what make that survivable; the reference Catalyst build hit cold-start 502s
// with only nine parallel reads.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 120000);
const READ_CONCURRENCY = Number(process.env.READ_CONCURRENCY || 6);

let cache = { at: 0, complaints: null };
/** Run an async worker over items with a hard concurrency ceiling. */
async function pool(items, limit, worker) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    })
  );
  return out;
}

async function loadAllComplaints({ force = false } = {}) {
  if (!force && cache.complaints && Date.now() - cache.at < CACHE_TTL_MS) {
    return {
      complaints: cache.complaints, departments: cache.departments,
      gaps: cache.gaps, cachedAt: new Date(cache.at).toISOString(), fromCache: true,
    };
  }

  const departments = await resolveDepartments(zoho);
  const readable = departments.filter((d) => d.id);

  const results = await pool(readable, READ_CONCURRENCY, async (dept) => {
    try {
      const issues = await zoho.listIssues(dept.id);
      return issues.map((i) => engine.normalizeComplaint(i, dept));
    } catch (err) {
      // A department that cannot be read is a DATA GAP, never a zero.
      return { __error: true, departmentId: dept.id, department: dept.name, message: err.message };
    }
  });

  const complaints = [];
  const gaps = [];
  for (const res of results) {
    if (Array.isArray(res)) complaints.push(...res);
    else gaps.push(res);
  }

  // Departments with no Zoho project yet are also gaps — reported, not hidden.
  departments
    .filter((d) => !d.id)
    .forEach((d) => gaps.push({ department: d.name, message: 'No Zoho project provisioned' }));

  cache = { at: Date.now(), complaints, departments, gaps };
  return { complaints, departments, gaps, cachedAt: new Date(cache.at).toISOString(), fromCache: false };
}

function invalidateCache() {
  cache = { at: 0, complaints: null };
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

/**
 * CORS is handled by Catalyst, not here.
 *
 * Catalyst intercepts OPTIONS at the platform level and applies the project's
 * CORS domain whitelist. If this function ALSO sets Access-Control-Allow-Origin
 * the browser sees the header twice ("contains multiple values") and blocks the
 * response outright. So the default is to send nothing and let the platform own
 * it — whitelist the Slate origin under the project's CORS domains instead.
 *
 * Set SEND_CORS_HEADERS=true only when running outside Catalyst (for example
 * serving the client from a different port in local development).
 */
const SEND_CORS = process.env.SEND_CORS_HEADERS === 'true';

const corsHeaders = () =>
  SEND_CORS
    ? {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      }
    : {};

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(),
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

/**
 * Session token arrives in X-App-Token, NOT Authorization.
 *
 * Catalyst treats an `Authorization: Bearer …` header on an AdvancedIO function
 * as one of its own OAuth tokens and rejects the request with 401 INVALID_TOKEN
 * before the handler ever runs — even on a route with no auth. Using a custom
 * header sidesteps the platform entirely.
 *
 * Authorization is still accepted as a fallback so curl and the local server
 * behave the same way; on Catalyst that path is simply unreachable.
 */
function principal(req) {
  const custom = req.headers['x-app-token'];
  if (custom) return auth.verify(String(custom));

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token ? auth.verify(token) : null;
}

/** Looks in the resolved set first, so runtime-discovered IDs are found. */
function departmentById(id) {
  const key = String(id);
  const resolved = cache.departments || DEPARTMENTS;
  return resolved.find((d) => d.id === key) || DEPARTMENTS.find((d) => d.id === key) || null;
}

function accountabilityFor(department) {
  if (!department) return null;
  const c = department.contacts || {};
  return {
    political: {
      role: 'Minister',
      holder: department.minister,
      phone: c.ministerOffice ? c.ministerOffice.phone : null,
    },
    administrative: {
      role: 'Principal Secretary',
      holder: department.secretary,
      phone: c.secretary ? c.secretary.phone : null,
    },
    controlRoom: c.controlRoom || null,
    note:
      'Political and administrative accountability are shown separately and are never collapsed '
      + 'into one person. The Minister entry is the office, not a named individual. Numbers are '
      + 'non-dialable placeholders.',
  };
}

/** Phone and designation for the officer holding a complaint. */
function officerContact(assignee) {
  if (!assignee || !assignee.email) return null;
  const roster = OFFICERS.find((o) => o.email.toLowerCase() === String(assignee.email).toLowerCase());
  return {
    name: assignee.name,
    designation: assignee.designation || (roster ? roster.designation : null),
    district: roster ? roster.district : null,
    phone: roster ? roster.phone : null,
    officePhone: roster ? roster.officePhone : null,
    email: assignee.email,
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
  const { complaints, gaps, cachedAt, departments } = await loadAllComplaints();
  const now = new Date();

  // Only departments with a project and at least one complaint are scored; the
  // rest are reported under freshness as data gaps rather than dragging the
  // pulse down with thirty empty scorecards.
  const withData = new Set(complaints.map((c) => c.departmentId));
  const visibleDepartments = auth
    .scopedDepartments(ctx.claims, departments)
    .filter((d) => d.id && withData.has(d.id));
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

  let list = complaints.filter((c) => auth.inScope(ctx.claims, c.departmentKey));

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
  if (!auth.inScope(ctx.claims, complaint.departmentKey))
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
    // Who to ring about this specific complaint, without leaving the screen.
    contact: {
      officer: officerContact(complaint.assignee),
      controlRoom: dept && dept.contacts ? dept.contacts.controlRoom : null,
      secretary: dept && dept.contacts ? dept.contacts.secretary : null,
    },
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

  // Route to a department that actually has a Zoho project. The static registry
  // carries no project IDs by design, so resolving is mandatory — writing to
  // `/projects/null/issues` is the failure this guards against.
  const { departments } = await loadAllComplaints();
  const readable = departments.filter((d) => d.id);

  const dept =
    readable.find((d) => d.name === classification.department) ||
    readable.find((d) => d.short === 'Municipal & Water') ||
    readable[0];

  if (!dept) {
    return fail(
      ctx.res,
      503,
      'NO_PROVISIONED_DEPARTMENT',
      'No department has a Zoho project yet, so there is nowhere to file this complaint. '
      + 'Run the seeder to provision the departments.'
    );
  }

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
  if (!auth.inScope(ctx.claims, complaint.departmentKey))
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

// --- monthly performance and the department award ---------------------
route('GET', /^\/dashboard\/monthly$/, 'department:read', async (ctx) => {
  const { complaints, departments, cachedAt } = await loadAllComplaints();
  const months = Math.min(Math.max(Number(ctx.query.months) || 6, 1), 12);

  const scoped = auth.scopedDepartments(ctx.claims, departments).filter((d) => d.id);
  const scopedIds = new Set(scoped.map((d) => d.id));
  const visible = complaints.filter((c) => scopedIds.has(c.departmentId));

  const report = engine.monthlyPerformance(scoped, visible, new Date(), { months });

  return send(ctx.res, 200, {
    ...report,
    note:
      'Each month is scored on the complaints reported in it, with SLA state evaluated at '
      + 'the end of that month — so a department is judged on the month it actually had, not on '
      + 'how much time has passed since.',
    freshness: { source: 'Zoho Projects', lastUpdated: cachedAt, state: 'FRESH' },
  });
});

// --- contact directory ------------------------------------------------
/**
 * Who to call, for the Chief Minister.
 *
 * Every number here is a non-dialable placeholder: Indian mobile numbers begin
 * 6–9, and each of these begins with 5, so none can connect to a real person.
 */
route('GET', /^\/contacts$/, 'department:read', async (ctx) => {
  const { complaints, departments } = await loadAllComplaints();
  const now = new Date();

  const scoped = auth.scopedDepartments(ctx.claims, departments);
  const filtered = ctx.query.departmentId
    ? scoped.filter((d) => d.id === ctx.query.departmentId)
    : scoped;

  const q = String(ctx.query.q || '').toLowerCase();

  const directory = filtered
    .map((dept) => {
      const rows = complaints.filter((c) => c.departmentId === dept.id);
      const breached = rows.filter((c) => engine.slaState(c, now).state === 'BREACHED').length;

      // Officers actually holding complaints in this department, with load.
      const officerMap = new Map();
      rows.forEach((c) => {
        if (!c.assignee || !c.assignee.email) return;
        const cur = officerMap.get(c.assignee.email) || {
          name: c.assignee.name, designation: c.assignee.designation,
          email: c.assignee.email, open: 0, breached: 0,
        };
        if (!c.isClosed) cur.open += 1;
        if (engine.slaState(c, now).state === 'BREACHED') cur.breached += 1;
        officerMap.set(c.assignee.email, cur);
      });

      const officers = [...officerMap.values()]
        .map((o) => {
          const roster = OFFICERS.find((x) => x.email.toLowerCase() === o.email.toLowerCase());
          return { ...o, phone: roster ? roster.phone : null, officePhone: roster ? roster.officePhone : null,
            district: roster ? roster.district : null };
        })
        .sort((a, b) => b.breached - a.breached || b.open - a.open);

      return {
        departmentId: dept.id,
        department: dept.name,
        short: dept.short,
        tier: dept.tier,
        complaints: rows.length,
        breached,
        escalationPath: [
          dept.contacts.controlRoom,
          dept.contacts.secretary,
          dept.contacts.ministerOffice,
        ],
        officers,
      };
    })
    .filter((d) => !q
      || d.department.toLowerCase().includes(q)
      || d.officers.some((o) => (o.name || '').toLowerCase().includes(q)));

  return send(ctx.res, 200, {
    data: directory.sort((a, b) => b.breached - a.breached || b.complaints - a.complaints),
    guidance:
      'Escalate in order: departmental control room, then Principal Secretary, then the '
      + 'Minister’s office. Contact the assigned officer directly for the status of a single complaint.',
    disclaimer:
      'DEMO DATA. Every number shown is a non-dialable placeholder — Indian mobile numbers '
      + 'begin 6–9 and these begin with 5, so none can reach a real person.',
  });
});

// --- red flags --------------------------------------------------------
route('GET', /^\/red-flags$/, 'redflag:read', async (ctx) => {
  const { complaints } = await loadAllComplaints();
  const visible = complaints.filter((c) => auth.inScope(ctx.claims, c.departmentKey));
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
  const { departments: seedDepartments } = await loadAllComplaints();
  const created = [];
  const failed = [];
  for (const spec of DEMO_COMPLAINTS) {
    const dept = seedDepartments.find((d) => d.short === spec.dept && d.id);
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
  // On Catalyst this never runs — the platform answers OPTIONS itself.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
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
