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

const registry = require('./government-registry');

const PORTAL_ID = process.env.ZOHO_PORTAL_ID || '60083686827';

/**
 * Secretariat departments.
 *
 * Sourced from `government-registry.js`, which carries all 38 secretariat
 * departments with portfolio titles, fictional Principal Secretaries and
 * non-dialable contact numbers.
 *
 * `id` is the Zoho Project ID and is resolved AT RUNTIME by matching the
 * project name — see resolveDepartments() in index.js. The five IDs baked into
 * the registry are a fallback so a portal seeded before that change keeps
 * working. Everything else starts null and is filled in on first load.
 */
const DEPARTMENTS = registry.DEPARTMENTS.map((d) => ({ ...d, id: null }));

/** Departments that have a resolved Zoho project and can therefore be read. */
const activeDepartments = () => DEPARTMENTS.filter((d) => d.id);

/**
 * Officer roster.
 *
 * Zoho portal users take their display name from the Zoho account, so an
 * invited alias renders as "jeyasuriya.js+tvl.water" — accurate but useless on
 * an executive screen. Each alias is therefore mapped to the officer persona it
 * represents, and the engine substitutes the persona when it shapes a complaint.
 *
 * Assignment in Zoho is real: these are genuine portal users holding genuine
 * issues. Only the label shown to the Chief Minister is resolved through here.
 */
/**
 * Officer accounts are invited at a non-routable domain, so the address derives
 * from the officer's own name — Zoho shows `thiru.r.sundaram` rather than a
 * `+alias` on somebody's personal mailbox. No Zoho account is required and the
 * invitation cannot reach a real inbox, which is the point: `.demo` is not a
 * delegated TLD. (`.invalid` is the RFC-reserved equivalent if you prefer it.)
 */
const OFFICER_EMAIL_DOMAIN = process.env.OFFICER_EMAIL_DOMAIN || 'tnpowercenter.demo';

/** "Thirumathi S. Bhuvaneswari" → "thirumathi.s.bhuvaneswari" */
const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

const officerEmail = (name) => `${slug(name)}@${OFFICER_EMAIL_DOMAIN}`;

/**
 * These officers are fictional. Designations and the reporting structure follow
 * real Tamil Nadu administrative practice — Executive Engineer, Tahsildar,
 * Revenue Divisional Officer, Deputy Director of Medical Services — but no
 * individual named here is a real person, and the performance data attached to
 * them is synthetic.
 */
const OFFICERS = [
  // Municipal Administration & Water Supply
  { name: 'Thiru R. Sundaram', designation: 'Executive Engineer, Water Supply', dept: 'Municipal & Water', district: 'Tiruvallur' },
  { name: 'Thirumathi K. Vasanthi', designation: 'Assistant Commissioner, Solid Waste', dept: 'Municipal & Water', district: 'Chennai' },
  { name: 'Thiru M. Ilangovan', designation: 'Assistant Engineer, Water Supply', dept: 'Municipal & Water', district: 'Coimbatore' },
  { name: 'Thiru S. Balamurugan', designation: 'Municipal Commissioner', dept: 'Municipal & Water', district: 'Madurai' },
  // Health & Family Welfare
  { name: 'Dr. S. Anitha', designation: 'Deputy Director of Medical Services', dept: 'Health', district: 'Chennai' },
  { name: 'Dr. P. Ramanathan', designation: 'Joint Director of Health Services', dept: 'Health', district: 'Madurai' },
  { name: 'Dr. K. Vijayalakshmi', designation: 'District Health Officer', dept: 'Health', district: 'Coimbatore' },
  // Highways & Minor Ports
  { name: 'Thiru V. Karthikeyan', designation: 'Divisional Engineer, Highways', dept: 'Highways', district: 'Salem' },
  { name: 'Thiru A. Selvaraj', designation: 'Assistant Divisional Engineer', dept: 'Highways', district: 'Madurai' },
  { name: 'Thiru J. Ganesan', designation: 'Divisional Engineer, Highways', dept: 'Highways', district: 'Thanjavur' },
  // Energy
  { name: 'Thiru G. Prabhakaran', designation: 'Executive Engineer, Operation & Maintenance', dept: 'Energy', district: 'Coimbatore' },
  { name: 'Thirumathi R. Deepa', designation: 'Assistant Executive Engineer', dept: 'Energy', district: 'Chennai' },
  { name: 'Thiru P. Muthukumar', designation: 'Executive Engineer, Distribution', dept: 'Energy', district: 'Salem' },
  // Revenue & Disaster Management
  { name: 'Thiru K. Murugesan', designation: 'Tahsildar', dept: 'Revenue', district: 'Thanjavur' },
  { name: 'Thirumathi S. Bhuvaneswari', designation: 'Deputy Tahsildar', dept: 'Revenue', district: 'Tiruvallur' },
  { name: 'Thiru N. Arivazhagan', designation: 'Revenue Divisional Officer', dept: 'Revenue', district: 'Madurai' },
].map((o, i) => ({
  ...o,
  alias: slug(o.name),
  email: officerEmail(o.name),
  // Non-dialable by construction — see government-registry.js.
  phone: registry.demoMobile(i + 60),
  officePhone: registry.demoLandline(i + 80),
}));

const OFFICER_BY_EMAIL = new Map(OFFICERS.map((o) => [o.email.toLowerCase(), o]));

/**
 * The original portal accounts, kept mapped so complaints seeded before the
 * officer roster existed still read sensibly instead of showing a login alias.
 */
const LEGACY_OFFICERS = new Map([
  ['jeyasuriya.js+cm@zohotest.com', { name: 'CM War Room', designation: 'Chief Minister’s Office' }],
  ['jeyasuriya.js+inlivetrail@zohotest.com', { name: 'Thiru N. Rajagopal', designation: 'Nodal Officer' }],
  ['jeyasuriya.js+zia@zohotest.com', { name: 'Thirumathi L. Meenakshi', designation: 'Assistant Engineer' }],
  ['jeyasuriya.js+tvl.water@zohotest.com', { name: 'Thiru R. Sundaram', designation: 'Executive Engineer, Water Supply' }],
]);

/**
 * Resolve a Zoho assignee into an officer persona.
 * Falls back to whatever Zoho reports, so an unmapped user is never hidden.
 */
function resolveOfficer(assignee) {
  if (!assignee) return null;
  const email = String(assignee.email || '').toLowerCase();
  const match = OFFICER_BY_EMAIL.get(email) || LEGACY_OFFICERS.get(email);
  return {
    id: assignee.zpuid || assignee.id || null,
    email: assignee.email || null,
    name: match ? match.name : assignee.name || 'Unassigned',
    designation: match ? match.designation : null,
  };
}

/** Revenue districts covered by the demo portal. */
const DISTRICTS = [
  { name: 'Chennai', code: 'TN-CHN', region: 'Chennai' },
  { name: 'Tiruvallur', code: 'TN-TVL', region: 'Chennai' },
  { name: 'Kancheepuram', code: 'TN-KPM', region: 'Chennai' },
  { name: 'Coimbatore', code: 'TN-CBE', region: 'Coimbatore' },
  { name: 'Tiruppur', code: 'TN-TRP', region: 'Coimbatore' },
  { name: 'Madurai', code: 'TN-MDU', region: 'Madurai' },
  { name: 'Ramanathapuram', code: 'TN-RMD', region: 'Madurai' },
  { name: 'Salem', code: 'TN-SLM', region: 'Salem' },
  { name: 'Erode', code: 'TN-ERD', region: 'Salem' },
  { name: 'Thanjavur', code: 'TN-TNJ', region: 'Trichy' },
  { name: 'Tiruchirappalli', code: 'TN-TRY', region: 'Trichy' },
  { name: 'Tirunelveli', code: 'TN-TVL2', region: 'Tirunelveli' },
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
  activeDepartments,
  DEPARTMENT_BY_KEY: registry.DEPARTMENT_BY_KEY,
  DEPARTMENT_BY_NAME: registry.DEPARTMENT_BY_NAME,
  OFFICERS,
  OFFICER_BY_EMAIL,
  resolveOfficer,
  officerEmail,
  DISTRICTS,
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
