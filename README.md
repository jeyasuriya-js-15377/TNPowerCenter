# Tamil Nadu Power Center

**An executive operating system for government performance, running entirely on
Zoho Projects and deployed on Zoho Catalyst.**

Built for the Zoho Projects 20th anniversary challenge.
Industry: **Government / Public Administration**.

---

## The problem

Every state government already collects citizen complaints. Almost none can
answer the question a Chief Minister actually asks:

> Is the government working? Where is it failing? Who is accountable?
> Did my intervention change anything?

Complaints live in one system, department performance in spreadsheets, executive
decisions in files. Nothing connects the citizen's experience to the minister's
desk and back again. The loop never closes.

## What this does

Power Center closes the loop:

```
Citizen complaint → classification → routing → accountable officer
   → SLA monitoring → resolution → citizen validation
   → department score → state pulse → red flag
   → CM directive → execution in Zoho → verified outcome
```

Everything above happens inside Zoho Projects. There is no external database.

---

## How Zoho Projects becomes the database

| Government concept | Zoho Projects primitive |
|---|---|
| Secretariat department | **Project** |
| Citizen complaint | **Issue** |
| Complaint lifecycle | Native issue statuses — `Open → InProgress → ToBeTested → Closed`, plus `Reopen` |
| Priority | Native **severity** picklist |
| Officer | Portal **user** (ZPUID) |
| Directive execution | **Task** in the responsible department's project |
| District | Custom module `district` |
| CM directive | Custom module `cm_directive` |
| Citizen validation | Custom module `citizen_feedback` |
| Executive red flag | Computed live; actioned flags stored in `red_flag` |

Complaint-specific data lives in eight custom fields on the Issues module:
`citizen_ref`, `district`, `complaint_category`, `sentiment`, `ai_confidence`,
`citizen_satisfaction`, `sla_due`, `reported_at`.

**Every module, field and demo record was created through the Zoho Projects MCP
server.** The ID map is in `functions/tnpc_api/zoho-schema.js`.

`ToBeTested` meaning *resolved, pending verification* turned out to be an exact
fit for *awaiting citizen validation*, so the complaint lifecycle needed zero
status configuration.

---

## What the app adds that Zoho does not

Zoho Projects is an excellent execution engine. It is not an executive
intelligence layer. `functions/tnpc_api/engine.js` supplies that, as pure
functions with no I/O and an injected clock:

- **SLA engine** — Power Center owns the deadline. Warns `AT_RISK` *before*
  breach, not after. Policy is a config table, not code.
- **Department scorecard** — configurable weights across citizen outcome,
  complaint performance, SLA and risk. Reports **coverage**, and returns
  `DATA_GAP` rather than a flattering score when data is thin.
- **Red-flag engine** — attention-scored exceptions. Surfaces district clusters
  and severe breaches; stays silent when nothing is wrong.
- **Classifier** — a deterministic lexicon, not a black box. Every routing
  decision shows the terms that produced it and the alternatives considered.
  Below the confidence threshold it asks a human instead of guessing.

## Two rules the code will not bend

1. **A department cannot close a complaint the citizen has rejected.**
   `POST /complaints/:id/status` with `CLOSED` returns `422` unless the citizen
   has accepted. Administrative closure cannot erase dissatisfaction.
2. **Missing data is never good news.** A department with too little data scores
   `null` and reads `DATA_GAP` — never 100.

## Visibility is not authority

Three roles ship with the demo:

| Role | Sees | Can issue directives |
|---|---|---|
| Chief Minister | Everything | **Yes** |
| CM War Room analyst | Everything | **No** |
| Minister control team | One department | No |

The War Room analyst has full statewide visibility and is refused when they
attempt to issue a directive — on the server, with an explanation, not by
hiding a button. `tests/engine.test.js` asserts this.

---

## Run it

```bash
npm test            # 21 tests, no credentials needed
npm run check       # syntax check every file
```

Full application against live Zoho Projects:

```bash
ZOHO_CLIENT_ID=… ZOHO_CLIENT_SECRET=… ZOHO_REFRESH_TOKEN=… \
AUTH_SIGNING_KEY=$(openssl rand -base64 36) \
node tools/local-server.js
# → http://localhost:4000
```

`tools/local-server.js` mounts the identical Catalyst handler behind the
identical `/server/tnpc_api` path, so local behaviour matches deployment.

**Demo accounts**

| Email | Password |
|---|---|
| `cm@tnpowercenter.in` | `PowerCenter@2026` |
| `warroom@tnpowercenter.in` | `WarRoom@2026` |
| `water@tnpowercenter.in` | `Water@2026` |

Deployment: **`docs/DEPLOY.md`**.

---

## Layout

```
functions/tnpc_api/      Catalyst Advanced I/O function — zero npm dependencies
  index.js               routing, authn/authz, endpoints
  engine.js              SLA · scorecard · pulse · red flags · classifier (pure)
  zoho-client.js         Zoho Projects REST client + OAuth refresh
  zoho-schema.js         the ID map and every configurable policy
  auth.js                permission sets, scopes, session tokens
  seed.js                demo data definitions
web/                     Next.js 14 App Router client, statically exported
  app/                   layout, shell, design system
  components/            command centre · complaints · directives · intake · drawer
  lib/                   api client, presentation semantics
client/tnpc_web/         Catalyst Slate deploy artifact (the Next.js export)
client/tnpc_web_vanilla/ zero-build fallback client — no build step, known good
tools/local-server.js    run the backend locally
tools/verify-zoho.js     probe every Zoho REST path the app depends on
tools/sync-web.js        copy the Next.js export into the Slate folder
tests/engine.test.js     21 tests
docs/                    DEPLOY · SUBMISSION · WHAT_BROKE · VIDEO_SCRIPT · ARCHITECTURE
```

**Build the client**

```bash
npm run web:install    # Next.js into web/
npm run web:ship       # static export → client/tnpc_web/
```

The backend has zero runtime dependencies and needs no build. Next.js is the
only thing in the repository that installs anything, and the vanilla fallback
client exists precisely so a failed frontend build can never block a deploy.

---

## Honest limitations

Written up properly in **`docs/WHAT_BROKE.md`**. The short version: the demo
uses hand-rolled session tokens and three hard-coded accounts instead of
Catalyst Authentication with MFA; the red-flag engine covers clusters and severe
breaches but not cross-department correlation; and there is no historical
case-matching yet. All are called out in the code where they matter.

**All data in the portal is clearly-labelled synthetic `DEMO DATA`. None of it
is real government information and none of it should be presented as such.**
