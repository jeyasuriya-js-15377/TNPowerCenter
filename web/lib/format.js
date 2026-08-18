/**
 * Presentation semantics.
 *
 * Colour carries meaning in this interface, so the mapping lives in one place:
 * DATA_GAP is never rendered in a "good" colour, and a breached SLA is never
 * rendered in the same colour as one merely at risk.
 */

export const healthClass = (h) =>
  ({
    HEALTHY: 'c-ok',
    WATCH: 'c-warn',
    AT_RISK: 'c-risk',
    CRITICAL: 'c-crit',
    DATA_GAP: 'c-gap',
  }[h] || 'c-gap');

export const healthBg = (h) =>
  ({
    HEALTHY: 'bg-ok',
    WATCH: 'bg-warn',
    AT_RISK: 'bg-risk',
    CRITICAL: 'bg-crit',
    DATA_GAP: 'bg-gap',
  }[h] || 'bg-gap');

export const slaClass = (s) =>
  ({
    BREACHED: 'c-crit',
    AT_RISK: 'c-risk',
    DUE: 'c-ok',
    RESOLVED: 'c-ok',
  }[s] || 'muted');

/** Bands match HEALTH_BANDS in functions/tnpc_api/zoho-schema.js. */
export const scoreClass = (n) =>
  n == null ? 'c-gap' : n >= 85 ? 'c-ok' : n >= 70 ? 'c-warn' : n >= 55 ? 'c-risk' : 'c-crit';

/** Band a 0–1 dimension value the same way a 0–100 score is banded. */
export const fractionHealth = (v) =>
  v == null ? 'DATA_GAP' : v >= 0.85 ? 'HEALTHY' : v >= 0.7 ? 'WATCH' : v >= 0.55 ? 'AT_RISK' : 'CRITICAL';

export const percentHealth = (v) =>
  v == null ? 'DATA_GAP' : v >= 85 ? 'HEALTHY' : v >= 70 ? 'WATCH' : v >= 55 ? 'AT_RISK' : 'CRITICAL';

/** ROUTED_FOR_REVIEW → "Routed for review" */
export const humanise = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export const attentionClass = (severity) =>
  severity === 'CRITICAL' ? 'c-crit' : severity === 'HIGH' ? 'c-risk' : 'c-warn';

export const time = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '—');

/** ISO date string N days from now, for date inputs. */
export const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
