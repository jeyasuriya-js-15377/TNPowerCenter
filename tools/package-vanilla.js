'use strict';

/**
 * Packages the zero-dependency client for upload to Catalyst Slate.
 *
 *   node tools/package-vanilla.js https://your-project.../server/tnpc_api
 *
 * No npm install, no build step, no framework adapter. Three files.
 *
 * The API base is injected into index.html at package time, so the client can
 * be served from any origin and still reach the Catalyst function. Pass no
 * argument to leave it same-origin (/server/tnpc_api).
 *
 * Produces dist/tnpc-web-vanilla.zip with index.html at the top level, which is
 * the shape Slate expects for a static site.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'client', 'tnpc_web_vanilla');
const STAGE = path.join(ROOT, 'dist', 'vanilla');
const ARCHIVE = path.join(ROOT, 'dist', 'tnpc-web-vanilla.zip');

const apiBase = (process.argv[2] || '').replace(/\/+$/, '');

if (!fs.existsSync(path.join(SOURCE, 'index.html'))) {
  console.error(`\n  Missing ${path.relative(ROOT, SOURCE)}/index.html\n`);
  process.exit(1);
}

// Clearing the stage is housekeeping, not a requirement — the three files are
// rewritten from source every run, so a filesystem that refuses deletes (some
// mounted volumes do) must not stop the packaging.
try {
  fs.rmSync(STAGE, { recursive: true, force: true });
} catch {
  /* fall through and overwrite in place */
}
fs.mkdirSync(STAGE, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css']) {
  fs.copyFileSync(path.join(SOURCE, file), path.join(STAGE, file));
}

// Inject the API base ahead of app.js, which reads window.TNPC_API_BASE.
if (apiBase) {
  const target = path.join(STAGE, 'index.html');
  let html = fs.readFileSync(target, 'utf8');
  const inject = `<script>window.TNPC_API_BASE = ${JSON.stringify(apiBase)};</script>\n<script src="app.js"></script>`;

  if (!html.includes('<script src="app.js"></script>')) {
    console.error('\n  Could not find the app.js script tag in index.html.\n');
    process.exit(1);
  }
  html = html.replace('<script src="app.js"></script>', inject);
  fs.writeFileSync(target, html);
}

console.log('\n  Prepared the zero-dependency client for Catalyst Slate\n');
console.log(`  folder: ${path.relative(ROOT, STAGE)}`);
console.log(`  files:  index.html  app.js  styles.css`);
console.log(`  API:    ${apiBase || 'same origin (/server/tnpc_api)'}\n`);

// Zipping is a convenience. If the platform refuses, the folder is still the
// deliverable — Slate accepts a folder upload just as happily.
let zipped = false;
try {
  fs.rmSync(ARCHIVE, { force: true });
  execFileSync('zip', ['-qr', ARCHIVE, '.', '-x', '.DS_Store'], { cwd: STAGE });
  zipped = fs.existsSync(ARCHIVE) && fs.statSync(ARCHIVE).size > 0;
} catch {
  zipped = false;
}

if (zipped) {
  console.log(`  zip:    ${path.relative(ROOT, ARCHIVE)}   ${(fs.statSync(ARCHIVE).size / 1024).toFixed(0)} KB\n`);
} else {
  console.log('  Could not write the zip on this filesystem — upload the folder instead,');
  console.log('  or run:  cd dist/vanilla && zip -r ../tnpc-web-vanilla.zip .\n');
}

console.log('  Upload as a STATIC site. There is nothing to build.');
console.log(`  Test first:  cd ${path.relative(ROOT, STAGE)} && python3 -m http.server 8080\n`);
