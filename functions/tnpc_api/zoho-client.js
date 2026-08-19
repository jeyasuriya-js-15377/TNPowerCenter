'use strict';

/**
 * Zoho Projects REST client.
 *
 * Zoho Projects is the ONLY system of record for this application. There is no
 * external database. Every read and write in Power Center goes through here.
 *
 * Auth: a self-client refresh token is exchanged for a short-lived access token
 * and cached in module scope for the life of the warm function instance.
 */

const https = require('node:https');
const { URL } = require('node:url');
const { PORTAL_ID } = require('./zoho-schema');

const ACCOUNTS_BASE = process.env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.in';
const API_BASE = process.env.ZOHO_API_BASE || 'https://projects.zoho.in/api/v3';

let tokenCache = { value: null, expiresAt: 0 };

/**
 * In-flight refresh, shared across concurrent callers.
 *
 * The Command Center reads five department projects in parallel. On a cold
 * function instance all five hit an empty token cache at once and each POSTs to
 * Zoho's token endpoint simultaneously; Zoho rejects the burst and the whole
 * dashboard 502s. Coalescing every concurrent refresh onto one promise means a
 * cold start makes exactly one token request no matter how many reads fan out.
 */
let refreshInFlight = null;

function request(method, urlString, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = body == null ? null : Buffer.from(body, 'utf8');
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers,
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = { raw: text };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Zoho request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt - 60000) return tokenCache.value;

  // Someone else is already refreshing — wait for their result rather than
  // starting a second request.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshAccessToken() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw Object.assign(new Error('Zoho credentials are not configured'), { code: 'ZOHO_NOT_CONFIGURED' });
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const { status, body } = await request('POST', `${ACCOUNTS_BASE}/oauth/v2/token?${params}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });

  if (status !== 200 || !body || !body.access_token) {
    throw Object.assign(new Error('Failed to obtain Zoho access token'), {
      code: 'ZOHO_AUTH_FAILED',
      detail: body,
    });
  }

  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return tokenCache.value;
}

/**
 * `form` sends application/x-www-form-urlencoded instead of JSON.
 *
 * Not every Zoho Projects v3 endpoint takes JSON. The add-users-to-project
 * endpoint is one that does not: posting JSON to it returns a bare 400 with no
 * field detail, while the same payload form-encoded is accepted.
 */
async function call(method, path, { query = null, json = null, form = null, retry = true } = {}) {
  const token = await getAccessToken();
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const encodedForm = form ? new URLSearchParams(form).toString() : null;

  const { status, body } = await request(method, `${API_BASE}${path}${qs}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(encodedForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: json ? JSON.stringify(json) : encodedForm,
  });

  // A 401 on a warm instance usually means the cached token aged out.
  if (status === 401 && retry) {
    tokenCache = { value: null, expiresAt: 0 };
    return call(method, path, { query, json, form, retry: false });
  }

  if (status >= 400) {
    throw Object.assign(new Error(`Zoho ${method} ${path} failed with ${status}`), {
      code: 'ZOHO_API_ERROR',
      status,
      detail: body,
    });
  }
  return body && body.data !== undefined ? body.data : body;
}

/* ------------------------------------------------------------------ *
 * Domain-shaped helpers. Callers never build Zoho paths themselves.
 * ------------------------------------------------------------------ */

const portal = () => `/portal/${PORTAL_ID}`;

/**
 * Every project in the portal, across pages.
 *
 * Zoho caps a page at 100 regardless of what `per_page` asks for, so a single
 * request silently truncates once a portal has more than 100 projects. That
 * truncation is exactly what let a seeder conclude "nothing exists here" and
 * create a duplicate set. Paginate until a short page comes back.
 *
 * Throws on failure. Callers that write MUST NOT treat an error as "empty".
 */
const extractRows = (data) => {
  const rows = (data && (data.result || data.projects)) || (Array.isArray(data) ? data : null);
  return Array.isArray(rows) ? rows : [];
};

/**
 * Pagination styles this endpoint has been observed to accept.
 *
 * `page`/`per_page` works through the MCP server but returned an empty result
 * set from a direct call, while `index`/`range` is the other documented style.
 * Rather than hard-code a guess — the guess is what produced three generations of
 * duplicate projects — try each style, keep the first that returns rows, and
 * remember it for the life of the process.
 */
const PAGINATION_STYLES = [
  { name: 'index/range', build: (n, size) => ({ index: (n - 1) * size + 1, range: size }) },
  { name: 'page/per_page', build: (n, size) => ({ page: n, per_page: size }) },
  { name: 'per_page only', build: (n, size) => (n === 1 ? { per_page: size } : null) },
  { name: 'no params', build: (n) => (n === 1 ? {} : null) },
];

let workingStyle = null;

/**
 * Every project in the portal.
 *
 * Throws on transport failure. Callers that then WRITE must not treat an empty
 * result as "nothing exists" — see the abort guard in tools/seed-portal.js.
 */
async function listProjects({ maxPages = 20, pageSize = 100 } = {}) {
  const styles = workingStyle ? [workingStyle] : PAGINATION_STYLES;

  for (const style of styles) {
    const all = [];
    let failed = false;

    for (let n = 1; n <= maxPages; n += 1) {
      const query = style.build(n, pageSize);
      if (query === null) break; // this style is single-page only
      let rows;
      try {
        rows = extractRows(await call('GET', `${portal()}/projects`, { query }));
      } catch (err) {
        // A style the endpoint rejects outright — move on to the next.
        if (n === 1) { failed = true; break; }
        throw err;
      }
      if (rows.length === 0) break;
      all.push(...rows);
      if (rows.length < pageSize) break;
    }

    if (!failed && all.length > 0) {
      if (!workingStyle) {
        workingStyle = style;
        if (process.env.ZOHO_DEBUG) console.error(`[zoho] project pagination: ${style.name}`);
      }
      // De-duplicate by id: overlapping offsets across styles are possible.
      const seen = new Set();
      return all.filter((p) => {
        const id = String(p.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
  }

  return [];
}

/** Which pagination style worked, for diagnostics. */
const projectPaginationStyle = () => (workingStyle ? workingStyle.name : 'none succeeded');

async function createProject(payload) {
  const data = await call('POST', `${portal()}/projects`, { json: payload });
  return (data && (data.result || data)) || null;
}

async function listIssues(projectId, { page = 1, perPage = 200 } = {}) {
  const data = await call('GET', `${portal()}/projects/${projectId}/issues`, {
    query: { page, per_page: perPage },
  });
  return (data && (data.result || data.issues)) || [];
}

async function getIssue(projectId, issueId) {
  const data = await call('GET', `${portal()}/projects/${projectId}/issues/${issueId}`);
  return (data && (data.result || data)) || null;
}

async function createIssue(projectId, payload) {
  const data = await call('POST', `${portal()}/projects/${projectId}/issues`, { json: payload });
  return (data && (data.result || data)) || null;
}

async function updateIssue(projectId, issueId, payload) {
  const data = await call('PATCH', `${portal()}/projects/${projectId}/issues/${issueId}`, {
    json: payload,
  });
  return (data && (data.result || data)) || null;
}

async function addIssueComment(projectId, issueId, content) {
  return call('POST', `${portal()}/projects/${projectId}/issues/${issueId}/comments`, {
    json: { content },
  });
}

async function listIssueComments(projectId, issueId) {
  const data = await call('GET', `${portal()}/projects/${projectId}/issues/${issueId}/comments`);
  return (data && (data.result || data.comments)) || [];
}

/**
 * Custom module records.
 *
 * The path is `/module/{api_name}/entities` — singular "module", and "entities"
 * rather than "records". Anything else returns
 * `400 URL_RULE_NOT_CONFIGURED — Given URL is wrong`, which reads like a
 * permissions or configuration problem and is really just a wrong URL.
 */
async function listRecords(moduleApiName, { perPage = 200 } = {}) {
  const data = await call('GET', `${portal()}/module/${moduleApiName}/entities`, {
    query: { per_page: perPage },
  });

  // Zoho v3 has returned records under several keys across endpoints. Accept any
  // of them, and never hand back a non-array — a caller doing .map() on an
  // object turns a read problem into an opaque 500.
  const candidate =
    (data && (data.result || data.entities || data.records)) || (Array.isArray(data) ? data : null);
  return Array.isArray(candidate) ? candidate : [];
}

async function createRecord(moduleApiName, payload) {
  const data = await call('POST', `${portal()}/module/${moduleApiName}/entities`, { json: payload });
  return (data && (data.result || data)) || null;
}

async function updateRecord(moduleApiName, recordId, payload) {
  const data = await call('PATCH', `${portal()}/module/${moduleApiName}/entities/${recordId}`, {
    json: payload,
  });
  return (data && (data.result || data)) || null;
}

async function createTask(projectId, payload) {
  const data = await call('POST', `${portal()}/projects/${projectId}/tasks`, { json: payload });
  return (data && (data.result || data)) || null;
}

/**
 * Add portal users to a project. Form-encoded — see call() above.
 * `userdetails` is a JSON-encoded STRING, not an array, and needs role_id and
 * profile_id rather than the ZPUID you may already have.
 */
async function addUsersToProject(projectId, users, { notify = false } = {}) {
  return call('POST', `${portal()}/projects/${projectId}/users`, {
    form: { notify: String(notify), userdetails: JSON.stringify(users) },
  });
}

async function listProjectUsers(projectId) {
  const data = await call('GET', `${portal()}/projects/${projectId}/users`, {
    query: { view_type: '1', type: 1, per_page: 100 },
  });
  return (data && (data.result || data.users)) || [];
}

module.exports = {
  call,
  getAccessToken,
  listProjects,
  projectPaginationStyle,
  createProject,
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  addIssueComment,
  listIssueComments,
  listRecords,
  createRecord,
  updateRecord,
  createTask,
  addUsersToProject,
  listProjectUsers,
};
