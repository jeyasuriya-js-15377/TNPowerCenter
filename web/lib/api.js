/**
 * Client for the Catalyst Advanced I/O function.
 *
 * The function is served from the same origin at /server/tnpc_api, so the base
 * is relative by default. Override at build time with NEXT_PUBLIC_API_BASE if
 * the client is hosted somewhere else — CORS is already permitted server-side.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || '/server/tnpc_api';

const SESSION_KEY = 'tnpc';

/* ── session ──────────────────────────────────────────────────────── */

/** Reads the saved session. Safe to call during a static prerender. */
export function loadSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

/* ── requests ─────────────────────────────────────────────────────── */

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/**
 * @param {string} path      e.g. '/dashboard'
 * @param {{ method?: string, body?: unknown, token?: string | null }} [options]
 */
export async function api(path, options = {}) {
  const { method = 'GET', body, token } = options;

  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      // X-App-Token, never Authorization: Catalyst validates any
      // `Authorization: Bearer …` sent to an AdvancedIO function as one of its
      // own OAuth tokens and returns 401 before our handler runs.
      ...(token ? { 'X-App-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = data && data.error;
    throw new ApiError(
      (err && err.message) || `Request failed (${res.status})`,
      res.status,
      err
    );
  }
  return data;
}

/** Binds a token so callers stop threading it through every call. */
export function withToken(token) {
  return (path, options = {}) => api(path, { ...options, token });
}
