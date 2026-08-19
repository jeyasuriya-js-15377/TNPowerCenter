'use strict';

/**
 * Zoho Projects connectivity check.
 *
 * The schema and demo data were built through the Zoho Projects MCP server.
 * At runtime the app talks to the REST API directly, so this script exercises
 * every endpoint `zoho-client.js` depends on and tells you exactly which ones
 * answer — before you spend time debugging the UI.
 *
 *   ZOHO_CLIENT_ID=… ZOHO_CLIENT_SECRET=… ZOHO_REFRESH_TOKEN=… \
 *   node tools/verify-zoho.js
 *
 * Anything marked FAIL is a path to correct in zoho-client.js. Everything is
 * read-only unless you pass --write, which creates and then trashes one issue.
 */

const zoho = require('../functions/tnpc_api/zoho-client');
const { MODULES, PORTAL_ID, ISSUE_FIELDS } = require('../functions/tnpc_api/zoho-schema');
const { resolveDepartments, provisioned } = require('../functions/tnpc_api/resolve-departments');

const WRITE = process.argv.includes('--write');
const results = [];

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function check(label, fn) {
  try {
    const value = await fn();
    results.push({ label, ok: true });
    console.log(`  ${g('PASS')}  ${label}${value ? dim(`  ${value}`) : ''}`);
    return true;
  } catch (err) {
    results.push({ label, ok: false, err });
    console.log(`  ${r('FAIL')}  ${label}`);
    console.log(`        ${dim(err.message)}`);
    if (err.detail) console.log(`        ${dim(JSON.stringify(err.detail).slice(0, 220))}`);
    return false;
  }
}

(async () => {
  console.log('\n  Tamil Nadu Power Center — Zoho Projects connectivity check');
  console.log(`  Portal ${PORTAL_ID}\n`);

  const authOk = await check('OAuth — exchange refresh token for access token', async () => {
    const t = await zoho.getAccessToken();
    return `token acquired (${t.slice(0, 12)}…)`;
  });

  if (!authOk) {
    console.log(`\n  ${r('Stopping.')} Fix credentials first — see docs/DEPLOY.md step 1.`);
    console.log('  Most common cause: using the .com API console for a .in portal.\n');
    process.exit(1);
  }

  await check('GET projects — the list the seeder depends on', async () => {
    const projects = await zoho.listProjects();
    if (!Array.isArray(projects)) throw new Error('Expected an array of projects');
    if (projects.length === 0) {
      throw new Error(
        'Zero projects returned. Do NOT run the seeder — it would treat this as an '
        + 'empty portal and create a duplicate of every department.'
      );
    }
    const names = new Set(projects.map((p) => String(p.name || '').trim().toLowerCase()));
    const dupes = projects.length - names.size;
    return `${projects.length} projects, ${names.size} unique names`
      + `  [pagination: ${zoho.projectPaginationStyle()}]`
      + (dupes ? `  ${dupes} DUPLICATES — run tools/dedupe-projects.js` : '');
  });

  // Resolve by name. There are no hard-coded project IDs — a stale one returns
  // 410 RESOURCE_TRASHED long after the project was removed, which is exactly
  // how this check broke last time.
  const departments = await resolveDepartments(zoho, { force: true });
  const live = provisioned(departments);
  console.log(`  ${dim(`resolved ${live.length}/${departments.length} departments to a project`)}\n`);

  const dept = live.find((d) => d.short === 'Municipal & Water') || live[0];
  if (!dept) {
    console.log(`  ${r('No department resolved to a project.')} Run the seeder to provision them.\n`);
    process.exit(1);
  }

  await check(`GET issues — ${dept.short}`, async () => {
    const issues = await zoho.listIssues(dept.id);
    if (!Array.isArray(issues)) throw new Error('Expected an array of issues');
    const withFields = issues.filter((i) => i[ISSUE_FIELDS.slaDue]);
    return `${issues.length} issues, ${withFields.length} carrying sla_due`;
  });

  await check('GET issues — every provisioned department', async () => {
    // Only departments with a resolved project ID. The registry carries all 38,
    // most of which have no project until the seeder provisions one; asking Zoho
    // for /projects/null/issues is a bug in the check, not in the portal.
    const counts = [];
    for (const d of live) {
      const n = (await zoho.listIssues(d.id)).length;
      if (n > 0) counts.push(`${d.short}:${n}`);
    }
    return `${live.length} provisioned, ${counts.length} holding issues — ${counts.join('  ') || 'none'}`;
  });

  let sampleIssue = null;
  await check('GET a single issue', async () => {
    const issues = await zoho.listIssues(dept.id);
    if (!issues.length) throw new Error('No issues to read — run POST /admin/seed first');
    sampleIssue = issues[0];
    const full = await zoho.getIssue(dept.id, sampleIssue.id);
    if (!full) throw new Error('Empty response');
    return full.name ? full.name.slice(0, 46) : '(no name)';
  });

  await check('GET issue comments', async () => {
    if (!sampleIssue) throw new Error('No sample issue');
    const c = await zoho.listIssueComments(dept.id, sampleIssue.id);
    return `${Array.isArray(c) ? c.length : 0} comments`;
  });

  await check('GET project users', async () => {
    const users = await zoho.listProjectUsers(dept.id);
    return `${Array.isArray(users) ? users.length : 0} users`;
  });

  for (const [name, api] of Object.entries(MODULES)) {
    await check(`GET custom module records — ${api}`, async () => {
      const recs = await zoho.listRecords(api);
      return `${Array.isArray(recs) ? recs.length : 0} records`;
    });
  }

  if (WRITE) {
    console.log(`\n  ${dim('--write given: exercising write paths')}\n`);
    let created = null;

    await check('POST create issue (with custom fields)', async () => {
      created = await zoho.createIssue(dept.id, {
        name: 'CONNECTIVITY CHECK — safe to delete',
        description: 'Written by tools/verify-zoho.js',
        [ISSUE_FIELDS.citizenRef]: 'TN-000000',
        [ISSUE_FIELDS.district]: 'Chennai',
        [ISSUE_FIELDS.category]: 'Connectivity Check',
        [ISSUE_FIELDS.sentiment]: 'Neutral',
        [ISSUE_FIELDS.aiConfidence]: '0.50',
        [ISSUE_FIELDS.satisfaction]: 'Pending',
        [ISSUE_FIELDS.reportedAt]: new Date().toISOString(),
        [ISSUE_FIELDS.slaDue]: new Date(Date.now() + 864e5).toISOString(),
      });
      if (!created || !created.id) throw new Error('No issue ID returned');
      const echoed = created[ISSUE_FIELDS.slaDue] ? 'custom fields echoed back' : 'WARNING: custom fields not echoed';
      return `${created.id} — ${echoed}`;
    });

    await check('PATCH update issue', async () => {
      if (!created) throw new Error('Nothing to update');
      await zoho.updateIssue(dept.id, created.id, { [ISSUE_FIELDS.satisfaction]: 'Satisfied' });
      return 'updated';
    });

    await check('POST create custom module record (citizen_feedback)', async () => {
      const rec = await zoho.createRecord(MODULES.feedback, {
        name: 'CONNECTIVITY CHECK — safe to delete',
        description: 'Written by tools/verify-zoho.js',
      });
      return rec && rec.id ? String(rec.id) : 'created';
    });

    await check('POST create task (directive execution path)', async () => {
      const t = await zoho.createTask(dept.id, {
        name: 'CONNECTIVITY CHECK — safe to delete',
        description: 'Written by tools/verify-zoho.js',
      });
      return t && t.id ? String(t.id) : 'created';
    });

    if (created) {
      console.log(
        `\n  ${dim(`Delete issue ${created.id} ("CONNECTIVITY CHECK") from the portal by hand.`)}`
      );
    }

    console.log(`\n  ${dim('Remove any remaining "CONNECTIVITY CHECK" records from the portal before recording.')}`);
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n  ${failed.length ? r(`${failed.length} failed`) : g('All checks passed')} · ${results.length} checks\n`);

  if (failed.length) {
    console.log('  Each failure names the operation. The matching function is in');
    console.log('  functions/tnpc_api/zoho-client.js — correct the path there and re-run.');
    console.log('  Read paths failing while OAuth passes usually means a scope was');
    console.log('  omitted when the refresh token was generated.\n');
    process.exit(1);
  }
})().catch((err) => {
  console.error('\n  Unexpected error:', err);
  process.exit(1);
});
