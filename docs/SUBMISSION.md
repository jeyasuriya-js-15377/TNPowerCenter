# Submission pack

Copy-paste ready for <https://projects-challenge.onslate.in>.
Fill the two bracketed fields once you have deployed and recorded.

---

## Title of your solution

**Tamil Nadu Power Center — an executive operating system for government performance**

## Industry

**Government / Public Administration** (citizen grievance redressal and
executive oversight)

## Short description

*(268 words)*

Every state government already collects citizen complaints. Almost none can
answer the question a Chief Minister actually asks: *is the government working,
where is it failing, who is accountable, and did my intervention change
anything?* Complaints sit in one system, department performance in spreadsheets,
and executive decisions in files. The loop never closes.

Tamil Nadu Power Center closes it, using the project portal as the entire backbone.
Each secretariat department is a workspace. Each citizen complaint is an issue.
Officers are portal users, directives become real tasks. Districts,
directives and citizen validations are custom modules. There is no external
database — every fact the app shows is a record in the project portal.

On top of that sits the layer the portal does not provide: an SLA engine that warns
before a breach rather than reporting it afterwards, a configurable department
scorecard, and a red-flag engine that surfaces exceptions instead of statistics.
The Chief Minister opens one screen and sees a State Pulse, then a short ranked
list of what needs attention — currently a cluster of water complaints in
Tiruvallur where six cases are past deadline and citizens have rejected the
department's own resolutions.

Three roles use it. The Chief Minister investigates a red flag and issues a
directive, which writes a directive record and creates execution work in that
department's department workspace. The War Room analyst sees the identical statewide
data and is refused when they attempt the same action — visibility and authority
are separate, enforced server-side. A minister's control team sees one
department only.

Two rules are non-negotiable in the code: a department cannot close a complaint
the citizen has rejected, and missing data is reported as a DATA GAP, never
scored as good performance.

## Live app URL

`[paste the hosted URL from the deploy output]`

## Demo login

| Role | Email | Password | What it demonstrates |
|---|---|---|---|
| Chief Minister | `cm@tnpowercenter.in` | `PowerCenter@2026` | Full statewide visibility; **can** issue directives |
| CM War Room — Analyst | `warroom@tnpowercenter.in` | `WarRoom@2026` | Same visibility; **cannot** issue directives |
| Minister Control Team (Water) | `water@tnpowercenter.in` | `Water@2026` | Scoped to a single department |

Portal: `jeyasuriyadotjscmzohotestdotcom` (zohotest account, India DC).

## Walkthrough video

`[WorkDrive link, shared to the zohocorp org]`

## Source code

<https://github.com/[your-username]/TNPowerCenter>

Worth pointing reviewers at `docs/WHAT_BROKE.md` — the project portal API
constraints documented there are the most reusable part of this build.

## Build time

**Roughly 5 hours in one session**, including a full architecture pivot
partway through — the first version used an external Postgres/SQLite store and
had to be rebuilt onto the project portal as the only system of record once the
"no external DB" rule was applied. AI did the schema design, all MCP calls, the
entire codebase and the test suite; the human decisions were the vertical, the
data model shape, and what to cut when the deadline got close.

## What broke

**Project-scoped layouts silently froze my schema.** Custom fields added to the
Issues *Standard Layout* after a project already existed never reached that
project — every project takes a **private copy** of the layout at creation time,
and the public layout is a template, not a live parent. The create-field API
returned success for all eight fields; only two of them were usable. I lost
about forty minutes assuming a propagation delay before checking
`associated_entities_count` on the layout list and seeing the public layout was
associated with nothing. Fix: finish the entire field schema before creating any
project. I trashed and recreated all five departments.

Runner-up: **`due_date` cannot precede `created_time`**, which makes it
impossible to seed realistic overdue history through the API. That one turned
out to be a gift — it forced Power Center to own its SLA deadline in its own
field, which is what the design should have done anyway, and that engine is now
the best-tested part of the system.

Full detail, including three smaller ones, in `docs/WHAT_BROKE.md`.
