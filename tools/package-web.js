'use strict';

/**
 * Packages the Next.js static export for upload to the Catalyst Slate console.
 *
 *   cd web && npm install && npm run build
 *   node tools/package-web.js
 *
 * Produces dist/tnpc-web.zip containing the CONTENTS of web/out (index.html at
 * the top level, not nested inside a folder) — which is what Slate expects.
 *
 * Uses the system `zip`, present on macOS by default.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'web', 'out');
const DIST = path.join(ROOT, 'dist');
const ARCHIVE = path.join(DIST, 'tnpc-web.zip');

if (!fs.existsSync(SOURCE)) {
  console.error('\n  No export found at web/out\n');
  console.error('  Build it first:\n');
  console.error('    cd web && npm install && npm run build\n');
  process.exit(1);
}

if (!fs.existsSync(path.join(SOURCE, 'index.html'))) {
  console.error('\n  web/out has no index.html — the export did not complete.\n');
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
fs.rmSync(ARCHIVE, { force: true });

// Zip from inside web/out so paths are relative to it, not to the repo.
execFileSync('zip', ['-qr', ARCHIVE, '.', '-x', '.DS_Store'], { cwd: SOURCE });

const bytes = fs.statSync(ARCHIVE).size;
const entries = fs
  .readdirSync(SOURCE, { withFileTypes: true })
  .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

console.log('\n  Packaged Next.js export for Catalyst Slate\n');
console.log(`  ${path.relative(ROOT, ARCHIVE)}   ${(bytes / 1024).toFixed(0)} KB`);
console.log(`  top level: ${entries.join('  ')}\n`);
console.log('  Upload this zip in the Slate console as a STATIC site.');
console.log('  Do not let it run a build — the files are already built.\n');
