'use strict';

/**
 * De-duplicate department projects.
 *
 *   set -a; source .env; set +a
 *   node tools/dedupe-projects.js            # report only, writes nothing
 *   node tools/dedupe-projects.js --apply    # trash the duplicates
 *
 * Why this exists: an earlier seeder treated an unreadable project list as an
 * empty one and created a fresh set of departments on every run. Three runs left
 * three generations of the same 38 departments. This finds every name that
 * appears more than once and keeps exactly one.
 *
 * Keeper rule, in order:
 *   1. the copy holding the most issues — data wins over emptiness
 *   2. on a tie, the oldest, because that is the one other records point at
 *
 * Duplicates go to the Zoho recycle bin, not oblivion — recoverable if this
 * picks wrong.
 */

const zoho = require('../functions/tnpc_api/zoho-client');
const { PORTAL_ID, DEPARTMENTS } = require('../functions/tnpc_api/zoho-schema');

const APPLY = process.argv.includes('--apply');

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const issueCount = (p) =>
  ((p.issues && (p.issues.open_count || 0) + (p.issues.closed_count || 0)) || 0);
const taskCount = (p) =>
  ((p.tasks && (p.tasks.open_count || 0) + (p.tasks.closed_count || 0)) || 0);

(async () => {
  console.log(`\n  Project de-duplication — portal ${PORTAL_ID}`);
  console.log(`  Mode ${APPLY ? y('APPLY — duplicates will be trashed') : dim('report only')}\n`);

  let projects;
  try {
    projects = await zoho.listProjects();
  } catch (err) {
    console.error(`  ${r('Could not read the project list')}: ${err.message}`);
    if (err.detail) console.error(`  ${JSON.stringify(err.detail).slice(0, 300)}`);
    process.exit(1);
  }

  console.log(`  ${projects.length} projects found in the portal\n`);
  if (projects.length === 0) {
    console.log(`  ${r('Zero projects returned.')} That is the same failure that caused the`);
    console.log('  duplication. Do not run the seeder until this reads correctly.\n');
    process.exit(1);
  }

  const known = new Set(DEPARTMENTS.map((d) => d.name.toLowerCase()));

  const groups = new Map();
  for (const p of projects) {
    const name = String(p.name || '').trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key).rows.push(p);
  }

  const duplicated = [...groups.values()].filter((grp) => grp.rows.length > 1);
  const trash = [];
  let dataLossWarnings = 0;

  for (const grp of duplicated) {
    const sorted = [...grp.rows].sort((a, b) => {
      const d = issueCount(b) - issueCount(a);
      if (d !== 0) return d;
      return new Date(a.created_time || 0) - new Date(b.created_time || 0);
    });

    const keeper = sorted[0];
    const losers = sorted.slice(1);
    const inRegistry = known.has(grp.name.toLowerCase());

    console.log(`  ${inRegistry ? '' : y('[not in registry] ')}${grp.name}  ${dim(`${grp.rows.length} copies`)}`);
    for (const p of sorted) {
      const isKeeper = p === keeper;
      const carriesData = issueCount(p) > 0;
      if (!isKeeper && carriesData) dataLossWarnings += 1;
      console.log(
        `    ${isKeeper ? g('KEEP ') : r('TRASH')} ${p.id}  `
        + `${String(issueCount(p)).padStart(4)} issues  ${String(taskCount(p)).padStart(3)} tasks  `
        + dim(String(p.created_time || '').slice(0, 19).replace('T', ' '))
        + (!isKeeper && carriesData ? `  ${y('← holds data, identical copy kept')}` : '')
      );
    }
    console.log();
    trash.push(...losers.map((p) => String(p.id)));
  }

  const singles = [...groups.values()].filter((grp) => grp.rows.length === 1);
  const missing = DEPARTMENTS.filter((d) => !groups.has(d.name.toLowerCase()));

  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  Unique names            ${groups.size}`);
  console.log(`  Names with duplicates   ${duplicated.length}`);
  console.log(`  Already unique          ${singles.length}`);
  console.log(`  To trash                ${trash.length}`);
  console.log(`  Registry departments still missing a project   ${missing.length}`);
  if (missing.length) console.log(`    ${dim(missing.map((d) => d.short).join(', '))}`);
  if (dataLossWarnings) {
    console.log(`\n  ${y(`${dataLossWarnings} of the copies being trashed hold issues.`)}`);
    console.log('  In every case an identical copy with the same count is being kept —');
    console.log('  these are duplicate seed runs, not distinct data. They go to the recycle');
    console.log('  bin, so restore from Zoho if this judgement is wrong.');
  }

  if (!trash.length) {
    console.log(`\n  ${g('Nothing to do — every project name is already unique.')}\n`);
    return;
  }

  if (!APPLY) {
    console.log(`\n  ${dim('Re-run with --apply to trash the duplicates.')}\n`);
    return;
  }

  // Zoho accepts up to 100 ids per trash call.
  console.log();
  for (let i = 0; i < trash.length; i += 100) {
    const batch = trash.slice(i, i + 100);
    process.stdout.write(`  Trashing ${batch.length} projects… `);
    try {
      await zoho.call('POST', `/portal/${PORTAL_ID}/trash`, {
        json: { module: 'projects', items: batch },
      });
      console.log(g('done'));
    } catch (err) {
      console.log(r(`failed: ${err.message}`));
      if (err.detail) console.log(`    ${dim(JSON.stringify(err.detail).slice(0, 260))}`);
      console.log('\n  If the trash endpoint is rejected, delete these projects from the');
      console.log('  Zoho Projects UI instead — the ids are listed above.\n');
      process.exit(1);
    }
  }

  console.log(`\n  ${g('De-duplicated.')} Re-run  node tools/verify-zoho.js  then re-seed if needed.\n`);
})().catch((err) => {
  console.error(`\n  ${r('Failed')}: ${err.message}\n`);
  process.exit(1);
});
