# Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Catalyst Slate — client/tnpc_web                            │
│  Zero-build ES modules. Command Center · Complaints ·         │
│  Directives · Citizen Intake · investigation drawer          │
└───────────────────────────┬──────────────────────────────────┘
                            │  fetch  /server/tnpc_api/*
┌───────────────────────────▼──────────────────────────────────┐
│  Catalyst Advanced I/O function — functions/tnpc_api         │
│                                                              │
│  index.js        routing · authn · authz · DTOs · cache      │
│  auth.js         permission sets · scopes · session tokens   │
│  engine.js       PURE: SLA · scorecard · pulse · red flags   │
│                       · classifier   (no I/O, injected clock)│
│  zoho-client.js  OAuth refresh + REST                        │
│  zoho-schema.js  ID map + every configurable policy          │
└───────────────────────────┬──────────────────────────────────┘
                            │  Zoho Projects REST v3
┌───────────────────────────▼──────────────────────────────────┐
│  Zoho Projects — the ONLY system of record                   │
│  Projects · Issues · Tasks · Users · custom modules          │
└──────────────────────────────────────────────────────────────┘
```

There is no external database, no cache server and no message queue. State lives
in Zoho Projects; the function is stateless apart from a 30-second read-through
cache in module scope.

---

## Decisions worth defending

### D1 — Zoho Projects is the database, not a sync target

Government concepts map onto Zoho primitives (see README). Nothing is mirrored
into a second store, so there is no divergence to reconcile and no "which system
is right" question. The cost is that queries are shaped by the Projects API
rather than by SQL; at demo scale this is invisible, and the mitigation for real
scale is in *Scaling* below.

### D2 — The engine is pure and takes the clock as an argument

`engine.js` performs no I/O and never calls `Date.now()`. `now` is a parameter.
This is why 21 tests run with no credentials, no network and no fixtures, and
why SLA behaviour is reproducible rather than "whatever today is".

### D3 — Power Center owns SLA, not Zoho

Zoho's native `due_date` refuses any value earlier than the record's
`created_time`, which makes it unusable for migrated or seeded history. The
deadline lives in Power Center's own `sla_due` field and the state machine
(`DUE → AT_RISK → BREACHED`, or `RESOLVED`) is computed here. The API constraint
forced the design the product spec already wanted.

### D4 — Configuration is data, not code

SLA policy, scorecard weights, health bands, minimum coverage and red-flag
factor weights are all values in `zoho-schema.js`. Changing what "healthy" means
is an edit to one object, not a change to scoring logic. Moving them into a
Catalyst data store or a Zoho custom module is a drop-in replacement.

### D5 — Visibility and authority are separate gates

`can(claims, 'complaint:read')` and `can(claims, 'directive:issue')` are
independent. The dispatcher in `index.js` checks the permission before the
handler runs, and scope is re-checked inside handlers against the resource's own
department. The client hides the directive form for clarity only — the server
refuses regardless.

### D6 — DATA_GAP is a first-class state

The scorecard tracks `coverage`: the share of dimension weight actually backed
by data. Below 0.6 the score is `null` and the health state is `DATA_GAP`. A
department that reports nothing does not outrank one that reports honestly. The
dashboard also surfaces departments whose issues could not be read at all, as
explicit data gaps rather than as zero complaints.

### D7 — The classifier is explainable by construction

A lexicon with scored term matches, not a model. It returns the matched terms,
the urgency signals and the alternatives it considered. Confidence gates
autonomy: ≥0.85 auto-routes, ≥0.60 routes with a review flag, below that it goes
to a human. Swapping in an LLM means replacing one function while keeping the
same gates and the same evidence contract.

### D8 — Zero runtime dependencies

`node:http`, `node:crypto`, `node:test` and the platform `fetch` on the client.
The function's `dependencies` block is empty, there is no build step between
local and Catalyst, and cold start is minimal. This began as a constraint (no
package registry in the build environment) and was kept because it earned its
place. The exception is `auth.js`, whose hand-rolled token signing must be
replaced by Catalyst Authentication before production.

---

## Request lifecycle

```
fetch → normalizePath (strips /server/<fn>)
      → route match
      → authenticate (HMAC bearer)
      → requirePermission            ← server-side, before the handler
      → handler
          ├─ loadAllComplaints (30s read-through cache)
          ├─ engine.* (pure decisions)
          └─ zoho-client (writes)
      → invalidate cache on write
      → JSON + CORS
```

## Caching and the 30-second rule

The Command Center needs five project reads. Doing that per request would make
the dashboard slow and rate-limit-prone. `loadAllComplaints()` caches the
normalised complaint set for 30 seconds in module scope and every write path
calls `invalidateCache()`, so an action the user just took is always reflected
immediately while background reads stay cheap.

A department that fails to read is recorded as a data gap and does not poison
the cache with a false zero.

## Scaling beyond the demo

At statewide volume the read-everything-then-compute approach stops working.
The path, in order:

1. Server-side filtering on the Projects list APIs instead of client-side
   filtering after the fetch.
2. Materialise `department_scores` and a state-pulse snapshot into custom
   modules on a **Catalyst Cron**, and have the dashboard read snapshots.
3. Move the read-through cache into **Catalyst Cache** so it is shared across
   function instances rather than per-instance.
4. Replace polling with Zoho Projects webhooks into a Catalyst function, with an
   idempotency record keyed on the event ID so duplicate delivery cannot produce
   duplicate business actions.

None of these change `engine.js`, which is the point of keeping it pure.

## Not built

Schemes and government projects, PostGIS-style district geometry,
cross-department anomaly correlation, semantic historical-case matching, special
teams and missions beyond the directive, and the natural-language AI command
centre. The directive lifecycle stops at `ISSUED`. These are deliberate cuts to
ship a loop that works end to end rather than a wider one that dead-ends.
