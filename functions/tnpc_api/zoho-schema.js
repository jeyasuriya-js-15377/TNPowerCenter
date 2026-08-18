'use strict';

/**
 * Tamil Nadu Power Center — Zoho Projects schema map.
 *
 * Zoho Projects is the ONLY system of record. This file is the single place
 * that knows how government concepts map onto Zoho Projects primitives.
 *
 *   Department            → Zoho Project
 *   Citizen complaint     → Zoho Issue
 *   Operational action    → Zoho Task
 *   Mission milestone     → Zoho Milestone (Phase)
 *   Officer               → Zoho portal User (ZPUID)
 *   District              → custom module `district`
 *   CM directive          → custom module `cm_directive`
 *   Citizen validation    → custom module `citizen_feedback`
 *   Executive red flag    → computed live; actioned flags stored in `red_flag`
 *
 * Every ID below was created through the Zoho Projects MCP server.
 */

const PORTAL_ID = process.env.ZOHO_PORTAL_ID || '60083686827';

/** Secretariat departments. `id` is the Zoho Project ID. */
const DEPARTMENTS = [
  {
    id: '479100000000079186',
    name: 'Health & Family Welfare',
    short: 'Health',
    minister: 'Hon. Minister for Health & Family Welfare',
    secretary: 'Principal Secretary, Health & Family Welfare',
  },
  {
    id: '479100000000079263',
    name: 'Municipal Administration & Water Supply',
    short: 'Municipal & Water',
    minister: 'Hon. Minister for Municipal Administration',
    secretary: 'Principal Secretary, MAWS',
  },
  {
    id: '479100000000076361',
    name: 'Highways & Minor Ports',
    short: 'Highways',
    minister: 'Hon. Minister for Highways',
    secretary: 'Principal Secretary, Highways',
  },
  {
    id: '479100000000081232',
    name: 'Energy (TANGEDCO)',
    short: 'Energy',
    minister: 'Hon. Minister for Electricity',
    secretary: 'Principal Secretary, Energy',
  },
  {
    id: '479100000000079340',
    name: 'Revenue & Disaster Management',
    short: 'Revenue',
    minister: 'Hon. Minister for Revenue',
    secretary: 'Principal Secretary, Revenue',
  },
];

/** Custom modules created via MCP. */
const MODULES = {
  district: 'district',
  directive: 'cm_directive',
  redFlag: 'red_flag',
  feedback: 'citizen_feedback',
};

/**
 * Native Zoho Issue statuses, reused as the complaint lifecycle.
 * Chosen deliberately so no status configuration is required:
 *   Open       → RECEIVED / ROUTED / ASSIGNED
 *   InProgress → IN_PROGRESS
 *   ToBeTested → RESOLVED, awaiting citizen validation
 *   Closed     → CLOSED (citizen confirmed)
 *   Reopen     → REOPENED (citizen rejected the resolution)
 */
const ISSUE_STATUS = {
  OPEN: '479100000000075054',
  IN_PROGRESS: '479100000000075055',
  AWAITING_CITIZEN: '479100000000075056',
  CLOSED: '479100000000075057',
  REOPENED: '479100000000075058',
};

const ISSUE_STATUS_BY_ID = Object.fromEntries(
  Object.entries(ISSUE_STATUS).map(([k, v]) => [v, k])
);

/** Native severity picklist, reused as complaint priority. */
const SEVERITY = {
  NONE: '479100000000075091',
  SHOWSTOPPER: '479100000000075092',
  CRITICAL: '479100000000075093',
  MAJOR: '479100000000075094',
  MINOR: '479100000000075095',
};

const SEVERITY_BY_ID = {
  '479100000000075091': { label: 'None', weight: 1 },
  '479100000000075092': { label: 'Showstopper', weight: 5 },
  '479100000000075093': { label: 'Critical', weight: 4 },
  '479100000000075094': { label: 'Major', weight: 3 },
  '479100000000075095': { label: 'Minor', weight: 2 },
};

/**
 * Custom field API names created on the Issues module via MCP.
 * NOTE: `sla_due` is authoritative. Zoho's native `due_date` is not used —
 * it rejects any value earlier than the record's created_time, which makes it
 * unusable as a migrated/backdated SLA deadline. See docs/WHAT_BROKE.md.
 */
const ISSUE_FIELDS = {
  citizenRef: 'citizen_ref',
  district: 'district',
  category: 'complaint_category',
  sentiment: 'sentiment',
  aiConfidence: 'ai_confidence',
  satisfaction: 'citizen_satisfaction',
  slaDue: 'sla_due',
  reportedAt: 'reported_at',
};

/** Custom field API names on the custom modules. */
const DIRECTIVE_FIELDS = {
  objective: 'objective',
  department: 'cm_directive_cf_0001',
  accountableAuthority: 'accountable_authority',
  deadline: 'deadline',
  status: 'directive_status',
};

const FEEDBACK_FIELDS = {
  complaintRef: 'complaint_ref',
  satisfied: 'satisfied',
  rating: 'rating',
  department: 'feedback_department',
};

const DISTRICT_FIELDS = {
  code: 'district_code',
  region: 'region',
};

/**
 * SLA policy registry. Power Center owns SLA intelligence — these are NOT
 * read from Zoho. Resolution windows are in hours, keyed by severity.
 * Configuration, not code: edit here (or move to a Catalyst data store)
 * without touching engine logic.
 */
const SLA_POLICY = {
  default: { showstopper: 24, critical: 48, major: 96, minor: 168, none: 168 },
  atRiskThreshold: 0.8, // flag AT_RISK once 80% of the window is consumed
};

/** Executive scorecard weights. Configurable, must sum to 1. */
const SCORECARD_WEIGHTS = {
  citizenOutcome: 0.3,
  complaintPerformance: 0.25,
  slaPerformance: 0.3,
  riskTrend: 0.15,
};

/** Health bands. DATA_GAP is never treated as good performance. */
const HEALTH_BANDS = [
  { state: 'HEALTHY', min: 85 },
  { state: 'WATCH', min: 70 },
  { state: 'AT_RISK', min: 55 },
  { state: 'CRITICAL', min: 0 },
];

/** Minimum share of scorecard weight that must be backed by data. */
const MIN_COVERAGE = 0.6;

/** Red-flag attention scoring factors. Configurable. */
const ATTENTION_FACTORS = {
  slaBreach: 22,
  showstopper: 14,
  critical: 9,
  negativeSentiment: 6,
  reopened: 18,
  unsatisfied: 16,
  clusterBonusPerComplaint: 5,
  clusterMinimum: 3,
};

module.exports = {
  PORTAL_ID,
  DEPARTMENTS,
  MODULES,
  ISSUE_STATUS,
  ISSUE_STATUS_BY_ID,
  SEVERITY,
  SEVERITY_BY_ID,
  ISSUE_FIELDS,
  DIRECTIVE_FIELDS,
  FEEDBACK_FIELDS,
  DISTRICT_FIELDS,
  SLA_POLICY,
  SCORECARD_WEIGHTS,
  HEALTH_BANDS,
  MIN_COVERAGE,
  ATTENTION_FACTORS,
};
