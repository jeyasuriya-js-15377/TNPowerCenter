'use strict';

/**
 * Print the raw Zoho response for a custom module, exactly as the API returns it.
 *
 *   set -a; source .env; set +a
 *   node tools/peek.js cm_directive
 *
 * Use this when the app shows nothing and you need to know whether the records
 * are missing, or present but shaped differently than the mapper expects.
 */

const zoho = require('../functions/tnpc_api/zoho-client');
const { PORTAL_ID, DIRECTIVE_FIELDS, FEEDBACK_FIELDS } = require('../functions/tnpc_api/zoho-schema');

const moduleName = process.argv[2] || 'cm_directive';

(async () => {
  console.log(`\n  Portal ${PORTAL_ID} · module "${moduleName}"\n`);

  // The unwrapped envelope first — this is what listRecords() sees.
  let raw;
  try {
    raw = await zoho.call('GET', `/portal/${PORTAL_ID}/module/${moduleName}/entities`, {
      query: { per_page: 200 },
    });
  } catch (err) {
    console.error(`  Request failed: ${err.message}`);
    if (err.detail) console.error(`  ${JSON.stringify(err.detail)}`);
    process.exit(1);
  }

  console.log('  Top-level keys:', Object.keys(raw || {}).join(', ') || '(none)');

  const records = await zoho.listRecords(moduleName);
  console.log(`  Records parsed: ${records.length}\n`);

  if (!records.length) {
    console.log('  No records. Either none exist, or they are under a key the parser');
    console.log('  does not know about. Full response:\n');
    console.log(JSON.stringify(raw, null, 2).slice(0, 2500));
    return;
  }

  records.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i}] id=${r.id}  name=${JSON.stringify(r.name)}`);
    const custom = Object.keys(r).filter(
      (k) => !['id', 'name', 'description', 'created_time', 'updated_time', 'created_by',
               'updated_by', 'status', 'layout', 'is_closed', 'is_external',
               'comments_count', 'attachments_count'].includes(k)
    );
    console.log(`       custom fields present: ${custom.join(', ') || '(none)'}`);
  });

  if (moduleName === 'cm_directive') {
    console.log('\n  Field names the app expects:');
    for (const [k, v] of Object.entries(DIRECTIVE_FIELDS)) {
      const present = records.some((r) => r[v] !== undefined);
      console.log(`       ${present ? 'found  ' : 'MISSING'} ${k} → ${v}`);
    }
  }
  if (moduleName === 'citizen_feedback') {
    console.log('\n  Field names the app expects:');
    for (const [k, v] of Object.entries(FEEDBACK_FIELDS)) {
      const present = records.some((r) => r[v] !== undefined);
      console.log(`       ${present ? 'found  ' : 'MISSING'} ${k} → ${v}`);
    }
  }
  console.log();
})();
