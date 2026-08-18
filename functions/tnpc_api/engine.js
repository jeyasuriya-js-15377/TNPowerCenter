'use strict';

/**
 * Power Center intelligence engine.
 *
 * Pure functions only — no I/O, no clock reads. `now` is always injected.
 * That is what makes SLA, scoring and red-flag logic deterministic and
 * testable, and it is why `npm test` needs no Zoho connection.
 *
 * Zoho Projects holds the facts. This file turns facts into executive answers:
 *   How are we doing? What changed? What is wrong? Where? Who? What should I do?
 */

const {
  ISSUE_STATUS_BY_ID,
  SEVERITY_BY_ID,
  ISSUE_FIELDS,
  SLA_POLICY,
  SCORECARD_WEIGHTS,
  HEALTH_BANDS,
  MIN_COVERAGE,
  ATTENTION_FACTORS,
} = require('./zoho-schema');

/* ------------------------------------------------------------------ *
 * 1. Normalisation — Zoho Issue → Power Center complaint
 * ------------------------------------------------------------------ */

const LIFECYCLE = {
  OPEN: 'ROUTED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_CITIZEN: 'AWAITING_CITIZEN_VALIDATION',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
};

function normalizeComplaint(issue, department) {
  const statusKey = ISSUE_STATUS_BY_ID[issue.status && issue.status.id] || 'OPEN';
  const severity = SEVERITY_BY_ID[issue.severity && issue.severity.id] || { label: 'None', weight: 1 };
  const reportedAt = issue[ISSUE_FIELDS.reportedAt] || issue.created_time || null;

  return {
    id: String(issue.id),
    key: issue.prefix || null,
    title: issue.name || '(untitled)',
    description: issue.description || '',
    departmentId: department.id,
    departmentName: department.name,
    departmentShort: department.short,
    district: issue[ISSUE_FIELDS.district] || 'Unassigned',
    category: issue[ISSUE_FIELDS.category] || 'Uncategorised',
    citizenRef: issue[ISSUE_FIELDS.citizenRef] || null,
    sentiment: issue[ISSUE_FIELDS.sentiment] || 'Unknown',
    aiConfidence: issue[ISSUE_FIELDS.aiConfidence] ? Number(issue[ISSUE_FIELDS.aiConfidence]) : null,
    satisfaction: issue[ISSUE_FIELDS.satisfaction] || 'Pending',
    slaDue: issue[ISSUE_FIELDS.slaDue] || null,
    reportedAt,
    createdAt: issue.created_time || null,
    updatedAt: issue.last_updated_time || null,
    statusKey,
    stage: LIFECYCLE[statusKey] || 'ROUTED',
    severity: severity.label,
    severityWeight: severity.weight,
    assignee: issue.assignee
      ? { id: issue.assignee.zpuid, name: issue.assignee.name, email: issue.assignee.email }
      : null,
    isClosed: statusKey === 'CLOSED',
    isReopened: statusKey === 'REOPENED',
  };
}

/* ------------------------------------------------------------------ *
 * 2. SLA engine — Power Center owns this, not Zoho
 * ------------------------------------------------------------------ */

function resolutionHours(severityLabel) {
  const map = SLA_POLICY.default;
  switch ((severityLabel || '').toLowerCase()) {
    case 'show stopper':
    case 'showstopper':
      return map.showstopper;
    case 'critical':
      return map.critical;
    case 'major':
      return map.major;
    case 'minor':
      return map.minor;
    default:
      return map.none;
  }
}

/**
 * Returns { state, dueAt, elapsedMs, remainingMs, consumed, breachHours }.
 * States: RESOLVED | DUE | AT_RISK | BREACHED.
 * AT_RISK is always reached before BREACHED — the point is to warn, not to report.
 */
function slaState(complaint, now) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startMs = complaint.reportedAt ? new Date(complaint.reportedAt).getTime() : nowMs;

  const dueAt = complaint.slaDue
    ? new Date(complaint.slaDue).getTime()
    : startMs + resolutionHours(complaint.severity) * 3600000;

  if (complaint.isClosed) {
    return { state: 'RESOLVED', dueAt: new Date(dueAt).toISOString(), consumed: null, breachHours: 0 };
  }

  const total = Math.max(dueAt - startMs, 1);
  const elapsed = nowMs - startMs;
  const consumed = elapsed / total;

  let state = 'DUE';
  if (nowMs > dueAt) state = 'BREACHED';
  else if (consumed >= SLA_POLICY.atRiskThreshold) state = 'AT_RISK';

  return {
    state,
    dueAt: new Date(dueAt).toISOString(),
    elapsedMs: elapsed,
    remainingMs: dueAt - nowMs,
    consumed: Math.round(consumed * 100) / 100,
    breachHours: state === 'BREACHED' ? Math.round(((nowMs - dueAt) / 3600000) * 10) / 10 : 0,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Classifier — deterministic, explainable, offline
 *
 * A lexicon classifier, not an LLM. It is auditable, costs nothing, and never
 * fabricates. Every result carries the terms that produced it, so an officer
 * can see exactly why a complaint was routed. Swap in an LLM behind this same
 * signature and the confidence gates below still apply.
 * ------------------------------------------------------------------ */

const LEXICON = [
  { dept: 'Municipal Administration & Water Supply', category: 'Water Supply',
    terms: ['water supply', 'piped water', 'tanker', 'borewell', 'no water', 'drinking water'] },
  { dept: 'Municipal Administration & Water Supply', category: 'Water Quality',
    terms: ['contaminated', 'dirty water', 'smell', 'odour', 'discoloured', 'sewage smell'] },
  { dept: 'Municipal Administration & Water Supply', category: 'Sewerage',
    terms: ['sewage', 'drainage', 'manhole', 'sewer', 'overflow'] },
  { dept: 'Municipal Administration & Water Supply', category: 'Solid Waste',
    terms: ['garbage', 'waste', 'rubbish', 'bin not cleared', 'dump'] },
  { dept: 'Health & Family Welfare', category: 'Hospital Services',
    terms: ['hospital', 'phc', 'doctor', 'nurse', 'medicine', 'ambulance', 'clinic'] },
  { dept: 'Highways & Minor Ports', category: 'Road Condition',
    terms: ['pothole', 'road', 'highway', 'bridge', 'street light', 'footpath'] },
  { dept: 'Energy (TANGEDCO)', category: 'Power Supply',
    terms: ['power cut', 'electricity', 'transformer', 'outage', 'voltage', 'eb '] },
  { dept: 'Energy (TANGEDCO)', category: 'Billing',
    terms: ['electricity bill', 'meter reading', 'billing'] },
  { dept: 'Revenue & Disaster Management', category: 'Land Records',
    terms: ['patta', 'land record', 'encroachment', 'certificate', 'survey'] },
  { dept: 'Revenue & Disaster Management', category: 'Disaster Relief',
    terms: ['flood', 'relief', 'cyclone', 'compensation'] },
];

const NEGATIVE_TERMS = ['no ', 'not ', 'never', 'failed', 'ignored', 'worst', 'again', 'still',
  'hospitalised', 'suffering', 'urgent', 'danger', 'unbearable', 'weeks', 'days'];
const URGENT_TERMS = ['hospitalised', 'children', 'danger', 'collapse', 'fire', 'death',
  'contaminated', 'emergency', 'accident'];

function classify(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const scores = [];

  for (const entry of LEXICON) {
    const matched = entry.terms.filter((t) => text.includes(t));
    if (matched.length) {
      scores.push({ dept: entry.dept, category: entry.category, matched, score: matched.length });
    }
  }
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const runnerUp = scores[1];

  // Confidence: how decisively the top match beat the alternatives.
  let confidence = 0.35;
  if (top) {
    const margin = top.score - (runnerUp ? runnerUp.score : 0);
    confidence = Math.min(0.5 + top.score * 0.15 + margin * 0.12, 0.97);
  }

  const negativeHits = NEGATIVE_TERMS.filter((t) => text.includes(t));
  const urgentHits = URGENT_TERMS.filter((t) => text.includes(t));

  const sentiment = negativeHits.length >= 2 ? 'Negative' : negativeHits.length === 1 ? 'Neutral' : 'Neutral';
  const severity = urgentHits.length >= 2 ? 'Showstopper'
    : urgentHits.length === 1 ? 'Critical'
    : negativeHits.length >= 3 ? 'Major' : 'Minor';

  // Confidence gates. Autonomy is earned, not assumed.
  const routing = confidence >= 0.85 ? 'AUTO_ROUTED'
    : confidence >= 0.6 ? 'ROUTED_FOR_REVIEW'
    : 'HUMAN_REVIEW_REQUIRED';

  return {
    department: top ? top.dept : null,
    category: top ? top.category : 'Uncategorised',
    sentiment,
    severity,
    confidence: Math.round(confidence * 100) / 100,
    routing,
    evidence: {
      matchedTerms: top ? top.matched : [],
      negativeSignals: negativeHits,
      urgencySignals: urgentHits,
      alternatives: scores.slice(1, 3).map((s) => ({ department: s.dept, category: s.category })),
    },
  };
}

/* ------------------------------------------------------------------ *
 * 4. Department scorecard
 * ------------------------------------------------------------------ */

function pct(n, d) {
  return d === 0 ? null : n / d;
}

function healthState(score) {
  if (score == null) return 'DATA_GAP';
  for (const band of HEALTH_BANDS) if (score >= band.min) return band.state;
  return 'CRITICAL';
}

/**
 * Returns a scorecard with a per-dimension breakdown and an explicit coverage
 * figure. If too little of the weight is backed by data the score is null and
 * the state is DATA_GAP — never a flattering 100.
 */
function departmentScorecard(department, complaints, now) {
  const total = complaints.length;
  const sla = complaints.map((c) => slaState(c, now));

  const closed = complaints.filter((c) => c.isClosed);
  const validated = complaints.filter((c) => c.satisfaction === 'Satisfied' || c.satisfaction === 'Unsatisfied');
  const satisfied = complaints.filter((c) => c.satisfaction === 'Satisfied');
  const reopened = complaints.filter((c) => c.isReopened);
  const breached = sla.filter((s) => s.state === 'BREACHED');
  const atRisk = sla.filter((s) => s.state === 'AT_RISK');
  const negative = complaints.filter((c) => c.sentiment === 'Negative');

  const dims = {};

  // Citizen outcome — only counts where citizens actually responded.
  dims.citizenOutcome = {
    label: 'Citizen Outcome',
    value: pct(satisfied.length, validated.length),
    detail: validated.length
      ? `${satisfied.length} of ${validated.length} validated resolutions accepted`
      : 'No citizen validations yet',
    hasData: validated.length > 0,
  };

  // Complaint performance — closure rate net of reopenings.
  const effectiveClosed = Math.max(closed.length - reopened.length, 0);
  dims.complaintPerformance = {
    label: 'Complaint Performance',
    value: pct(effectiveClosed, total),
    detail: total ? `${effectiveClosed} of ${total} closed and not reopened` : 'No complaints',
    hasData: total > 0,
  };

  // SLA performance.
  dims.slaPerformance = {
    label: 'SLA Performance',
    value: pct(total - breached.length, total),
    detail: total ? `${breached.length} breached, ${atRisk.length} at risk of ${total}` : 'No complaints',
    hasData: total > 0,
  };

  // Risk / trend — negative sentiment and reopen pressure.
  const riskLoad = total ? (negative.length * 0.6 + reopened.length * 1.4) / total : null;
  dims.riskTrend = {
    label: 'Risk / Trend',
    value: riskLoad == null ? null : Math.max(0, 1 - riskLoad),
    detail: total ? `${negative.length} negative sentiment, ${reopened.length} reopened` : 'No complaints',
    hasData: total > 0,
  };

  let weighted = 0;
  let coverage = 0;
  for (const [key, weight] of Object.entries(SCORECARD_WEIGHTS)) {
    const d = dims[key];
    d.weight = weight;
    if (d.hasData && d.value != null) {
      weighted += d.value * weight;
      coverage += weight;
    }
  }

  const score = coverage >= MIN_COVERAGE ? Math.round((weighted / coverage) * 100) : null;

  return {
    departmentId: department.id,
    department: department.name,
    short: department.short,
    minister: department.minister,
    secretary: department.secretary,
    score,
    health: healthState(score),
    coverage: Math.round(coverage * 100) / 100,
    dimensions: dims,
    counts: {
      total,
      open: total - closed.length,
      closed: closed.length,
      breached: breached.length,
      atRisk: atRisk.length,
      reopened: reopened.length,
      negative: negative.length,
      awaitingCitizen: complaints.filter((c) => c.statusKey === 'AWAITING_CITIZEN').length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 5. State pulse
 * ------------------------------------------------------------------ */

function statePulse(scorecards) {
  const scored = scorecards.filter((s) => s.score != null);
  if (!scored.length) {
    return { score: null, health: 'DATA_GAP', drivers: [], departmentsScored: 0, departmentsTotal: scorecards.length };
  }
  const score = Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length);

  const drivers = Object.keys(SCORECARD_WEIGHTS).map((key) => {
    const withData = scored.filter((s) => s.dimensions[key].value != null);
    const avg = withData.length
      ? Math.round((withData.reduce((a, s) => a + s.dimensions[key].value, 0) / withData.length) * 100)
      : null;
    return {
      key,
      label: scored[0].dimensions[key].label,
      value: avg,
      weight: SCORECARD_WEIGHTS[key],
      departmentsWithData: withData.length,
    };
  });

  return {
    score,
    health: healthState(score),
    drivers,
    departmentsScored: scored.length,
    departmentsTotal: scorecards.length,
    weakest: [...scored].sort((a, b) => a.score - b.score)[0] || null,
    strongest: [...scored].sort((a, b) => b.score - a.score)[0] || null,
  };
}

/* ------------------------------------------------------------------ *
 * 6. Red-flag engine — exceptions, not statistics
 *
 * Attention score is a weighted sum of real signals. Only clusters and
 * individually severe cases surface; the CM sees a short list, not a feed.
 * ------------------------------------------------------------------ */

function redFlags(complaints, now) {
  const F = ATTENTION_FACTORS;
  const flags = [];

  // --- Signal A: geographic clusters of failing service ------------------
  const buckets = new Map();
  for (const c of complaints) {
    const sla = slaState(c, now);
    const failing = sla.state === 'BREACHED' || c.isReopened || c.satisfaction === 'Unsatisfied';
    if (!failing) continue;
    const key = `${c.departmentId}|${c.district}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ complaint: c, sla });
  }

  for (const [key, items] of buckets) {
    if (items.length < F.clusterMinimum) continue;
    const [, district] = key.split('|');
    const first = items[0].complaint;

    const breaches = items.filter((i) => i.sla.state === 'BREACHED');
    const reopens = items.filter((i) => i.complaint.isReopened);
    const unsatisfied = items.filter((i) => i.complaint.satisfaction === 'Unsatisfied');
    const showstoppers = items.filter((i) => i.complaint.severity === 'Show stopper');
    const worstBreach = Math.max(0, ...items.map((i) => i.sla.breachHours));

    const score = Math.round(
      breaches.length * F.slaBreach +
        showstoppers.length * F.showstopper +
        reopens.length * F.reopened +
        unsatisfied.length * F.unsatisfied +
        (items.length - F.clusterMinimum + 1) * F.clusterBonusPerComplaint
    );

    const categories = [...new Set(items.map((i) => i.complaint.category))];

    flags.push({
      id: `cluster:${key}`,
      type: 'SERVICE_CLUSTER',
      severity: score >= 140 ? 'CRITICAL' : score >= 90 ? 'HIGH' : 'MEDIUM',
      attentionScore: score,
      title: `${categories.join(' / ')} failing in ${district}`,
      what: `${items.length} complaints in ${district} under ${first.departmentShort} are breached, reopened or rejected by the citizen.`,
      why: `${breaches.length} past SLA (worst by ${worstBreach}h), ${reopens.length} reopened after being marked resolved, ${unsatisfied.length} resolutions rejected by citizens.`,
      where: district,
      departmentId: first.departmentId,
      department: first.departmentName,
      district,
      citizenImpact: items.length,
      accountability: {
        political: first.departmentName,
        administrative: null, // filled by the route from the department registry
      },
      recommendation:
        unsatisfied.length || reopens.length
          ? 'Resolutions are being rejected by citizens, not merely delayed. Recommend a Special Team with field verification before any further closure is accepted.'
          : 'Sustained SLA failure concentrated in one district. Recommend a directive with a named accountable authority and a dated deadline.',
      evidence: items
        .sort((a, b) => b.sla.breachHours - a.sla.breachHours)
        .slice(0, 6)
        .map((i) => ({
          id: i.complaint.id,
          title: i.complaint.title,
          citizenRef: i.complaint.citizenRef,
          sla: i.sla.state,
          breachHours: i.sla.breachHours,
          satisfaction: i.complaint.satisfaction,
        })),
    });
  }

  // --- Signal B: individually critical, badly overdue --------------------
  for (const c of complaints) {
    const sla = slaState(c, now);
    if (sla.state !== 'BREACHED') continue;
    if (c.severity !== 'Show stopper') continue;
    if (sla.breachHours < 48) continue;
    // Skip if already represented by a cluster flag.
    if (flags.some((f) => f.evidence.some((e) => e.id === c.id))) continue;

    flags.push({
      id: `severe:${c.id}`,
      type: 'SEVERE_BREACH',
      severity: 'HIGH',
      attentionScore: Math.round(F.slaBreach + F.showstopper + sla.breachHours / 4),
      title: c.title,
      what: `A showstopper complaint in ${c.district} is ${sla.breachHours}h past its SLA deadline.`,
      why: `Reported ${c.reportedAt ? new Date(c.reportedAt).toISOString().slice(0, 10) : 'recently'}, still ${c.stage.replace(/_/g, ' ').toLowerCase()}.`,
      where: c.district,
      departmentId: c.departmentId,
      department: c.departmentName,
      district: c.district,
      citizenImpact: 1,
      accountability: { political: c.departmentName, administrative: null },
      recommendation: 'Escalate to the department secretary and require a dated resolution commitment.',
      evidence: [{ id: c.id, title: c.title, citizenRef: c.citizenRef, sla: sla.state, breachHours: sla.breachHours, satisfaction: c.satisfaction }],
    });
  }

  return flags.sort((a, b) => b.attentionScore - a.attentionScore);
}

/* ------------------------------------------------------------------ *
 * 7. District rollup
 * ------------------------------------------------------------------ */

function districtPulse(complaints, now) {
  const map = new Map();
  for (const c of complaints) {
    if (!map.has(c.district)) {
      map.set(c.district, { district: c.district, total: 0, breached: 0, reopened: 0, unsatisfied: 0, departments: new Set() });
    }
    const d = map.get(c.district);
    d.total += 1;
    d.departments.add(c.departmentShort);
    if (slaState(c, now).state === 'BREACHED') d.breached += 1;
    if (c.isReopened) d.reopened += 1;
    if (c.satisfaction === 'Unsatisfied') d.unsatisfied += 1;
  }
  return [...map.values()]
    .map((d) => ({
      ...d,
      departments: [...d.departments],
      breachRate: d.total ? Math.round((d.breached / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.breached - a.breached || b.total - a.total);
}

module.exports = {
  normalizeComplaint,
  slaState,
  resolutionHours,
  classify,
  departmentScorecard,
  statePulse,
  redFlags,
  districtPulse,
  healthState,
  LIFECYCLE,
};
