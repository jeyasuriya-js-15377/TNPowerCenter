# CM Command Center — Next.js client

Next.js 14 (App Router), statically exported for Catalyst Slate.

```
app/
  layout.jsx        html shell, metadata, global CSS
  page.jsx          application shell — session, view routing, shared handlers
  globals.css       design system (dark, dense, calm)
lib/
  api.js            fetch wrapper for the Catalyst function + session storage
  format.js         colour and banding semantics in one place
components/
  Login.jsx         sign-in + the three demo accounts
  TopBar.jsx        navigation and identity
  CommandCenter.jsx state pulse · red flags · department matrix · districts
  Complaints.jsx    filterable complaint table
  Directives.jsx    issued directives
  Intake.jsx        citizen intake + live classification result
  Drawer.jsx        red-flag investigation · department 360 · complaint 360
  Toast.jsx         transient notifications
```

## Why plain JavaScript, and no Tailwind

Two deliberate choices, both about build reliability:

- **JavaScript, not TypeScript.** This client was written in an environment with
  no package registry, so `next build` could never be run against it before
  handing it over. Removing the type-check step removes the one class of error
  that would block a build nobody had been able to try.
- **Hand-written CSS, not Tailwind.** `globals.css` is the same stylesheet the
  original vanilla client used, already proven in the browser. Adding Tailwind
  would introduce PostCSS configuration to a build that could not be verified,
  for no visual gain.

Migrating either is straightforward later; neither is load-bearing.

## Static export

Catalyst Slate serves static files, so `next.config.mjs` sets
`output: 'export'`. There is no SSR and there are no API routes — the backend is
the Catalyst Advanced I/O function at `/server/tnpc_api`.

Everything is a client component: the app is behind a login and every view is
per-user, so there is nothing meaningful to prerender. Session restore happens
in an effect rather than during render, because `sessionStorage` does not exist
at export time.

## Develop

```bash
npm install

# point the client at your running Catalyst function (or the local server)
NEXT_PUBLIC_API_BASE=http://localhost:4000/server/tnpc_api npm run dev
```

Then run the backend in another terminal from the repository root:

```bash
ZOHO_CLIENT_ID=… ZOHO_CLIENT_SECRET=… ZOHO_REFRESH_TOKEN=… node tools/local-server.js
```

## Build and ship

From the repository root:

```bash
npm run web:ship      # builds with basePath=/app, then syncs into client/tnpc_web
catalyst deploy
```

If your Slate URL serves `index.html` from the domain root rather than `/app`,
build without the prefix instead:

```bash
npm run web:build:root && npm run web:sync
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `/server/tnpc_api` | Where the Catalyst function lives |
| `NEXT_PUBLIC_BASE_PATH` | *(none)* | Path prefix Slate serves the client under |

Both are read at build time. No secret is ever exposed to the browser — every
Zoho call goes through the function.

## Fallback

The original zero-build client is preserved at `client/tnpc_web_vanilla/`. If
the export misbehaves close to a deadline, copy those three files into
`client/tnpc_web/` and deploy. It has no build step and is known to work.
