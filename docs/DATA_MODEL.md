# Data model

The project portal is the only system of record. Everything below is a real
portal object. The authoritative ID map is `functions/tnpc_api/zoho-schema.js`.

Portal: `60083686827` (`jeyasuriyadotjscmzohotestdotcom`, India DC).

---

## Native objects, reused

### Project = Secretariat department

| Department | Project ID |
|---|---|
| Health & Family Welfare | `479100000000079186` |
| Municipal Administration & Water Supply | `479100000000079263` |
| Highways & Minor Ports | `479100000000076361` |
| Energy (TANGEDCO) | `479100000000081232` |
| Revenue & Disaster Management | `479100000000079340` |

Using the Project as the department gives per-department users, tasks,
milestones and permissions with no extra modelling, and makes "create execution
work in the responsible department" a single API call.

### Issue = Citizen complaint

Native fields carry most of it. **Status is the complaint lifecycle** — chosen so
that no status configuration was needed:

| Portal status | Lifecycle meaning |
|---|---|
| `Open` | Received / routed / assigned |
| `InProgress` | Officer working |
| `ToBeTested` | Resolved, awaiting citizen validation |
| `Closed` | Citizen accepted the resolution |
| `Reopen` | Citizen rejected the resolution |

`ToBeTested` meaning *done, pending verification* is an exact fit for *awaiting
citizen validation*.

**Severity = complaint priority**, and it drives the SLA window:

| Severity | Resolution window |
|---|---|
| Show stopper | 24h |
| Critical | 48h |
| Major | 96h |
| Minor / None | 168h |

**Custom fields on the Issues module** (all created via MCP):

| API name | Purpose |
|---|---|
| `citizen_ref` | Pseudonymous reference `TN-XXXXXX`. Operational views never show a citizen name |
| `district` | Revenue district — drives district pulse and cluster detection |
| `complaint_category` | Service category assigned by the classifier |
| `sentiment` | `Negative` / `Neutral` / `Positive` |
| `ai_confidence` | Classifier confidence 0–1; gates routing autonomy |
| `citizen_satisfaction` | `Pending` / `Satisfied` / `Unsatisfied` |
| `sla_due` | **Authoritative** SLA deadline, owned by Power Center |
| `reported_at` | Real-world report time; may precede portal `created_time` |

> The last two exist because the portal's native `due_date` rejects any value earlier
> than `created_time`, making it unusable for seeded or migrated history.
> See `docs/WHAT_BROKE.md`.

### Task = execution work

Issuing a CM directive creates a task named `[CM DIRECTIVE] …` in the
responsible department's project, carrying the objective, the accountable
authority and the deadline.

### User = officer

Portal ZPUIDs. Note that portal membership is not project membership — a user
must be added to a project before they can be assigned an issue in it.

---

## Custom modules

All four are global, created and activated via MCP.

### `district`
Fields: `district_code`, `region`.
Seeded: Chennai, Tiruvallur, Coimbatore, Madurai, Salem, Thanjavur.

### `cm_directive`
| API name | Field |
|---|---|
| `objective` | What the directive must achieve |
| `cm_directive_cf_0001` | Department *(the portal assigned this name, not me — see WHAT_BROKE §4)* |
| `accountable_authority` | Officer accountable at the time of issuance |
| `deadline` | Target completion date |
| `directive_status` | `DRAFT / ISSUED / IN_EXECUTION / AT_RISK / COMPLETED / VERIFIED` |

### `citizen_feedback`
Fields: `complaint_ref`, `satisfied`, `rating`, `feedback_department`.
Written on every citizen validation, so a rejected resolution leaves a permanent
record even after the complaint is later closed.

### `red_flag`
Reserved for flags the CM has actioned or dismissed. Red flags themselves are
**computed live** from complaint data rather than stored — derived state should
not be persisted and allowed to drift.

---

## Derived, never stored

| Concept | Computed by |
|---|---|
| SLA state | `engine.slaState()` from `reported_at`, `sla_due`, severity, status |
| Department scorecard | `engine.departmentScorecard()` — weighted, with coverage |
| State pulse | `engine.statePulse()` across scored departments |
| Red flags | `engine.redFlags()` — clusters and severe breaches |
| District pulse | `engine.districtPulse()` |

Recomputed on read behind a 30-second cache. At real scale these become
cron-materialised snapshots in custom modules; `docs/ARCHITECTURE.md` covers the
migration path.

---

## Configuration, not code

`zoho-schema.js` holds every policy as data: SLA windows and the at-risk
threshold, scorecard weights, health bands, minimum coverage, and red-flag
factor weights. Redefining "healthy" is an edit to one object.

---

## PII

Operational records carry only `citizen_ref`. No citizen name, phone or address
is stored on the issue. A production deployment would put identity in a
separate, access-controlled module with an audited reveal path; the pseudonymous
reference is the seam that makes that a later addition rather than a rewrite.
