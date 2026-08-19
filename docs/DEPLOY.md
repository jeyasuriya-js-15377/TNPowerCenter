# Deploying Tamil Nadu Power Center

Two things must happen: Zoho Projects has to trust the app (OAuth), and the app
has to get onto Catalyst. Do them in that order — you can verify step 1 locally
before touching Catalyst at all.

Total time if nothing fights you: about 25 minutes.

---

## Step 1 — Get a Zoho Projects refresh token

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
green run here means the Catalyst deploy is about configuration only.

```bash
cd ~/zoho-workspace/TNPowerCenter

# logic tests — no credentials needed
npm test          # expect: 21 pass, 0 fail

# full app against live Zoho Projects
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

## Step 3 — Deploy to Catalyst

Let the CLI generate the project scaffolding, then drop these folders in. That
avoids any mismatch between my hand-written config and your CLI version.

```bash
npm install -g zcatalyst-cli
catalyst login          # use the same Zoho account
```

**Create the project scaffold in a scratch directory:**

```bash
mkdir ~/tnpc-deploy && cd ~/tnpc-deploy
catalyst init
#   → Create a new project   → name it: TNPowerCenter
#   → select BOTH: Functions and Client
#   Functions: type "Advanced I/O", stack "Node", name it exactly  tnpc_api
#   Client:    name it exactly  tnpc_web
```

### Slate and the function are on different domains

This is the single most important thing to internalise before building the
client:

```
UI        https://<something>.onslate.in                    ← Catalyst Slate
API       https://<project>.development.catalystserverless.in/server/tnpc_api
```

Two different origins. **A relative API path will not work**, and every call is
cross-origin. So the client must be built with an absolute API base:

```bash
cd ~/zoho-workspace/TNPowerCenter
npm run web:install

cd web
NEXT_PUBLIC_API_BASE=https://<project>.development.catalystserverless.in/server/tnpc_api \
  npm run build
cd ..
npm run web:sync && npm run web:package
```

Get that hostname from the function deploy output, and confirm it answers
`/server/tnpc_api/health` before you build against it.

Then, in the Catalyst console, **whitelist the Slate origin under the project's
CORS domains**. Catalyst intercepts `OPTIONS` at the platform level, so this is
the only place CORS can be configured — the function deliberately sends no CORS
headers of its own, because a duplicated `Access-Control-Allow-Origin` makes the
browser reject the response entirely.

For the vanilla client the equivalent is one command:

```bash
node tools/package-vanilla.js https://<project>.development.catalystserverless.in/server/tnpc_api
```

> **If `next build` fails and time is short**, the original zero-build client is
> preserved at `client/tnpc_web_vanilla/`. Copy its three files into
> `client/tnpc_web/` and carry on — it needs no build step and is known to work.
> Nothing else in the deploy changes.

**Copy the source over the generated scaffold:**

```bash
cd ~/tnpc-deploy
SRC=~/zoho-workspace/TNPowerCenter

cp $SRC/functions/tnpc_api/*.js  functions/tnpc_api/
cp -r $SRC/client/tnpc_web/*     client/tnpc_web/
```

Keep the CLI's generated `catalyst-config.json` and `client-package.json`.
Two things the CLI cares about: the function's `main` / `source` must point at
`index.js`, and `catalyst.json` needs an explicit `functions.targets` array —
a `source` alone is not enough.

**Deploy the function with the CLI. Slate does not host functions:**

```bash
catalyst deploy --only functions
```

**Deploy the UI through Slate**, which reads from GitHub rather than the CLI.
In the Catalyst console → **Slate**, connect the repository, branch `main`, and
set:

| Setting | Value |
|---|---|
| Framework | **Static** |
| Root directory | `client/tnpc_web` |

Root directory is not optional — point Slate at the repository root and `/`
serves a 404, because `index.html` is one level down. Choosing **Static** also
stops Slate running its own `npm run build`, which is what fails when the
Next.js app lives in a subfolder.

**Set the environment variables** in the Catalyst console →
*Project → Settings → Environment Variables* (production environment):

| Key | Value |
|---|---|
| `ZOHO_CLIENT_ID` | from step 1 |
| `ZOHO_CLIENT_SECRET` | from step 1 |
| `ZOHO_REFRESH_TOKEN` | from step 1 |
| `ZOHO_PORTAL_ID` | `60083686827` |
| `ZOHO_ACCOUNTS_BASE` | `https://accounts.zoho.in` |
| `ZOHO_API_BASE` | `https://projects.zoho.in/api/v3` |
| `AUTH_SIGNING_KEY` | any long random string |

**Deploy:**

```bash
catalyst deploy
```

The CLI prints your Slate URL, something like
`https://tnpowercenter-XXXXXXXXX.development.catalystserverless.in/app/index.html`

---

## Step 4 — Confirm it is live

```bash
curl https://<your-catalyst-domain>/server/tnpc_api/health
```

Expect `"status":"ok"` and `"zohoConfigured":true`. If `zohoConfigured` is
`false`, the environment variables did not reach the production environment —
check you set them on the right environment and redeploy.

Then open the Slate URL and sign in.

---

## When it doesn't work

Symptoms and their actual causes, in the order you're likely to meet them.

**`401 INVALID_TOKEN` on every route, even `/health`.**
Something is sending an `Authorization: Bearer …` header. Catalyst validates
that header as one of *its own* OAuth tokens and rejects the request before your
code runs. This app carries its session in **`X-App-Token`** for exactly that
reason — if you're testing with curl, use that header, not `Authorization`.

**CORS error saying the header "contains multiple values".**
Both Catalyst and the function are setting `Access-Control-Allow-Origin`.
Whitelist the Slate origin in the Catalyst console and leave
`SEND_CORS_HEADERS` unset so the function stays quiet.

**CORS error with no `Access-Control-Allow-Origin` at all.**
The opposite: the Slate origin isn't whitelisted. Catalyst answers `OPTIONS`
itself, so an in-function handler can never fix this.

**Dashboard 502s on the first request after an idle period, then works.**
Cold start with several parallel Zoho reads racing to refresh the token.
`zoho-client.js` coalesces concurrent refreshes onto a single request to prevent
this — if you see it, that logic has been altered.

**`401 INVALID_OAUTHSCOPE` on writes only.**
Your refresh token has read scopes. Regenerate with `.ALL` (see step 1).

**Reads 404 with a token that is definitely valid.**
Try the alternate API host in `.env`:
`ZOHO_API_BASE=https://projectsapi.zoho.in/api/v3`

**The UI is stale after a redeploy.**
Catalyst caches client assets. Hard-refresh (⌘⇧R). The API sends
`Cache-Control: no-store`, so data is never stale — only the bundle.

**Numbers behave like text (totals concatenating).**
Zoho v3 returns `Numeric` fields as strings and `Double` as numbers. Coerce with
`Number()` — the engine already does this for `ai_confidence`.

---

## Rotating out of the demo

Before this is anything other than a demo:

- Replace the three hard-coded accounts in `functions/tnpc_api/auth.js` with
  Catalyst Authentication and enforce MFA on any account holding
  `directive:issue`.
- Move the signing key to a secret store rather than an environment variable.
- Delete every record labelled `DEMO DATA` from the portal.

These are listed honestly in `docs/WHAT_BROKE.md` rather than left implied.
