/**
 * Browser client for the API.
 *
 * Default `/api` is the Next.js proxy route, which forwards server-side to the
 * function. That keeps every request same-origin.
 *
 * Set NEXT_PUBLIC_API_BASE to an absolute function URL when building a static
 * export, which has no server and therefore no proxy.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

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
      // Session lives in X-App-Token. Do not send Authorization: Bearer —
      // the host platform treats that as its own token and rejects the call.
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
