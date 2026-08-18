# API

Base path: `/server/tnpc_api` (Catalyst Advanced I/O).
All responses JSON. Errors:

```json
{ "error": { "code": "FORBIDDEN", "message": "…" } }
```

Codes: `BAD_REQUEST · UNAUTHORIZED · FORBIDDEN · NOT_FOUND · UNPROCESSABLE ·
CITIZEN_VALIDATION_REQUIRED · ZOHO_NOT_CONFIGURED · INTERNAL`.

Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/health` | — | Liveness; reports whether Zoho credentials are present |
| `POST` | `/auth/login` | — | `{email, password}` → `{token, user, expiresAt}` |
| `GET` | `/auth/me` | `complaint:read` | Resolved role, permissions, scope |
| `GET` | `/dashboard` | `department:read` | Pulse, scorecards, red flags, districts, totals, freshness |
| `GET` | `/complaints` | `complaint:read` | Filters: `departmentId` `district` `stage` `sla` `q` |
| `GET` | `/complaints/:id` | `complaint:read` | Complaint 360 — classification, accountability, SLA, timeline |
| `POST` | `/complaints` | `complaint:read` | Citizen intake → classify → route → create Zoho issue |
| `POST` | `/complaints/:id/status` | `complaint:update` | `CLOSED` is refused without citizen acceptance |
| `POST` | `/complaints/:id/feedback` | `complaint:read` | Citizen validation → `CLOSED` or `REOPENED` |
| `GET` | `/red-flags` | `redflag:read` | Attention-ranked exceptions |
| `GET` | `/directives` | `department:read` | From the `cm_directive` module |
| `POST` | `/directives` | `directive:issue` | **Privileged.** Creates the record *and* a Zoho task |
| `POST` | `/admin/seed` | `directive:issue` | Loads `seed.js` demo complaints. Run once |

---

## Behaviour worth knowing

**Scope is re-checked per resource.** Holding `complaint:read` is not enough —
`GET /complaints/:id` also verifies the complaint's department is inside the
caller's scope, and returns `403` otherwise. `GET /complaints` filters rather
than refusing.

**`POST /complaints/:id/status` with `CLOSED`** returns `422
CITIZEN_VALIDATION_REQUIRED` unless `citizen_satisfaction` is `Satisfied`.
This is the rule that stops administrative closure hiding failure.

**`POST /complaints`** returns the routing reasoning, not just the result:

```json
{
  "complaint": { "id": "…", "key": "A2KB-I7", "department": "Municipal Administration & Water Supply" },
  "classification": {
    "category": "Water Supply", "severity": "Critical", "sentiment": "Negative",
    "confidence": 0.92, "routing": "AUTO_ROUTED",
    "evidence": { "matchedTerms": ["water supply", "tanker"], "urgencySignals": [], "alternatives": [] }
  },
  "sla": { "dueAt": "2026-08-21T04:00:00.000Z", "resolutionHours": 48 },
  "routing": { "layer1": "…", "layer2": "…", "decision": "AUTO_ROUTED" }
}
```

**`POST /directives`** is the only privileged write. Refusing it for the War
Room analyst returns a `403` that explains the distinction rather than a bare
denial:

```json
{ "error": {
  "code": "FORBIDDEN",
  "message": "Your role does not hold \"directive:issue\".",
  "role": "WAR_ROOM_ANALYST",
  "hint": "Visibility and authority are separate. This role can investigate and prepare, but only the Chief Minister can issue a directive."
}}
```

On success it creates a `cm_directive` record **and** a task in the responsible
department's Zoho project — a directive is an executable object, not a document.

**`GET /dashboard`** always reports freshness, including departments that could
not be read:

```json
"freshness": {
  "source": "Zoho Projects", "lastUpdated": "…", "state": "FRESH",
  "dataGaps": [],
  "note": "Departments that cannot be read are reported as DATA GAPS, never as zero complaints."
}
```
