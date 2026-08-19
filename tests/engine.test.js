'use strict';

/**
 * Engine tests. No network, no portal, no credentials — the engine is pure and
 * takes `now` as an argument, so every assertion below is deterministic.
 *
 * Run: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../functions/tnpc_api/engine');
const auth = require('../functions/tnpc_api/auth');
const { SEVERITY, ISSUE_STATUS, DEPARTMENTS } = require('../functions/tnpc_api/zoho-schema');

// Looked up by short name, not by index: the registry now carries 38
// departments and its ordering is not something tests should depend on.
const DEPT = DEPARTMENTS.find((d) => d.short === 'Municipal & Water');
const OTHER_DEPT = DEPARTMENTS.find((d) => d.short === 'Health');
const NOW = new Date('2026-08-19T00:00:00.000Z');

function issue(overrides = {}) {
  return {
    id: overrides.id || String(Math.random()).slice(2),
    name: overrides.name || 'Test complaint',
    description: overrides.description || '',
    status: { id: overrides.statusId || ISSUE_STATUS.OPEN },
    severity: { id: overrides.severityId || SEVERITY.MAJOR },
    created_time: '2026-08-15T00:00:00.000Z',
    district: overrides.district || 'Tiruvallur',
    complaint_category: overrides.category || 'Water Supply',
    citizen_ref: overrides.citizenRef || 'TN-000001',
    sentiment: overrides.sentiment || 'Negative',
    ai_confidence: '0.9',
    citizen_satisfaction: overrides.satisfaction || 'Pending',
    reported_at: overrides.reportedAt || '2026-08-15T00:00:00.000Z',
    sla_due: overrides.slaDue || '2026-08-20T00:00:00.000Z',
  };
}

const norm = (o) => engine.normalizeComplaint(issue(o), DEPT);

/* ── SLA engine ───────────────────────────────────────────────────── */

test('SLA: a deadline in the past is BREACHED, with the overrun in hours', () => {
  const c = norm({ slaDue: '2026-08-18T00:00:00.000Z' });
  const s = engine.slaState(c, NOW);
  assert.equal(s.state, 'BREACHED');
  assert.equal(s.breachHours, 24);
});

test('SLA: AT_RISK is reached before breach, not on it', () => {
  // Window 15 Aug → 19 Aug 06:00. At 19 Aug 00:00, 96 of 102 hours consumed.
  const c = norm({ slaDue: '2026-08-19T06:00:00.000Z' });
  const s = engine.slaState(c, NOW);
  assert.equal(s.state, 'AT_RISK');
  assert.ok(s.remainingMs > 0, 'AT_RISK must still have time remaining');
});

test('SLA: comfortably inside the window is DUE', () => {
  const c = norm({ slaDue: '2026-08-30T00:00:00.000Z' });
  assert.equal(engine.slaState(c, NOW).state, 'DUE');
});

test('SLA: closed complaints are RESOLVED and never breach retroactively', () => {
  const c = norm({ statusId: ISSUE_STATUS.CLOSED, slaDue: '2026-08-01T00:00:00.000Z' });
  const s = engine.slaState(c, NOW);
  assert.equal(s.state, 'RESOLVED');
  assert.equal(s.breachHours, 0);
});

test('SLA: with no explicit deadline, the policy supplies one by severity', () => {
  assert.equal(engine.resolutionHours('Show stopper'), 24);
  assert.equal(engine.resolutionHours('Minor'), 168);
});

/* ── Classifier ───────────────────────────────────────────────────── */

test('classifier: routes a water complaint to Municipal & Water with evidence', () => {
  const r = engine.classify(
    'No piped water supply for six days',
    'Drinking water has not reached our street. The tanker never arrived.'
  );
  assert.equal(r.department, 'Municipal Administration & Water Supply');
  assert.equal(r.category, 'Water Supply');
  assert.ok(r.evidence.matchedTerms.length > 0, 'must show the terms that drove the decision');
});

test('classifier: unrecognised text is sent to human review, not guessed', () => {
  const r = engine.classify('Xyzzy plugh', 'Nothing recognisable here at all.');
  assert.equal(r.department, null);
  assert.equal(r.routing, 'HUMAN_REVIEW_REQUIRED');
  assert.ok(r.confidence < 0.6);
});

test('classifier: urgency signals raise the priority', () => {
  const r = engine.classify(
    'Contaminated water, children hospitalised',
    'Two children hospitalised after drinking contaminated supply. Emergency.'
  );
  assert.equal(r.severity, 'Showstopper');
});

/* ── Scorecard ────────────────────────────────────────────────────── */

test('scorecard: a department with no data scores null and reads DATA_GAP', () => {
  const card = engine.departmentScorecard(DEPT, [], NOW);
  assert.equal(card.score, null);
  assert.equal(card.health, 'DATA_GAP');
});

test('scorecard: DATA_GAP is never treated as good performance', () => {
  const card = engine.departmentScorecard(DEPT, [], NOW);
  assert.notEqual(card.health, 'HEALTHY');
  assert.ok(card.score !== 100);
});

test('scorecard: breaches and rejected resolutions push the score down', () => {
  const healthy = [
    norm({ statusId: ISSUE_STATUS.CLOSED, satisfaction: 'Satisfied', slaDue: '2026-08-30T00:00:00.000Z' }),
    norm({ statusId: ISSUE_STATUS.CLOSED, satisfaction: 'Satisfied', slaDue: '2026-08-30T00:00:00.000Z' }),
    norm({ statusId: ISSUE_STATUS.CLOSED, satisfaction: 'Satisfied', slaDue: '2026-08-30T00:00:00.000Z' }),
  ];
  const failing = [
    norm({ slaDue: '2026-08-10T00:00:00.000Z', satisfaction: 'Unsatisfied' }),
    norm({ slaDue: '2026-08-11T00:00:00.000Z', statusId: ISSUE_STATUS.REOPENED, satisfaction: 'Unsatisfied' }),
    norm({ slaDue: '2026-08-12T00:00:00.000Z' }),
  ];
  const good = engine.departmentScorecard(DEPT, healthy, NOW);
  const bad = engine.departmentScorecard(DEPT, failing, NOW);
  assert.ok(good.score > bad.score, `expected ${good.score} > ${bad.score}`);
  assert.equal(good.health, 'HEALTHY');
  assert.ok(['CRITICAL', 'AT_RISK'].includes(bad.health));
});

/* ── Red-flag engine ──────────────────────────────────────────────── */

test('red flags: a district cluster of failures surfaces with evidence', () => {
  const cluster = [
    norm({ id: 'a', slaDue: '2026-08-10T00:00:00.000Z' }),
    norm({ id: 'b', slaDue: '2026-08-11T00:00:00.000Z' }),
    norm({ id: 'c', slaDue: '2026-08-12T00:00:00.000Z', satisfaction: 'Unsatisfied' }),
  ];
  const flags = engine.redFlags(cluster, NOW);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, 'SERVICE_CLUSTER');
  assert.equal(flags[0].district, 'Tiruvallur');
  assert.ok(flags[0].evidence.length >= 3, 'a flag must cite the records behind it');
  assert.ok(flags[0].attentionScore > 0);
});

test('red flags: healthy departments produce no noise', () => {
  const fine = [
    norm({ statusId: ISSUE_STATUS.CLOSED, satisfaction: 'Satisfied' }),
    norm({ slaDue: '2026-08-30T00:00:00.000Z' }),
  ];
  assert.equal(engine.redFlags(fine, NOW).length, 0);
});

test('red flags: two complaints are not a cluster', () => {
  const two = [
    norm({ id: 'a', slaDue: '2026-08-10T00:00:00.000Z' }),
    norm({ id: 'b', slaDue: '2026-08-11T00:00:00.000Z' }),
  ];
  assert.equal(engine.redFlags(two, NOW).filter((f) => f.type === 'SERVICE_CLUSTER').length, 0);
});

test('red flags: are ranked by attention score, highest first', () => {
  const mixed = [
    ...['a', 'b', 'c'].map((id) => norm({ id, district: 'Salem', slaDue: '2026-08-18T00:00:00.000Z' })),
    ...['d', 'e', 'f', 'g'].map((id) =>
      norm({ id, district: 'Tiruvallur', slaDue: '2026-08-05T00:00:00.000Z',
        severityId: SEVERITY.SHOWSTOPPER, satisfaction: 'Unsatisfied' })),
  ];
  const flags = engine.redFlags(mixed, NOW);
  assert.ok(flags.length >= 2);
  assert.ok(flags[0].attentionScore >= flags[1].attentionScore);
  assert.equal(flags[0].district, 'Tiruvallur');
});

/* ── Authorisation: visibility is not authority ───────────────────── */

test('auth: the Chief Minister can issue a directive', () => {
  const s = auth.login('cm@tnpowercenter.in', 'PowerCenter@2026');
  assert.ok(s, 'login should succeed');
  const claims = auth.verify(s.token);
  assert.equal(auth.can(claims, 'directive:issue'), true);
});

test('auth: the War Room analyst sees everything and cannot issue a directive', () => {
  const s = auth.login('warroom@tnpowercenter.in', 'WarRoom@2026');
  const claims = auth.verify(s.token);
  assert.equal(auth.can(claims, 'dashboard:executive'), true, 'full visibility');
  assert.equal(auth.can(claims, 'redflag:investigate'), true, 'can investigate');
  assert.equal(auth.can(claims, 'directive:issue'), false, 'but holds no executive authority');
});

test('auth: a department team is confined to its own department', () => {
  const s = auth.login('water@tnpowercenter.in', 'Water@2026');
  const claims = auth.verify(s.token);
  assert.equal(auth.inScope(claims, DEPT), true, 'own department');
  assert.equal(auth.inScope(claims, OTHER_DEPT), false, 'another department');
  assert.equal(auth.inScope(claims, 'municipal_water'), true, 'by key');
  assert.equal(auth.inScope(claims, 'health'), false, 'other key');
  assert.equal(auth.scopedDepartments(claims, DEPARTMENTS).length, 1);
});

test('auth: a bad password is rejected', () => {
  assert.equal(auth.login('cm@tnpowercenter.in', 'wrong'), null);
  assert.equal(auth.login('nobody@example.com', 'PowerCenter@2026'), null);
});

test('auth: a tampered token fails verification', () => {
  const s = auth.login('water@tnpowercenter.in', 'Water@2026');
  const [payload] = s.token.split('.');
  assert.equal(auth.verify(`${payload}.forgedsignature`), null);
});

/* ── State pulse ──────────────────────────────────────────────────── */

test('pulse: reports how many departments actually had enough data to score', () => {
  const cards = [
    engine.departmentScorecard(DEPT, [norm({ statusId: ISSUE_STATUS.CLOSED, satisfaction: 'Satisfied' })], NOW),
    engine.departmentScorecard(OTHER_DEPT, [], NOW),
  ];
  const p = engine.statePulse(cards);
  assert.equal(p.departmentsTotal, 2);
  assert.equal(p.departmentsScored, 1);
});
