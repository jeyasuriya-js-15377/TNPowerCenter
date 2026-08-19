'use strict';

/**
 * Populate the Zoho Projects portal with a full, realistic synthetic dataset.
 *
 *   set -a; source .env; set +a
 *   node tools/seed-portal.js            # dry run — prints the plan, writes nothing
 *   node tools/seed-portal.js --apply    # actually create the records
 *
 * Safe to re-run: existing complaints are matched by title and skipped, so a
 * second --apply tops up rather than duplicating.
 *
 * Every record is prefixed DEMO DATA. None of it is real government
 * information and none of it should ever be presented as such.
 *
 * The data is shaped, not random. Each department has a health profile, so the
 * executive story holds together: Tiruvallur water is in crisis, Salem highways
 * is deteriorating, Health is performing, Energy is solid, Revenue is slow.
 */

const zoho = require('../functions/tnpc_api/zoho-client');
const {
  PORTAL_ID, DEPARTMENTS, OFFICERS, DISTRICTS, MODULES,
  ISSUE_STATUS, SEVERITY, ISSUE_FIELDS, DIRECTIVE_FIELDS,
  FEEDBACK_FIELDS, DISTRICT_FIELDS,
} = require('../functions/tnpc_api/zoho-schema');

const APPLY = process.argv.includes('--apply');
const PREVIEW = process.argv.includes('--preview');
const ROLE_ID = process.env.SEED_ROLE_ID || '479100000000075005';     // Employee
const PROFILE_ID = process.env.SEED_PROFILE_ID || '479100000000075044'; // Employee

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/* ── deterministic RNG, so two runs produce the same portal ────────── */
let _seed = 20260819;
function rnd() {
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

function weighted(map) {
  const entries = Object.entries(map);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let roll = rnd() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/* ── localities, so titles don't all look alike ────────────────────── */
const LOCALITIES = {
  Chennai: ['Adyar', 'Royapuram', 'Perambur', 'Velachery', 'Mylapore', 'Thiruvottiyur'],
  Tiruvallur: ['Poonamallee', 'Avadi', 'Ambattur', 'Pattabiram', 'Tiruninravur', 'Thirumazhisai'],
  Kancheepuram: ['Chengalpattu', 'Sriperumbudur', 'Walajabad', 'Uthiramerur'],
  Coimbatore: ['Peelamedu', 'Saravanampatti', 'Singanallur', 'Kuniyamuthur'],
  Tiruppur: ['Avinashi', 'Palladam', 'Udumalaipettai'],
  Madurai: ['Thirumangalam', 'Melur', 'Anna Nagar', 'Villapuram'],
  Ramanathapuram: ['Paramakudi', 'Kamuthi', 'Mudukulathur'],
  Salem: ['Omalur', 'Mettur', 'Attur', 'Edappadi'],
  Erode: ['Bhavani', 'Gobichettipalayam', 'Perundurai'],
  Thanjavur: ['Kumbakonam', 'Pattukkottai', 'Orathanadu'],
  Tiruchirappalli: ['Srirangam', 'Lalgudi', 'Manapparai'],
  Tirunelveli: ['Palayamkottai', 'Ambasamudram', 'Nanguneri'],
};

/* ── complaint templates: [title with %s locality, description] ────── */
const TEMPLATES = {
  'Municipal & Water': {
    'Water Supply': [
      ['No piped water supply for %d days - %s', 'Piped supply has stopped entirely. Around %h households affected. Tanker supply irregular.'],
      ['Water tanker not delivered despite repeated requests - %s', 'Requests logged with the local body over %d days with no delivery. Residents buying private tanker water.'],
      ['Borewell pump non-functional - %s', 'Community borewell motor failed. Replacement pending. %h families dependent on this single source.'],
      ['Severe low pressure in piped supply - %s', 'Supply reaches ground floor only. Upper floors dependent on private pumps for %d days.'],
      ['Supply timing reduced without notice - %s', 'Daily supply cut from two hours to twenty minutes with no announcement.'],
    ],
    'Water Quality': [
      ['Contaminated water from public standpost - %s', 'Discoloured water with strong odour. Residents report stomach illness in %h households.'],
      ['Drinking water smells of sewage - %s', 'Odour present for %d days. Previously reported and marked resolved without any field visit.'],
      ['Visible particles in piped water - %s', 'Sediment and rust particles in supply. Households filtering through cloth before use.'],
    ],
    Sewerage: [
      ['Sewage overflow into residential lane - %s', 'Manhole overflowing for %d days. Standing sewage across the approach road. Mosquito breeding reported.'],
      ['Blocked storm water drain causing flooding - %s', 'Drain choked with silt. Ankle-deep water persists after any rainfall.'],
      ['Open sewage channel next to school - %s', 'Uncovered channel adjoining a primary school. Repeated representations to the local body.'],
    ],
    'Solid Waste': [
      ['Garbage not collected for %d days - %s', 'Street bins overflowing onto the carriageway. Stray animal nuisance reported.'],
      ['Illegal dumping on vacant plot - %s', 'Construction debris and household waste dumped nightly. No enforcement action taken.'],
    ],
  },
  Health: {
    'Hospital Services': [
      ['No doctor on duty at night - %s health centre', 'Night cover absent for %d consecutive nights. Patients redirected to a hospital %h km away.'],
      ['Ambulance response took over an hour - %s', 'Emergency call response far outside the stated standard. Patient eventually transported privately.'],
      ['Free medicine counter closed during stated hours - %s', 'Counter found shut well before the posted closing time on repeated visits.'],
      ['Ward cleanliness poor at government hospital - %s', 'Toilets uncleaned through the day. Photographs submitted with the complaint.'],
      ['Diagnostic equipment out of service - %s', 'X-ray unit non-functional for %d days. Patients referred to private facilities at own cost.'],
    ],
    'Maternal Care': [
      ['Antenatal checkup camp cancelled without notice - %s', 'Camp advertised and not held. No revised date communicated to registered mothers.'],
      ['Shortage of iron and folic acid supplements - %s', 'Stock unavailable at the centre for %d days.'],
    ],
  },
  Highways: {
    'Road Condition': [
      ['Deep potholes causing accidents - %s road', 'Multiple two-wheeler accidents at the same stretch within a fortnight. No warning signage placed.'],
      ['Road surface washed away after rain - %s', 'Carriageway eroded over %h metres. Heavy vehicles diverting through residential streets.'],
      ['Unfinished road cut left open - %s', 'Utility trench left unfilled for %d days with no barricading.'],
    ],
    'Street Lighting': [
      ['Street lights not working on bypass - %s', 'Complete darkness on a long stretch for %d days. Residents avoiding the route after dark.'],
      ['Damaged light poles leaning over footpath - %s', 'Poles tilted after storm damage. Live wiring exposed at base.'],
    ],
    'Road Safety': [
      ['Missing footpath forces pedestrians onto carriageway - %s', 'Footpath encroached by permanent stalls over %h metres.'],
      ['Unmanned level crossing without barrier - %s', 'Frequent near-misses reported by local residents.'],
    ],
  },
  Energy: {
    'Power Supply': [
      ['Transformer failure caused prolonged outage - %s', 'Outage lasted %d hours. Residents report spoiled refrigerated stock.'],
      ['Frequent voltage fluctuation damaging appliances - %s', 'Fluctuation recurring over %d days. Multiple households report damaged equipment.'],
      ['Repeated unscheduled power cuts - %s', 'Cuts occurring daily without notice, affecting home-based work and studies.'],
      ['Live wire hanging low over public road - %s', 'Conductor sagging within reach. Reported %d days ago with no action.'],
    ],
    Billing: [
      ['Electricity bill several times the usual amount - %s', 'Suspected incorrect meter reading. Request for re-reading pending %d days.'],
      ['New service connection pending beyond stated timeline - %s', 'Application and fees submitted; connection not provided after %d days.'],
    ],
  },
  Revenue: {
    'Land Records': [
      ['Patta transfer pending for months - %s', 'Application submitted with all documents. No status update despite repeated visits.'],
      ['Encroachment on classified water body not acted upon - %s', 'Reported encroachment adjoining a tank. Referred between offices without action.'],
      ['Survey correction request unresolved - %s', 'Boundary discrepancy in records causing dispute between neighbours.'],
    ],
    Certificates: [
      ['Income certificate application rejected without reason - %s', 'Rejection notice carried no stated ground. Written reasons requested.'],
      ['Community certificate delayed beyond service standard - %s', 'Application pending %d days against a stated fifteen-day standard.'],
    ],
    'Disaster Relief': [
      ['Flood relief compensation not disbursed - %s', 'Assessment completed months ago; payment not received by %h families.'],
      ['Damaged house assistance claim unprocessed - %s', 'Claim filed after storm damage with no inspection scheduled.'],
    ],
  },
};

/**
 * Health profile per department. This is what makes the demo tell a story
 * instead of showing noise.
 */
/**
 * Quotas are exact counts, not probabilities. With 13–24 records per department
 * a coin flip drifts far enough from its target to change the story on screen —
 * one run shows Highways in crisis, the next shows it healthy. Fixed quotas plus
 * a fixed RNG seed mean the portal looks the same every time you rebuild it.
 *
 * `focus` concentrates failures in one district so the red-flag engine has a
 * genuine cluster to find. Without it, eleven breaches scatter across seven
 * districts and never cross the three-per-district threshold.
 */
const PROFILES = {
  'Municipal & Water': {
    count: 30, breached: 12, reopened: 5, closed: 6, awaiting: 3,
    negative: 0.85, focus: 'Tiruvallur', focusShare: 0.65,
    districts: { Tiruvallur: 10, Chennai: 6, Coimbatore: 4, Madurai: 3, Kancheepuram: 3, Tiruppur: 2, Salem: 2 },
  },
  Highways: {
    count: 20, breached: 7, reopened: 2, closed: 6, awaiting: 3,
    negative: 0.75, focus: 'Salem', focusShare: 0.6,
    districts: { Salem: 6, Madurai: 4, Erode: 3, Thanjavur: 3, Tiruchirappalli: 2, Tirunelveli: 2 },
  },
  Revenue: {
    count: 18, breached: 5, reopened: 2, closed: 6, awaiting: 3,
    negative: 0.70, focus: 'Thanjavur', focusShare: 0.55,
    districts: { Thanjavur: 5, Tiruvallur: 4, Madurai: 3, Ramanathapuram: 3, Tiruchirappalli: 3 },
  },
  // Health and Energy are the working departments. They keep one breach each for
  // realism — a department with a flawless record reads as unpopulated, not good —
  // but enough closed-and-accepted resolutions to land in the HEALTHY band, so
  // the matrix shows the full spread from HEALTHY down to CRITICAL.
  Health: {
    count: 22, breached: 1, reopened: 0, closed: 16, awaiting: 3,
    negative: 0.28,
    districts: { Chennai: 6, Madurai: 5, Coimbatore: 4, Salem: 3, Thanjavur: 2, Tirunelveli: 2 },
  },
  Energy: {
    count: 18, breached: 1, reopened: 0, closed: 13, awaiting: 2,
    negative: 0.30,
    districts: { Coimbatore: 5, Chennai: 5, Salem: 3, Tiruppur: 3, Erode: 2 },
  },
};

/* ── helpers ───────────────────────────────────────────────────────── */
const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const SEVERITY_HOURS = { SHOWSTOPPER: 24, CRITICAL: 48, MAJOR: 96, MINOR: 168 };

let refCounter = 1000;
const citizenRef = () => `TN-${String(++refCounter).padStart(6, '0')}`;

function fill(text, locality) {
  return text
    .replace(/%s/g, locality)
    .replace(/%d/g, () => String(3 + Math.floor(rnd() * 18)))
    .replace(/%h/g, () => String(40 + Math.floor(rnd() * 460)));
}

/** Run tasks with limited concurrency so Zoho isn't hit with a burst. */
async function pool(items, limit, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i).catch((err) => ({ __error: err.message }));
    }
  });
  await Promise.all(runners);
  return results;
}

/* ── plan generation (pure — no network) ───────────────────────────── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deadlines are anchored to now, not derived from the report date.
 *
 * Deriving `slaDue` from `reportedAt + window` looked tidier but produced
 * "breached" records whose deadline was still in the future — a recent report
 * with a 168-hour window is not overdue. Anchoring the deadline to now and
 * back-dating the report guarantees the SLA engine sees the state intended.
 */
function datesFor(outcome, windowHours) {
  if (outcome === 'breached') {
    const slaDue = NOW - (6 + rnd() * 150) * HOUR;
    return { reportedAt: slaDue - windowHours * HOUR, slaDue };
  }
  if (outcome === 'reopened') {
    const slaDue = NOW - (12 + rnd() * 96) * HOUR;
    return { reportedAt: slaDue - windowHours * HOUR * 1.5, slaDue };
  }
  if (outcome === 'closed') {
    const slaDue = NOW - (24 + rnd() * 240) * HOUR;
    return { reportedAt: slaDue - windowHours * HOUR, slaDue };
  }
  // active / awaiting — still inside the window
  const slaDue = NOW + (3 + rnd() * 96) * HOUR;
  return { reportedAt: slaDue - windowHours * HOUR, slaDue };
}

function buildComplaintPlan() {
  const plan = [];

  for (const [deptShort, profile] of Object.entries(PROFILES)) {
    const dept = DEPARTMENTS.find((d) => d.short === deptShort);
    if (!dept) continue;

    const categories = Object.keys(TEMPLATES[deptShort]);
    const deptOfficers = OFFICERS.filter((o) => o.dept === deptShort);

    // Exact quota of outcomes, then shuffled so they interleave naturally.
    const outcomes = shuffle([
      ...Array(profile.breached).fill('breached'),
      ...Array(profile.reopened).fill('reopened'),
      ...Array(profile.closed).fill('closed'),
      ...Array(profile.awaiting).fill('awaiting'),
      ...Array(
        Math.max(0, profile.count - profile.breached - profile.reopened - profile.closed - profile.awaiting)
      ).fill('active'),
    ]);

    // Concentrate failures in the focus district so a cluster actually forms.
    const failureCount = profile.breached + profile.reopened;
    let focusBudget = profile.focus ? Math.ceil(failureCount * profile.focusShare) : 0;

    for (const outcome of outcomes) {
      const isFailure = outcome === 'breached' || outcome === 'reopened';

      let district;
      if (isFailure && focusBudget > 0) {
        district = profile.focus;
        focusBudget -= 1;
      } else {
        district = weighted(profile.districts);
      }

      const locality = pick(LOCALITIES[district] || [district]);
      const category = pick(categories);
      const [titleTpl, descTpl] = pick(TEMPLATES[deptShort][category]);

      const severityKey = outcome === 'breached'
        ? (chance(0.45) ? 'SHOWSTOPPER' : 'CRITICAL')
        : outcome === 'reopened'
        ? (chance(0.5) ? 'CRITICAL' : 'MAJOR')
        : chance(0.35) ? 'MAJOR' : 'MINOR';

      const { reportedAt, slaDue } = datesFor(outcome, SEVERITY_HOURS[severityKey]);

      const status = outcome === 'closed' ? 'CLOSED'
        : outcome === 'reopened' ? 'REOPENED'
        : outcome === 'awaiting' ? 'AWAITING_CITIZEN'
        : chance(0.45) ? 'IN_PROGRESS' : 'OPEN';

      // A reopened complaint is by definition one the citizen rejected. A few
      // breached ones were also rejected earlier; the rest await validation.
      const satisfaction = outcome === 'closed' ? 'Satisfied'
        : outcome === 'reopened' ? 'Unsatisfied'
        : outcome === 'breached' && chance(0.25) ? 'Unsatisfied'
        : 'Pending';

      const officer =
        deptOfficers.find((o) => o.district === district) ||
        (deptOfficers.length ? pick(deptOfficers) : null);

      plan.push({
        deptShort,
        projectId: dept.id,
        outcome,
        title: fill(titleTpl, locality),
        description: `DEMO DATA. ${fill(descTpl, locality)}`,
        district,
        category,
        citizenRef: citizenRef(),
        sentiment: chance(profile.negative) ? 'Negative' : chance(0.5) ? 'Neutral' : 'Positive',
        confidence: (0.68 + rnd() * 0.3).toFixed(2),
        satisfaction,
        severityKey,
        status,
        reportedAt: iso(reportedAt),
        slaDue: iso(slaDue),
        officer,
        rating: outcome === 'closed' ? 4 + Math.round(rnd())
          : satisfaction === 'Unsatisfied' ? 1 + Math.round(rnd())
          : null,
      });
    }
  }
  return plan;
}

/**
 * Historical months.
 *
 * The monthly dashboard needs months to compare, and the current month alone
 * gives it one column. History is deliberately *mostly resolved*: a complaint
 * from four months ago that is still open would be a scandal, not a demo. So
 * older months carry closed-and-accepted work plus a minority of failures, with
 * per-department quality varying month to month so the award actually changes
 * hands instead of the same department winning six times.
 *
 * `quality` is the share of that month's complaints the department resolved and
 * had accepted. Reading down a column shows a department's trajectory.
 */
const HISTORY_QUALITY = {
  //                  5 months ago → 1 month ago
  'Municipal & Water': [0.78, 0.72, 0.64, 0.55, 0.42],
  Highways:            [0.62, 0.66, 0.70, 0.61, 0.58],
  Revenue:            [0.55, 0.58, 0.62, 0.66, 0.63],
  Health:             [0.74, 0.79, 0.83, 0.86, 0.90],
  Energy:             [0.86, 0.82, 0.79, 0.84, 0.88],
};

/** Complaints per department per historical month. */
const HISTORY_VOLUME = {
  'Municipal & Water': 14, Highways: 10, Revenue: 9, Health: 11, Energy: 9,
};

function buildHistoryPlan() {
  const plan = [];

  for (const [deptShort, qualities] of Object.entries(HISTORY_QUALITY)) {
    const dept = DEPARTMENTS.find((d) => d.short === deptShort);
    if (!dept) continue;

    const categories = Object.keys(TEMPLATES[deptShort]);
    const deptOfficers = OFFICERS.filter((o) => o.dept === deptShort);
    const profile = PROFILES[deptShort];
    const volume = HISTORY_VOLUME[deptShort] || 8;

    qualities.forEach((quality, qi) => {
      const monthsBack = qualities.length - qi; // 5 → 1
      const good = Math.round(volume * quality);

      for (let n = 0; n < volume; n += 1) {
        const resolved = n < good;
        const district = weighted(profile.districts);
        const locality = pick(LOCALITIES[district] || [district]);
        const category = pick(categories);
        const [titleTpl, descTpl] = pick(TEMPLATES[deptShort][category]);

        const severityKey = resolved
          ? (chance(0.3) ? 'MAJOR' : 'MINOR')
          : (chance(0.4) ? 'CRITICAL' : 'MAJOR');

        // Place the report inside the target month.
        // Day-of-month is set to 1 BEFORE shifting the month: subtracting a month
        // from, say, the 31st rolls over into the wrong month, which would file
        // records against a month the dashboard never asked for.
        const anchor = new Date(NOW);
        anchor.setUTCDate(1);
        anchor.setUTCMonth(anchor.getUTCMonth() - monthsBack);
        anchor.setUTCDate(2 + Math.floor(rnd() * 24));
        const reportedAt = anchor.getTime();
        const window = SEVERITY_HOURS[severityKey] * HOUR;

        // Resolved inside the window; failures overran it, but both sit in the past.
        const slaDue = reportedAt + window;

        plan.push({
          deptShort,
          projectId: dept.id,
          historical: true,
          monthsBack,
          outcome: resolved ? 'closed' : 'breached',
          title: `${fill(titleTpl, locality)} [${anchor.toISOString().slice(0, 7)}]`,
          description: `DEMO DATA. ${fill(descTpl, locality)}`,
          district,
          category,
          citizenRef: citizenRef(),
          sentiment: resolved ? (chance(0.6) ? 'Neutral' : 'Positive') : 'Negative',
          confidence: (0.7 + rnd() * 0.28).toFixed(2),
          satisfaction: resolved ? 'Satisfied' : (chance(0.5) ? 'Unsatisfied' : 'Pending'),
          severityKey,
          // Historical failures are shown as still-open cases from that month.
          status: resolved ? 'CLOSED' : (chance(0.5) ? 'CLOSED' : 'IN_PROGRESS'),
          reportedAt: iso(reportedAt),
          slaDue: iso(slaDue),
          officer: deptOfficers.find((o) => o.district === district)
            || (deptOfficers.length ? pick(deptOfficers) : null),
          rating: resolved ? 4 + Math.round(rnd()) : 1 + Math.round(rnd()),
        });
      }
    });
  }
  return plan;
}

const DIRECTIVE_PLAN = [
  {
    deptShort: 'Municipal & Water',
    title: 'Restore drinking water reliability in Tiruvallur district',
    objective:
      'Clear every breached water supply and water quality complaint in Tiruvallur within 7 days. '
      + 'Field verification by an officer not below the rank of Assistant Engineer is mandatory before '
      + 'any complaint is marked resolved. Daily reporting to the CM War Room.',
    days: 7,
    status: 'IN_EXECUTION',
  },
  {
    deptShort: 'Highways',
    title: 'Emergency pothole rectification on Salem district highways',
    objective:
      'Rectify all reported accident-prone stretches in Salem district within 10 days and place interim '
      + 'warning signage within 48 hours. Submit photographic evidence with each closure.',
    days: 10,
    status: 'ISSUED',
  },
  {
    deptShort: 'Revenue',
    title: 'Clear the backlog of pending patta transfer applications',
    objective:
      'Dispose of all patta transfer applications pending beyond 90 days across Thanjavur and Tiruvallur '
      + 'within 21 days. Any rejection must carry written reasons communicated to the applicant.',
    days: 21,
    status: 'ISSUED',
  },
  {
    deptShort: 'Municipal & Water',
    title: 'Independent water quality testing across Tiruvallur distribution network',
    objective:
      'Commission third-party testing of drinking water at every public standpost in Poonamallee, Avadi '
      + 'and Ambattur. Publish results ward-wise within 14 days. Any sample failing potability standards '
      + 'triggers immediate alternate supply arrangements.',
    days: 14,
    status: 'IN_EXECUTION',
  },
  {
    deptShort: 'Health',
    title: 'Verify night-shift medical cover at all urban primary health centres',
    objective:
      'Audit night duty rosters against actual attendance for the past 30 days across all urban PHCs. '
      + 'Report any centre with more than two uncovered nights directly to the Principal Secretary.',
    days: 30,
    status: 'COMPLETED',
  },
];

const TASK_PLAN = {
  'Municipal & Water': [
    'Field audit of all public standposts in Poonamallee and Avadi',
    'Deploy two additional water tankers to Tiruninravur',
    'Replace failed borewell motor at Pattabiram',
    'Chlorination check across Tiruvallur distribution network',
  ],
  Highways: [
    'Interim warning signage on Omalur road accident stretch',
    'Pothole survey across Salem division',
    'Restore street lighting on Madurai bypass',
  ],
  Health: [
    'Night duty roster audit across Chennai urban health centres',
    'Ambulance response time review for Madurai district',
  ],
  Energy: [
    'Transformer load audit for Saravanampatti feeder',
    'Voltage stabilisation survey in Salem division',
  ],
  Revenue: [
    'Backlog review of patta applications pending over 90 days',
    'Joint inspection of reported water body encroachment',
  ],
};

/* ── preview: run the real engine over the plan ────────────────────── */

/**
 * Renders the CM Command Center from the planned data without writing anything.
 *
 * This runs the actual engine — the same pure functions the deployed API uses —
 * over issue objects shaped exactly as Zoho would return them. So if the numbers
 * and red flags look right here, they will look right in the browser.
 */
function previewCommandCenter(plan) {
  const engine = require('../functions/tnpc_api/engine');
  const now = new Date();

  const asIssue = (p, i) => ({
    id: `preview-${i}`,
    name: p.title,
    description: p.description,
    status: { id: ISSUE_STATUS[p.status] },
    severity: { id: SEVERITY[p.severityKey] },
    created_time: p.reportedAt,
    last_updated_time: p.reportedAt,
    assignee: p.officer
      ? { zpuid: p.officer.alias, name: p.officer.alias, email: p.officer.email }
      : null,
    [ISSUE_FIELDS.citizenRef]: p.citizenRef,
    [ISSUE_FIELDS.district]: p.district,
    [ISSUE_FIELDS.category]: p.category,
    [ISSUE_FIELDS.sentiment]: p.sentiment,
    [ISSUE_FIELDS.aiConfidence]: p.confidence,
    [ISSUE_FIELDS.satisfaction]: p.satisfaction,
    [ISSUE_FIELDS.reportedAt]: p.reportedAt,
    [ISSUE_FIELDS.slaDue]: p.slaDue,
  });

  const complaints = [];
  const scorecards = [];

  for (const dept of DEPARTMENTS) {
    const rows = plan
      .filter((p) => p.projectId === dept.id)
      .map((p, i) => engine.normalizeComplaint(asIssue(p, `${dept.short}-${i}`), dept));
    complaints.push(...rows);
    scorecards.push(engine.departmentScorecard(dept, rows, now));
  }

  const pulse = engine.statePulse(scorecards);
  const flags = engine.redFlags(complaints, now);
  const districts = engine.districtPulse(complaints, now);

  console.log(`\n  ${'═'.repeat(66)}`);
  console.log('   CM COMMAND CENTER — as it will render');
  console.log(`  ${'═'.repeat(66)}\n`);

  console.log(`   STATE PULSE   ${pulse.score}/100   ${pulse.health}`);
  console.log(`   ${dim(`${pulse.departmentsScored}/${pulse.departmentsTotal} departments scored`)}`);
  pulse.drivers.forEach((d) =>
    console.log(`     ${String(d.value ?? '—').padStart(3)}  ${d.label} ${dim(`(weight ${Math.round(d.weight * 100)}%)`)}`)
  );

  console.log(`\n   REQUIRES CM ATTENTION  ${dim(`(${flags.length} exception${flags.length === 1 ? '' : 's'})`)}\n`);
  flags.slice(0, 6).forEach((f) => {
    const colour = f.severity === 'CRITICAL' ? r : f.severity === 'HIGH' ? y : dim;
    console.log(`     ${colour(String(f.attentionScore).padStart(4))}  ${f.title}`);
    console.log(`           ${dim(f.what)}`);
    console.log(`           ${dim(`${f.citizenImpact} citizens · ${f.department}`)}`);
  });
  if (!flags.length) console.log(`     ${dim('nothing — check the failure quotas')}`);

  console.log(`\n   DEPARTMENT HEALTH\n`);
  scorecards
    .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
    .forEach((s) => {
      const colour = s.health === 'HEALTHY' ? g : s.health === 'CRITICAL' ? r : y;
      console.log(
        `     ${String(s.score ?? '—').padStart(3)}  ${colour(s.health.padEnd(9))} ${s.department.padEnd(40)}`
        + dim(`${s.counts.total} complaints, ${s.counts.breached} breached`)
      );
    });

  console.log(`\n   DISTRICT PULSE  ${dim('(worst first)')}\n`);
  districts.slice(0, 6).forEach((d) =>
    console.log(`     ${String(`${d.breachRate}%`).padStart(4)}  ${d.district.padEnd(18)} ${dim(`${d.total} complaints across ${d.departments.length} departments`)}`)
  );

  console.log(`\n  ${'═'.repeat(66)}`);
  console.log(`  ${dim('Nothing was written. Re-run with --apply to create these records.')}\n`);
}

/* ── execution ─────────────────────────────────────────────────────── */
async function main() {
  console.log(`\n  Tamil Nadu Power Center — portal seeding`);
  console.log(`  Portal ${PORTAL_ID}`);
  console.log(`  Mode   ${APPLY ? y('APPLY — records will be created') : dim('dry run — nothing will be written')}\n`);

  const plan = [...buildComplaintPlan(), ...buildHistoryPlan()];
  const current = plan.filter((p) => !p.historical);
  const history = plan.filter((p) => p.historical);

  // ---- summary of the plan -----------------------------------------
  console.log(`  Officers to invite      ${OFFICERS.length}`);
  console.log(`  Districts               ${DISTRICTS.length}`);
  console.log(`  Complaints (current)    ${current.length}`);
  console.log(`  Complaints (history)    ${history.length}   ${dim('5 prior months, mostly resolved')}`);
  console.log(`  Directives              ${DIRECTIVE_PLAN.length}`);
  console.log(`  Execution tasks         ${Object.values(TASK_PLAN).flat().length}\n`);

  for (const deptShort of Object.keys(PROFILES)) {
    const rows = current.filter((p) => p.deptShort === deptShort);
    const breached = rows.filter((p) => new Date(p.slaDue).getTime() < NOW && p.status !== 'CLOSED').length;
    const unsat = rows.filter((p) => p.satisfaction === 'Unsatisfied').length;
    const closed = rows.filter((p) => p.status === 'CLOSED').length;

    // Where the red-flag engine will find clusters: 3+ failures in one district.
    const failuresByDistrict = {};
    rows
      .filter((p) => p.outcome === 'breached' || p.outcome === 'reopened' || p.satisfaction === 'Unsatisfied')
      .forEach((p) => { failuresByDistrict[p.district] = (failuresByDistrict[p.district] || 0) + 1; });
    const clusters = Object.entries(failuresByDistrict)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${d}×${n}`);

    console.log(
      `  ${deptShort.padEnd(20)} ${String(rows.length).padStart(3)} total  `
      + `${String(breached).padStart(2)} breached  ${String(closed).padStart(2)} closed  `
      + `${String(unsat).padStart(2)} rejected   `
      + (clusters.length ? y(`flags: ${clusters.join(' ')}`) : dim('no cluster'))
    );
  }

  const officerLoad = {};
  plan.forEach((p) => {
    const key = p.officer ? p.officer.name : 'Unassigned';
    officerLoad[key] = (officerLoad[key] || 0) + 1;
  });
  console.log(`\n  ${dim('Assignment spread:')}`);
  Object.entries(officerLoad)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => console.log(`    ${String(n).padStart(3)}  ${name}`));

  if (PREVIEW) {
    previewCommandCenter(plan);
    return;
  }

  if (!APPLY) {
    console.log(`\n  ${dim('Re-run with --preview to see the resulting dashboard, or --apply to create the records.')}\n`);
    return;
  }

  await zoho.getAccessToken();
  console.log(`\n  ${g('OAuth ok')}\n`);

  // ---- 0. provision a Zoho project for every department -------------
  process.stdout.write('  Provisioning department projects… ');
  let existingProjects;
  try {
    existingProjects = await zoho.listProjects();
  } catch (err) {
    console.log(`\n\n  ${r('ABORTED')} — could not read the existing project list.`);
    console.log(`  ${err.message}\n`);
    console.log('  Refusing to create anything. A seeder that cannot see what already');
    console.log('  exists will create a duplicate of every department, every run.\n');
    process.exit(1);
  }
  if (!Array.isArray(existingProjects)) {
    console.log(`\n\n  ${r('ABORTED')} — project list came back in an unexpected shape.\n`);
    process.exit(1);
  }
  const projectByName = new Map(
    existingProjects.map((p) => [String(p.name || '').trim().toLowerCase(), String(p.id)])
  );

  const missing = DEPARTMENTS.filter((d) => !projectByName.has(d.name.toLowerCase()));
  let provisioned = 0;
  for (const dept of missing) {
    try {
      const created = await zoho.createProject({
        name: dept.name,
        description: `DEMO DATA. ${dept.minister}. Secretariat department of the Government of Tamil Nadu.`,
        owner: { zpuid: process.env.SEED_OWNER_ZPUID || '479100000000075002' },
        project_type: 'active',
        added_via: 'api',
      });
      if (created && created.id) {
        projectByName.set(dept.name.toLowerCase(), String(created.id));
        provisioned += 1;
      }
    } catch (err) {
      console.log(`\n    ${r('FAIL')} ${dept.short}: ${err.message}`);
    }
  }
  console.log(g(`${provisioned} created, ${DEPARTMENTS.length - missing.length} already present`));

  // Attach the resolved project ID to every department for the rest of the run.
  // Nothing here trusts a hard-coded ID — the registry ships none.
  DEPARTMENTS.forEach((d) => {
    const id = projectByName.get(d.name.toLowerCase());
    d.id = id || null;
  });
  plan.forEach((p) => {
    const dept = DEPARTMENTS.find((d) => d.short === p.deptShort);
    if (dept && dept.id) p.projectId = dept.id;
  });

  // ---- 1. officers --------------------------------------------------
  process.stdout.write('  Inviting officers to department projects… ');
  let invited = 0;
  for (const dept of DEPARTMENTS) {
    const forDept = OFFICERS.filter((o) => o.dept === dept.short);
    if (!forDept.length) continue;
    try {
      await zoho.addUsersToProject(
        dept.id,
        forDept.map((o) => ({ email_id: o.email, role_id: ROLE_ID, profile_id: PROFILE_ID }))
      );
      invited += forDept.length;
    } catch (err) {
      console.log(`\n    ${r('FAIL')} ${dept.short}: ${err.message}`);
    }
  }
  console.log(g(`${invited} memberships`));

  // Map officer email → zpuid, needed to set assignees.
  process.stdout.write('  Resolving officer ZPUIDs… ');
  const zpuidByEmail = new Map();
  for (const dept of DEPARTMENTS) {
    try {
      const users = await zoho.listProjectUsers(dept.id);
      for (const u of users) {
        if (u.email) zpuidByEmail.set(String(u.email).toLowerCase(), u.zpuid || u.id);
      }
    } catch { /* reported below via unresolved count */ }
  }
  const resolved = OFFICERS.filter((o) => zpuidByEmail.has(o.email.toLowerCase())).length;
  console.log(g(`${resolved}/${OFFICERS.length}`));

  // ---- 2. districts ------------------------------------------------
  process.stdout.write('  Districts… ');
  let existingDistricts = [];
  try {
    existingDistricts = await zoho.listRecords(MODULES.district);
  } catch { /* treated as empty */ }
  const haveDistrict = new Set(existingDistricts.map((d) => String(d.name).trim().toLowerCase()));
  const newDistricts = DISTRICTS.filter((d) => !haveDistrict.has(d.name.toLowerCase()));

  await pool(newDistricts, 3, (d) =>
    zoho.createRecord(MODULES.district, {
      name: d.name,
      description: `DEMO DATA. ${d.region} region.`,
      [DISTRICT_FIELDS.code]: d.code,
      [DISTRICT_FIELDS.region]: d.region,
    })
  );
  console.log(g(`${newDistricts.length} created, ${haveDistrict.size} already present`));

  // ---- 3. complaints ----------------------------------------------
  process.stdout.write('  Reading existing complaints… ');
  const existingTitles = new Set();
  for (const dept of DEPARTMENTS) {
    try {
      const issues = await zoho.listIssues(dept.id);
      issues.forEach((i) => existingTitles.add(String(i.name).trim().toLowerCase()));
    } catch { /* nothing to dedupe against */ }
  }
  console.log(dim(`${existingTitles.size} found`));

  const todo = plan.filter((p) => !existingTitles.has(p.title.trim().toLowerCase()));
  console.log(`  Creating ${todo.length} complaints ${dim(`(${plan.length - todo.length} skipped as duplicates)`)}`);

  const created = [];
  const results = await pool(todo, 4, async (p, i) => {
    const zpuid = p.officer ? zpuidByEmail.get(p.officer.email.toLowerCase()) : null;
    const payload = {
      name: p.title,
      description: p.description,
      [ISSUE_FIELDS.citizenRef]: p.citizenRef,
      [ISSUE_FIELDS.district]: p.district,
      [ISSUE_FIELDS.category]: p.category,
      [ISSUE_FIELDS.sentiment]: p.sentiment,
      [ISSUE_FIELDS.aiConfidence]: p.confidence,
      [ISSUE_FIELDS.satisfaction]: p.satisfaction,
      [ISSUE_FIELDS.reportedAt]: p.reportedAt,
      [ISSUE_FIELDS.slaDue]: p.slaDue,
      severity: { id: SEVERITY[p.severityKey] },
      status: { id: ISSUE_STATUS[p.status] },
      ...(zpuid ? { assignee: { zpuid: String(zpuid) } } : {}),
    };
    const issue = await zoho.createIssue(p.projectId, payload);
    if ((i + 1) % 10 === 0) process.stdout.write(dim(`    …${i + 1}\n`));
    if (issue && issue.id) created.push({ ...p, id: issue.id });
    return issue;
  });

  const failures = results.filter((x) => x && x.__error);
  console.log(`  ${g(`${created.length} complaints created`)}${failures.length ? r(`  ${failures.length} failed`) : ''}`);
  if (failures.length) console.log(`    ${dim(failures[0].__error)}`);

  // ---- 4. citizen feedback ----------------------------------------
  const validated = created.filter((c) => c.satisfaction !== 'Pending');
  process.stdout.write(`  Citizen validations (${validated.length})… `);
  await pool(validated, 3, (c) =>
    zoho.createRecord(MODULES.feedback, {
      name: `Validation for ${c.citizenRef} — ${c.satisfaction === 'Satisfied' ? 'Accepted' : 'Rejected'}`,
      description:
        c.satisfaction === 'Satisfied'
          ? 'DEMO DATA. Citizen confirmed the issue was resolved on the ground.'
          : 'DEMO DATA. Citizen rejected the resolution — the problem recurred or was never attended.',
      [FEEDBACK_FIELDS.complaintRef]: String(c.id),
      [FEEDBACK_FIELDS.satisfied]: c.satisfaction === 'Satisfied' ? 'Yes' : 'No',
      [FEEDBACK_FIELDS.rating]: String(c.rating || (c.satisfaction === 'Satisfied' ? 5 : 1)),
      [FEEDBACK_FIELDS.department]: DEPARTMENTS.find((d) => d.short === c.deptShort).name,
    })
  );
  console.log(g('done'));

  // ---- 5. directives ----------------------------------------------
  process.stdout.write(`  CM directives (${DIRECTIVE_PLAN.length})… `);
  for (const d of DIRECTIVE_PLAN) {
    const dept = DEPARTMENTS.find((x) => x.short === d.deptShort);
    try {
      await zoho.createRecord(MODULES.directive, {
        name: d.title,
        description: `DEMO DATA. Issued by the Chief Minister following an executive red flag review.`,
        [DIRECTIVE_FIELDS.objective]: d.objective,
        [DIRECTIVE_FIELDS.department]: dept.name,
        [DIRECTIVE_FIELDS.accountableAuthority]: dept.secretary,
        [DIRECTIVE_FIELDS.deadline]: iso(NOW + d.days * DAY).slice(0, 10),
        [DIRECTIVE_FIELDS.status]: d.status,
      });
    } catch (err) {
      console.log(`\n    ${r('FAIL')} ${d.title}: ${err.message}`);
    }
  }
  console.log(g('done'));

  // ---- 6. execution tasks -----------------------------------------
  process.stdout.write('  Execution tasks in department projects… ');
  let taskCount = 0;
  let taskError = null;
  for (const [deptShort, titles] of Object.entries(TASK_PLAN)) {
    const dept = DEPARTMENTS.find((d) => d.short === deptShort);
    for (const t of titles) {
      try {
        await zoho.createTask(dept.id, {
          name: t,
          description: 'DEMO DATA. Operational action arising from executive review.',
        });
        taskCount += 1;
      } catch (err) {
        taskError = taskError || err.message;
      }
    }
  }
  console.log(taskCount ? g(`${taskCount} tasks`) : r(`0 tasks — ${taskError}`));

  // ---- done --------------------------------------------------------
  console.log(`\n  ${g('Portal seeded.')}`);
  console.log(`  Restart the API so the 30-second cache clears, then reload the Command Center.\n`);
  console.log(dim('  Everything created is labelled DEMO DATA.\n'));
}

main().catch((err) => {
  console.error(`\n  ${r('Seeding failed')}: ${err.message}`);
  if (err.detail) console.error(`  ${JSON.stringify(err.detail).slice(0, 400)}`);
  process.exit(1);
});
