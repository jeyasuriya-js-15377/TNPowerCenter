# Deploying Tamil Nadu Power Center

Two things must happen: the project portal has to trust the app (OAuth), and the
app has to be hosted. Do them in that order — you can verify step 1 locally
before touching the host at all.

Total time if nothing fights you: about 25 minutes.

---

## Step 1 — Get a portal refresh token

The portal is on the **India** data centre (`projects.zoho.in`), so use the
India API console. Using the `.com` console is the single most common cause of
an `invalid_client` error.

1. Open <https://api-console.zoho.in/> and sign in as **jeyasuriya.js+cm@zohotest.com**
   (the portal owner — the token inherits this account's access).
2. **Add Client → Self Client → Create**.
3. Copy the **Client ID** and **Client Secret**.
4. Open the **Generate Code** tab and enter:

   **Scope** — this exact string is known to work on a `.in` portal:
   ```
   ZohoProjects.projects.ALL,ZohoProjects.tasks.ALL,ZohoProjects.portals.ALL,ZohoProjects.timesheets.ALL,ZohoProjects.bugs.ALL,ZohoProjects.milestones.ALL,ZohoProjects.tags.ALL,ZohoProjects.users.ALL,ZohoProjects.search.READ
   ```

   > **`ZohoProjects.bugs.ALL` is the one that matters most.** In the Projects
   > API "bugs" *are* issues, and every citizen complaint in this app is an
   > issue. Without it the dashboard, the complaint list and the red-flag engine
   > all return nothing.
   >
   > **Reads work with `.READ`; writes need `.ALL`.** Creating a complaint or a
   > directive against a custom module returns `401 INVALID_OAUTHSCOPE` on a
   > read-only token. Use `.ALL` throughout.

   After exchanging the code, **check the `scope` field in the response** before
   going further. If a scope you asked for isn't listed, the console silently
   dropped it and everything depending on it will fail later.

   **Time Duration** `10 minutes`  **Scope Description** `Power Center`

5. Click **Create**, choose the portal, and copy the generated **code**.
   It expires quickly — do step 6 straight away.

6. Exchange the code for a refresh token:

   ```bash
   curl -s -X POST "https://accounts.zoho.in/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=PASTED_CODE"
   ```

   Copy `refresh_token` from the response. **It does not expire** — treat it
   like a password and never commit it.

> If the response contains `"error":"invalid_code"`, the code timed out.
> Generate a new one and retry immediately.

---

## Step 2 — Verify locally before deploying

This runs the identical function handler behind the identical URL path, so a
green run here means the hosted deploy is about configuration only.

```bash
cd ~/zoho-workspace/TNPowerCenter

# logic tests — no credentials needed
npm test          # expect: 21 pass, 0 fail

# full app against live the project portal
ZOHO_CLIENT_ID=xxx \
ZOHO_CLIENT_SECRET=xxx \
ZOHO_REFRESH_TOKEN=xxx \
AUTH_SIGNING_KEY=$(openssl rand -base64 36) \
node tools/local-server.js
```

Open <http://localhost:4000> and sign in as `cm@tnpowercenter.in` /
`PowerCenter@2026`. You should see the State Pulse and the Tiruvallur red flag.

Optionally top up the demo data (adds the 16 complaints defined in
`functions/tnpc_api/seed.js` — the Tiruvallur cluster is already in the portal):

```bash
TOKEN=$(curl -s -X POST localhost:4000/server/tnpc_api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cm@tnpowercenter.in","password":"PowerCenter@2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -X POST localhost:4000/server/tnpc_api/admin/seed -H "Authorization: Bearer $TOKEN"
```

Run this **once**. Running it twice creates duplicates.

---

## Step 3 — Deploy the app

This repo is already linked. From the project root, with `zcatalyst-cli` logged
in to the **India** DC (`catalyst login --dc in`):

```bash
npm install -g zcatalyst-cli
catalyst login --dc in
catalyst project:use 48567000000013058 --dc in --org 60083738829
```

[`catalyst.json`](../catalyst.json) already names the function `tnpc_api` and
the hosted UI `tnpc-web` (source: `web/`, framework Next.js). Do **not** run
`catalyst init` here — it will drop a boilerplate over `web/`.

### UI and function are on different domains

```
UI        https://<app>.onslate.in                          ← the hosted UI
API       https://tnpowercenter-60083738829.development.catalystserverless.in/server/tnpc_api
```

The Next.js app proxies `/api/*` to the function using the server-only
`TNPC_API_URL` in `web/.env.production`. The browser never calls the function
directly, so CORS is not required on this path.

**Deploy the function. The hosted UI does not host it:**

```bash
catalyst deploy --only functions
```

Set function environment variables in the hosting console (Development), or
pass them at deploy time via a local-only `env_variables` block that you do
not commit:

| Key | Value |
|---|---|
| `ZOHO_CLIENT_ID` | from step 1 |
| `ZOHO_CLIENT_SECRET` | from step 1 |
| `ZOHO_REFRESH_TOKEN` | from step 1 |
| `ZOHO_PORTAL_ID` | `60083686827` |
| `ZOHO_ACCOUNTS_BASE` | `https://accounts.zoho.in` |
| `ZOHO_API_BASE` | `https://projects.zoho.in/api/v3` |
| `AUTH_SIGNING_KEY` | any long random string |

Confirm:

```bash
curl https://tnpowercenter-60083738829.development.catalystserverless.in/server/tnpc_api/health
```

Expect `"status":"ok"` and `"portalConfigured":true`.

**Deploy the UI:**

```bash
catalyst deploy slate -m "TNPowerCenter Next.js UI"
```

The CLI prints the app URL, e.g. `https://tnpc-web-dyggvgva.onslate.in`.

If the Next.js host fails, the verified fallback is a static export:

```bash
cd web
NEXT_STATIC_EXPORT=true \
NEXT_PUBLIC_API_BASE=https://tnpowercenter-60083738829.development.catalystserverless.in/server/tnpc_api \
  npm run build
cd ..
npm run web:sync
```

Then relink the hosted UI as **Static** with source `client/tnpc_web`, and
whitelist that origin under the project's CORS domains. Leave
`SEND_CORS_HEADERS` unset on the function.

---

## Step 4 — Confirm it is live

```bash
curl https://tnpowercenter-60083738829.development.catalystserverless.in/server/tnpc_api/health
```

Expect `"status":"ok"` and `"portalConfigured":true`. If `portalConfigured` is
`false`, the environment variables did not reach the function — set them on
Development and redeploy.

Then open the app URL (`https://tnpc-web-dyggvgva.onslate.in`) and sign in.

---

## When it doesn't work

Symptoms and their actual causes, in the order you're likely to meet them.

**`401 INVALID_TOKEN` on every route, even `/health`.**
Something is sending an `Authorization: Bearer …` header. The host platform validates
that header as one of *its own* OAuth tokens and rejects the request before your
code runs. This app carries its session in **`X-App-Token`** for exactly that
reason — if you're testing with curl, use that header, not `Authorization`.

**CORS error saying the header "contains multiple values".**
Both the host platform and the function are setting `Access-Control-Allow-Origin`.
Whitelist the UI origin in the hosting console and leave
`SEND_CORS_HEADERS` unset so the function stays quiet.

**CORS error with no `Access-Control-Allow-Origin` at all.**
The opposite: the UI origin isn't whitelisted. The platform answers `OPTIONS`
itself, so an in-function handler can never fix this.

**Dashboard 502s on the first request after an idle period, then works.**
Cold start with several parallel portal reads racing to refresh the token.
`zoho-client.js` coalesces concurrent refreshes onto a single request to prevent
this — if you see it, that logic has been altered.

**`401 INVALID_OAUTHSCOPE` on writes only.**
Your refresh token has read scopes. Regenerate with `.ALL` (see step 1).

**Reads 404 with a token that is definitely valid.**
Try the alternate API host in `.env`:
`ZOHO_API_BASE=https://projectsapi.zoho.in/api/v3`

**The UI is stale after a redeploy.**
The host platform caches client assets. Hard-refresh (⌘⇧R). The API sends
`Cache-Control: no-store`, so data is never stale — only the bundle.

**Numbers behave like text (totals concatenating).**
API v3 returns `Numeric` fields as strings and `Double` as numbers. Coerce with
`Number()` — the engine already does this for `ai_confidence`.

---

## Rotating out of the demo

Before this is anything other than a demo:

- Replace the three hard-coded accounts in `functions/tnpc_api/auth.js` with
  platform authentication and enforce MFA on any account holding
  `directive:issue`.
- Move the signing key to a secret store rather than an environment variable.
- Delete every record labelled `DEMO DATA` from the portal.

These are listed honestly in `docs/WHAT_BROKE.md` rather than left implied.
