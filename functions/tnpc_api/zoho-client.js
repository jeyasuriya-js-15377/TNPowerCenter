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

async function call(method, path, { query = null, json = null, retry = true } = {}) {
  const token = await getAccessToken();
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const { status, body } = await request(method, `${API_BASE}${path}${qs}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : null,
  });

  // A 401 on a warm instance usually means the cached token aged out.
  if (status === 401 && retry) {
    tokenCache = { value: null, expiresAt: 0 };
    return call(method, path, { query, json, retry: false });
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

async function listRecords(moduleApiName, { page = 1, perPage = 200 } = {}) {
  const data = await call('GET', `${portal()}/modules/${moduleApiName}/records`, {
    query: { page, per_page: perPage },
  });
  return (data && (data.result || data.records)) || [];
}

async function createRecord(moduleApiName, payload) {
  const data = await call('POST', `${portal()}/modules/${moduleApiName}/records`, { json: payload });
  return (data && (data.result || data)) || null;
}

async function createTask(projectId, payload) {
  const data = await call('POST', `${portal()}/projects/${projectId}/tasks`, { json: payload });
  return (data && (data.result || data)) || null;
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
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  addIssueComment,
  listIssueComments,
  listRecords,
  createRecord,
  createTask,
  listProjectUsers,
};
