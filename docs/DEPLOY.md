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

   **Scope**
   ```
   ZohoProjects.portals.READ,ZohoProjects.projects.ALL,ZohoProjects.bugs.ALL,ZohoProjects.tasks.ALL,ZohoProjects.users.READ,ZohoProjects.entity.ALL,ZohoProjects.customfields.ALL,ZohoProjects.customviews.READ
   ```

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

**Build the Next.js client first**, back in this repository:

```bash
cd ~/zoho-workspace/TNPowerCenter
npm run web:install     # installs Next.js into web/
npm run web:ship        # static export → synced into client/tnpc_web/
```

`web:ship` builds with `basePath=/app`, which is how Slate normally serves the
client. If your deployed URL turns out to serve `index.html` from the domain
root instead, rebuild with `npm run web:build:root && npm run web:sync`.

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
Only make sure the function's `main` / `source` points at `index.js`.

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

## If the client cannot reach the API

`client/tnpc_web/app.js` defaults to the same-origin path `/server/tnpc_api`,
which is how Catalyst serves Advanced I/O functions. If your setup differs, add
one line to `index.html` above the `app.js` script tag:

```html
<script>window.TNPC_API_BASE = 'https://<your-domain>/server/tnpc_api';</script>
```

CORS is already permitted by the function, so a cross-origin base works.

---

## Rotating out of the demo

Before this is anything other than a demo:

- Replace the three hard-coded accounts in `functions/tnpc_api/auth.js` with
  Catalyst Authentication and enforce MFA on any account holding
  `directive:issue`.
- Move the signing key to a secret store rather than an environment variable.
- Delete every record labelled `DEMO DATA` from the portal.

These are listed honestly in `docs/WHAT_BROKE.md` rather than left implied.
