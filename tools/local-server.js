'use strict';

/**
 * Local development server.
 *
 * Runs the exact same Catalyst function handler behind the exact same path
 * (/server/tnpc_api/*) and serves the Slate client as static files, so what
 * you see locally is what deploys. Zero dependencies.
 *
 *   ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_REFRESH_TOKEN=... \
 *   node tools/local-server.js
 *
 * Then open http://localhost:4000
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../functions/tnpc_api/index.js');

const PORT = Number(process.env.PORT || 4000);
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'tnpc_web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/server/tnpc_api')) {
    return handler(req, res);
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.join(CLIENT_DIR, rel);

  // Refuse to serve anything outside the client directory.
  if (!file.startsWith(CLIENT_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const configured = Boolean(process.env.ZOHO_REFRESH_TOKEN);
  console.log(`\n  Tamil Nadu Power Center — local\n`);
  console.log(`  UI   http://localhost:${PORT}`);
  console.log(`  API  http://localhost:${PORT}/server/tnpc_api/health`);
  console.log(`  Zoho ${configured ? 'credentials loaded' : 'NOT configured — set ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN'}`);
  console.log(`\n  Sign in as  cm@tnpowercenter.in / PowerCenter@2026\n`);
});
