'use strict';

/**
 * Copies the Next.js static export into client/tnpc_web.
 *
 *   cd web && npm install && NEXT_STATIC_EXPORT=true npm run build
 *   node tools/sync-web.js
 *
 * client-package.json is preserved — it is not part of the Next.js output.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'web', 'out');
const TARGET = path.join(ROOT, 'client', 'tnpc_web');
const PRESERVE = new Set(['client-package.json']);

if (!fs.existsSync(SOURCE)) {
  console.error(`\n  No export found at web/out\n`);
  console.error(`  Build it first:\n`);
  console.error(`    cd web && npm install && NEXT_PUBLIC_BASE_PATH=/app npm run build\n`);
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

// Clear everything except the files this folder must keep.
let removed = 0;
for (const entry of fs.readdirSync(TARGET, { withFileTypes: true })) {
  if (PRESERVE.has(entry.name)) continue;
  fs.rmSync(path.join(TARGET, entry.name), { recursive: true, force: true });
  removed += 1;
}

copyDir(SOURCE, TARGET);

const count = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1),
    0
  );

console.log(`\n  Synced Next.js export → client/tnpc_web`);
console.log(`  ${removed} old entr${removed === 1 ? 'y' : 'ies'} cleared, ${count(TARGET)} files in place`);

if (!fs.existsSync(path.join(TARGET, 'index.html'))) {
  console.log(`\n  WARNING: no index.html at the root of the export.`);
  console.log(`  Check that the export produced index.html at the folder root.\n`);
} else {
  console.log(`\n  Ready: catalyst deploy\n`);
}
