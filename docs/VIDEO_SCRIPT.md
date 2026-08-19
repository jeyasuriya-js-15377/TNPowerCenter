# Walkthrough video — 5 minutes, hard cap

Record at 1440×900 or larger. Zoom the browser to ~110% so text is legible.
Have **three tabs open before you hit record**:

1. The app, signed out
2. the project portal → Municipal Administration & Water Supply → Issues
3. the project portal → Settings → Modules (showing the four custom modules)

Rehearse once. The timings below leave ~20 seconds of slack.

---

## 0:00 — 0:30 · The problem

> "Every state government collects citizen complaints. Almost none can answer
> the question a Chief Minister actually asks — is the government working, where
> is it failing, who is accountable, and did my intervention change anything?
> The complaints are in one system, department performance is in spreadsheets,
> and the decisions are in files. The loop never closes.
>
> This is Tamil Nadu Power Center. It closes that loop, and it runs entirely on
> the project portal."

*On screen: the login page.*

---

## 0:30 — 1:00 · the project portal is the database

Switch to tab 3 (Modules), then tab 2 (Issues).

> "There's no database behind this. Every department is a department workspace. Every
> citizen complaint is a complaint record — here's the water department, with the
> custom fields Claude created through the portal API: citizen
> reference, district, category, sentiment, classifier confidence, the SLA
> deadline, and whether the citizen accepted the resolution.
>
> Districts, CM directives and citizen validations are custom modules. All of it
> was created through MCP."

*Scroll the issue list once so the custom field columns are visible.*

---

## 1:00 — 2:15 · The 30-second rule

Back to tab 1. Sign in as **cm@tnpowercenter.in**.

> "The Chief Minister signs in and gets one screen."

Point at the State Pulse.

> "State Pulse, and what's driving it — citizen outcome, complaint performance,
> SLA, risk. Every number is computed live from the project portal records.
>
> Underneath is the part that matters: **Requires CM attention**. Not a feed of
> everything — exceptions only, ranked by attention score."

Point at the top red flag.

> "Water supply and quality failing in Tiruvallur. Six complaints, past deadline,
> and — this is the important bit — citizens have *rejected* the department's own
> resolutions. That's not a delay, that's a department marking work done that
> isn't."

Scroll to the department matrix.

> "Departments ranked worst first. Municipal and Water is critical. Health is
> healthy. And note this one —" *(point at any DATA GAP or low-coverage card)*
> "— missing data shows as a DATA GAP. It never scores as good performance.
> That's a deliberate rule: a department with no data does not get a 100."

---

## 2:15 — 3:15 · Investigate → decide → direct

Click the Tiruvallur red flag.

> "One click gets the CM everything needed to act. What's happening. Why it
> matters. Who's accountable — political and administrative shown separately,
> never collapsed into one person. And the evidence: the actual complaints, how
> far past deadline, which citizens rejected the fix.
>
> Then the recommendation, and the action."

Fill the directive form and submit.

> "The CM issues a directive. Watch what that does."

Switch to tab 2, refresh the Municipal project → Tasks.

> "It's not a PDF. The directive is recorded in the CM Directives module, and a
> real task lands in the water department's department workspace with the accountable
> officer and the deadline. Execution and oversight are the same system."

---

## 3:15 — 4:00 · Visibility is not authority

Sign out. Sign in as **warroom@tnpowercenter.in**.

> "The War Room analyst. Same statewide data — every department, every red flag,
> full investigation."

Open the same red flag, scroll to the directive section.

> "And no directive form. The role can investigate and prepare; it cannot issue.
> That's not the button being hidden — the server refuses the request. Visibility
> and authority are separate concepts, and it's enforced on the server, not in
> the UI."

*(Optional, 8 seconds: sign in as `water@tnpowercenter.in` to show one
department only.)*

---

## 4:00 — 4:45 · The loop closes

Sign back in as the CM. Go to **Citizen Intake**.

> "Last piece — the loop back to the citizen."

Type: *"No water supply for six days, tanker never arrived"*, district
Tiruvallur. Submit.

> "Classified, routed to Municipal and Water, priority set, SLA deadline
> calculated, and written to the project portal as an issue. And it shows *why* — the
> matched terms, the urgency signals, the confidence. Below the confidence
> threshold it goes to a human instead of guessing."

Go to Complaints, open one that's awaiting validation, click **Citizen rejects
resolution**.

> "And when a department marks something resolved, the citizen decides. Reject it
> and the complaint reopens, the department's score drops, and it flows straight
> back to the CM's attention list. A department cannot close a complaint the
> citizen has rejected — the server won't allow it. Administrative closure can't
> hide dissatisfaction."

Return to the Command Center — the numbers have moved.

---

## 4:45 — 5:00 · Close

> "Observe, understand, account, decide, direct, execute, verify. The project
> portal is the system of record; this app is the executive layer.
> Built with Claude through the portal API.
>
> Everything you saw is clearly-labelled demo data."

---

## Checklist before recording

- [ ] Demo data seeded; the Tiruvallur cluster shows as the top red flag
- [ ] No directives exist yet, so issuing one on camera is visibly new
- [ ] At least one complaint sits in *awaiting citizen validation*
- [ ] Browser zoom ~110%, notifications off, bookmarks bar hidden
- [ ] You are signed into the project portal in a second tab already
- [ ] Under 5:00 — it is a hard cap
