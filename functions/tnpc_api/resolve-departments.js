'use strict';

/**
 * Resolve department → Zoho project ID by matching project names.
 *
 * There are NO hard-coded project IDs anywhere in this application, and that is
 * deliberate. The earlier version kept five as a "fallback"; when those five
 * projects were later trashed during de-duplication, every read against them
 * returned `410 RESOURCE_TRASHED` and the whole app broke while the portal was
 * perfectly healthy. A stale ID is worse than no ID.
 *
 * The department name in `government-registry.js` is the join key. Provisioning a
 * project with that name is the only step needed to bring a department online.
 *
 * Shared by the API, the seeder and the diagnostic tools so all four agree on
 * which project is which.
 */

const { DEPARTMENTS } = require('./zoho-schema');

const TTL_MS = Number(process.env.PROJECT_MAP_TTL_MS || 600000);

let cache = { at: 0, departments: null };

/**
 * @param {{ listProjects: Function }} zoho
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<Array>} departments, each with `id` set where a project exists
 */
async function resolveDepartments(zoho, { force = false } = {}) {
  if (!force && cache.departments && Date.now() - cache.at < TTL_MS) {
    return cache.departments;
  }

  const projects = await zoho.listProjects();

  // Last-writer-wins would pick an arbitrary copy if duplicates ever reappear.
  // Prefer the project holding the most issues, so a stray empty duplicate can
  // never shadow the one with the data.
  const best = new Map();
  for (const p of projects) {
    const key = String(p.name || '').trim().toLowerCase();
    if (!key) continue;
    const issues = (p.issues && (p.issues.open_count || 0) + (p.issues.closed_count || 0)) || 0;
    const current = best.get(key);
    if (!current || issues > current.issues) best.set(key, { id: String(p.id), issues });
  }

  const resolved = DEPARTMENTS.map((d) => {
    const match = best.get(d.name.toLowerCase());
    return { ...d, id: match ? match.id : null };
  });

  cache = { at: Date.now(), departments: resolved };
  return resolved;
}

/** Departments that have a project and can therefore be read. */
const provisioned = (departments) => departments.filter((d) => d.id);

function invalidate() {
  cache = { at: 0, departments: null };
}

module.exports = { resolveDepartments, provisioned, invalidate };
