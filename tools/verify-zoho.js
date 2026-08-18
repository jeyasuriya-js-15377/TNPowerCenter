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
const { DEPARTMENTS, MODULES, PORTAL_ID, ISSUE_FIELDS } = require('../functions/tnpc_api/zoho-schema');

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

  const dept = DEPARTMENTS[1]; // Municipal & Water — has seeded data

  await check(`GET issues — ${dept.short}`, async () => {
    const issues = await zoho.listIssues(dept.id);
    if (!Array.isArray(issues)) throw new Error('Expected an array of issues');
    const withFields = issues.filter((i) => i[ISSUE_FIELDS.slaDue]);
    return `${issues.length} issues, ${withFields.length} carrying sla_due`;
  });

  await check('GET issues — every department', async () => {
    const counts = await Promise.all(
      DEPARTMENTS.map(async (d) => `${d.short}:${(await zoho.listIssues(d.id)).length}`)
    );
    return counts.join('  ');
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
      await check('Trash the check issue', async () => {
        await zoho.call('POST', `/portal/${PORTAL_ID}/trash`, {
          json: { module: 'issues', items: [String(created.id)] },
        });
        return 'trashed';
      });
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
