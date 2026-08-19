# What broke

The contest asks for the failure modes, on the grounds that they are the most
useful thing to hand the next person. These are the ones that actually cost
time, in the order they hurt.

---

## 1. Project-scoped layouts silently froze my schema — the expensive one

**Cost: ~40 minutes and a full teardown of every project.**

I created six custom fields on the Issues module's **Standard Layout**, then
created five department projects, then realised I needed two more fields
(`sla_due`, `reported_at`) and added those to the Standard Layout too.

Creating an issue with the first six fields worked. Creating one with the last
two failed:

```json
{"message":"reported_at","field_name":"This field is not available in the current layout"}
```

Both sets of fields were on the same layout and the API had returned
`"status":"success"` for all eight. I assumed a propagation delay and retried.
Not a delay.

The cause: **each project gets its own private copy of the Issues layout at the
moment the project is created.** Listing layouts made it obvious once I thought
to look:

```
Standard Layout                        public   associated_entities_count: 0
Health & Family Welfare                private  associated_entities_count: 1
Municipal Administration & Water …     private  associated_entities_count: 1
```

The public Standard Layout is a **template**, not a live parent. Fields added to
it after a project exists never reach that project.

**What I did:** trashed all five projects and recreated them once the schema was
final. Clean, because they held no data yet.

**What to do instead:** finish your entire field schema *before* you create a
single project. If you must add a field later, add it to each project's private
layout individually — you will need that layout's `id` and its section `id`
from `GET /settings/layouts/{layout_id}`.

**How to check quickly:**

```
GET /portal/{portal}/settings/layouts?module=issues&filter={"is_association_info_needed":true}
```

If `associated_entities_count` is 0 on the Standard Layout, your projects are
all on private copies and you are editing a template nobody reads.

---

## 2. `due_date` cannot precede `created_time`

**Cost: ~20 minutes, plus a design change that turned out to be an improvement.**

Seeding a realistic demo needs history: complaints reported nine days ago,
already past their deadline. the portal refuses:

```json
{"message":"The Due Date cannot preceed the Created Time","field_name":"due_date"}
```

Reasonable for live project management, fatal for seeded history — every record
you create through the API is created *now*, so no native date field can hold a
past deadline.

**What I did:** added Power Center's own `sla_due` and `reported_at` custom
fields and made those authoritative. The native `due_date` is left unused.

This is one of those constraints that pushes you somewhere better. The product
spec already said *"do not rely entirely on the portal for SLA intelligence — Power
Center owns the executive SLA engine."* The API forced me to actually build it
that way instead of leaning on a portal field. The SLA engine is now a pure
function with its own policy table, and it is the part of the system with the
best test coverage.

---

## 3. Assignees must be project members first

**Cost: ~10 minutes.**

```json
{"message":"The user is not associated with this project","field_name":"assignee"}
```

Portal membership is not project membership. Every user must be added to each
project via `POST /projects/{id}/users` before they can be assigned anything.
Two gotchas in that call: `userdetails` is a **JSON-encoded string**, not a JSON
array, and it needs `role_id` and `profile_id` — not the ZPUID you already have.

---

## 4. Custom field API names are assigned, not chosen

**Cost: minor, but it will bite you at runtime rather than at build time.**

Most of my display names became sensible API names (`Citizen Ref` →
`citizen_ref`). One did not: on the `cm_directive` module, `Department` came
back as **`cm_directive_cf_0001`**, presumably because the name collided with
something reserved.

Never assume the API name. Always read it from the create-field response — or
from `GET /settings/fields?module=…` — and store the mapping. Mine lives in one
place, `functions/tnpc_api/zoho-schema.js`, so a rename is a one-line change.

---

## 5. The custom-module REST path is not what the MCP tool names imply

**Cost: one failed verification run — caught in seconds because a script was
looking for it, rather than after deploy.**

The MCP tool is called `get_record_list` and takes a `module_api_name`, so
`/portal/{id}/modules/{name}/records` is the obvious guess. It is wrong, and the
error tells you nothing useful:

```json
{"status_code":"400","title":"URL_RULE_NOT_CONFIGURED",
 "details":[{"message":"Given URL is wrong"}]}
```

That reads like a permissions or portal-configuration problem. It is a typo in a
URL. The real path is **singular `module`** and **`entities`, not `records`**:

```
GET    /api/v3/portal/{portal_id}/module/{api_name}/entities
POST   /api/v3/portal/{portal_id}/module/{api_name}/entities
PATCH  /api/v3/portal/{portal_id}/module/{api_name}/entities/{record_id}
```

**How to get the real path out of the MCP server:** call the tool with a
deliberately invalid module name. The validation error echoes the URL it was
about to use in its `instance` field:

```json
{"instance":"/api/v3/portal/60083686827/module/zz_does_not_exist/entities"}
```

That trick works for any endpoint whose path you are unsure of, and it is faster
than reading documentation.

Note that issue and project paths *are* plural (`/projects/{id}/issues`), so
there is no single rule to memorise — verify each one.

## 6. Custom modules are created in `draft` and are invisible until activated

**Cost: would have been confusing later; caught early.**

`POST /settings/modules` returns `"status":"draft"`. The module does not appear
in the portal and its records are not usable until you call
`POST /settings/modules/{api_name}/activate`. The create call reports success
either way.

---

## 7. No package registry in the build environment

**Cost: an architectural decision, not lost time.**

The environment I built in had npm blocked entirely, so Express, a bundler,
React and a test runner were all unavailable.

**What I did:** built the whole thing with **zero runtime dependencies** —
`node:http` and hand-rolled routing for the function, `node:crypto` for session
signing, `node:test` for the test suite, and a no-build ES-module client.

I expected this to be a compromise. It mostly was not. The function deploys with
an empty `dependencies` block, there is no build step to break between local and
the platform, and cold starts are as small as they can be. The real cost is the
hand-rolled JWT and password comparison in `auth.js`, which is fine for a demo
and must be replaced by platform authentication before this is anything else.
That is flagged in the code, not buried here.

---

## Things that worked better than expected

- **Custom fields round-trip cleanly through the MCP server.** Passing
  `citizen_ref`, `district`, `sentiment` and the rest straight in the issue body
  worked first time and came back in the response. Discovering that early was
  what made the portal-as-database design viable.
- **Native issue statuses map onto a complaint lifecycle with no configuration.**
  `Open → InProgress → ToBeTested → Closed`, plus `Reopen`, is exactly
  *received → in progress → awaiting citizen validation → closed*, with reopen
  for a rejected resolution. `ToBeTested` meaning "resolved, pending
  verification" is a genuinely good fit. I configured zero statuses.
- **Department-as-Project** gives you per-department users, milestones, tasks and
  permissions for free, and makes `POST /directives` creating a real task in the
  responsible department's project a one-line operation.
