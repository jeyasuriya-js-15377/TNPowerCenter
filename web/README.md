# CM Command Center — Next.js client

Next.js 14 (App Router). The browser calls same-origin `/api`, which proxies to
the API function. Dark and light themes are available on every screen.

```
app/
  layout.jsx        html shell, metadata, global CSS, theme boot
  page.jsx          application shell — session, view routing, shared handlers
  globals.css       design system (dark and light)
  api/[...path]/    server proxy → TNPC_API_URL
lib/
  api.js            fetch wrapper + session storage (base `/api`)
  theme.js          dark / light persistence
  format.js         colour and banding semantics in one place
components/
  Login.jsx         sign-in + the three demo accounts
  TopBar.jsx        navigation, identity, theme toggle
  ThemeToggle.jsx   dark / light switch
  CommandCenter.jsx state pulse · red flags · department matrix · districts
  Complaints.jsx    filterable complaint table
  Directives.jsx    issued directives
  Intake.jsx        citizen intake + live classification result
  Drawer.jsx        red-flag investigation · department 360 · complaint 360
  Toast.jsx         transient notifications
```

## Why plain JavaScript, and no Tailwind

- **JavaScript, not TypeScript.** Removes a type-check step that would block a
  build in a sparse environment.
- **Hand-written CSS, not Tailwind.** `globals.css` is the design system.

## Hosting modes

1. **Next.js (default).** Server routes work, including the `/api` proxy.
   `TNPC_API_URL` in `.env.production` is server-side only.
2. **Static export.** `NEXT_STATIC_EXPORT=true` plus an absolute
   `NEXT_PUBLIC_API_BASE`. Use `npm run web:sync` from the repo root.

## Develop

```bash
npm install
npm run dev
```

Run the backend from the repository root (`node tools/local-server.js` with
credentials from `.env`).

Point the proxy at it with `TNPC_API_URL=http://localhost:4000/server/tnpc_api`.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `TNPC_API_URL` | server (`.env.production`) | API function origin for the `/api` proxy |
| `NEXT_PUBLIC_API_BASE` | build-time, static mode only | Absolute function URL when there is no proxy |
| `NEXT_PUBLIC_BASE_PATH` | build-time | Path prefix if the app is not served at `/` |

Portal credentials never reach the browser.
