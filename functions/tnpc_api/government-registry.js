'use strict';

/**
 * Government registry — the configurable structure of the state government.
 *
 * The product specification is explicit that department structure must never be
 * hard-coded, and that every accountability relationship must be data. This file
 * is that data. Adding a department is an entry here plus a Zoho project; no
 * application code changes.
 *
 * IMPORTANT — provenance. Department and portfolio names follow the Tamil Nadu
 * secretariat structure, which is public fact. I could not read
 * tn.gov.in/cont_dir_department_list.php directly (the page renders client-side
 * and returns an empty document to a plain fetch), so this list is assembled
 * from the standard secretariat departments and may differ from the current
 * official list in naming or in recent reorganisations. Correct it here if it
 * matters for your use — nothing else needs to change.
 *
 * `minister` is the OFFICE, never a person. Secretary names are fictional.
 *
 * Phone numbers are deliberately non-dialable. Indian mobile numbers begin with
 * 6–9, so every number here starts with 5 and cannot connect to anyone. They
 * exist to demonstrate the contact-directory workflow, not to be called.
 */

/** Fictional senior officers, used for Principal Secretary assignments. */
const SECRETARY_POOL = [
  'Thiru A. Chandramohan', 'Thirumathi P. Revathi', 'Thiru D. Venkatesan',
  'Thiru R. Sathyanarayanan', 'Thirumathi G. Kalaiselvi', 'Thiru S. Panneerselvam',
  'Thirumathi M. Uma Maheswari', 'Thiru K. Balachandran', 'Thiru V. Rajasekar',
  'Thirumathi J. Nandhini', 'Thiru P. Aravindhan', 'Thirumathi R. Suganthi',
  'Thiru N. Thirunavukkarasu', 'Thiru L. Manikandan', 'Thirumathi S. Vaidehi',
  'Thiru C. Gopinath', 'Thirumathi A. Poongodi', 'Thiru M. Sivakumar',
  'Thiru T. Ravichandran', 'Thirumathi K. Jayanthi',
];

/**
 * `tier` drives how much demo volume a department receives.
 *   high   — departments that generate most citizen contact
 *   medium — regular but lower volume
 *   low    — policy or internal departments; little direct citizen traffic
 *
 * This is also honest: a Finance or Law department genuinely does not receive
 * drinking-water complaints, and a dashboard that pretended otherwise would be
 * less realistic, not more.
 */
const DEPARTMENT_SEED = [
  // ── high citizen contact ───────────────────────────────────────────
  ['municipal_water', 'Municipal Administration & Water Supply', 'Municipal & Water', 'Municipal Administration and Water Supply', 'high'],
  ['health', 'Health & Family Welfare', 'Health', 'Health and Family Welfare', 'high'],
  ['highways', 'Highways & Minor Ports', 'Highways', 'Highways and Minor Ports', 'high'],
  ['energy', 'Energy (TANGEDCO)', 'Energy', 'Electricity, Prohibition and Excise', 'high'],
  ['revenue', 'Revenue & Disaster Management', 'Revenue', 'Revenue and Disaster Management', 'high'],
  ['rural_development', 'Rural Development & Panchayat Raj', 'Rural Development', 'Rural Development and Panchayat Raj', 'high'],
  ['school_education', 'School Education', 'School Education', 'School Education', 'high'],
  ['transport', 'Transport', 'Transport', 'Transport', 'high'],

  // ── medium ────────────────────────────────────────────────────────
  ['social_welfare', 'Social Welfare & Women Empowerment', 'Social Welfare', 'Social Welfare and Women Empowerment', 'medium'],
  ['food_consumer', 'Co-operation, Food & Consumer Protection', 'Food & Consumer', 'Co-operation, Food and Consumer Protection', 'medium'],
  ['housing_urban', 'Housing & Urban Development', 'Housing', 'Housing and Urban Development', 'medium'],
  ['agriculture', 'Agriculture & Farmers Welfare', 'Agriculture', 'Agriculture and Farmers Welfare', 'medium'],
  ['water_resources', 'Water Resources', 'Water Resources', 'Water Resources', 'medium'],
  ['labour_skill', 'Labour Welfare & Skill Development', 'Labour', 'Labour Welfare and Skill Development', 'medium'],
  ['adi_dravidar', 'Adi Dravidar & Tribal Welfare', 'Adi Dravidar Welfare', 'Adi Dravidar and Tribal Welfare', 'medium'],
  ['bc_mbc_minorities', 'Backward Classes, MBC & Minorities Welfare', 'BC & Minorities', 'Backward Classes, Most Backward Classes and Minorities Welfare', 'medium'],
  ['higher_education', 'Higher Education', 'Higher Education', 'Higher Education', 'medium'],
  ['public_works', 'Public Works', 'Public Works', 'Public Works', 'medium'],
  ['animal_husbandry', 'Animal Husbandry, Dairying & Fisheries', 'Animal Husbandry', 'Animal Husbandry, Dairying and Fisheries', 'medium'],
  ['environment_forests', 'Environment, Climate Change & Forests', 'Environment & Forests', 'Environment, Climate Change and Forests', 'medium'],
  ['home_prohibition', 'Home, Prohibition & Excise', 'Home', 'Home, Prohibition and Excise', 'medium'],
  ['differently_abled', 'Welfare of Differently Abled Persons', 'Differently Abled Welfare', 'Welfare of Differently Abled Persons', 'medium'],

  // ── low direct citizen traffic ────────────────────────────────────
  ['commercial_taxes', 'Commercial Taxes & Registration', 'Commercial Taxes', 'Commercial Taxes and Registration', 'low'],
  ['msme', 'Micro, Small & Medium Enterprises', 'MSME', 'Micro, Small and Medium Enterprises', 'low'],
  ['industries', 'Industries, Investment Promotion & Commerce', 'Industries', 'Industries, Investment Promotion and Commerce', 'low'],
  ['handlooms_textiles', 'Handlooms, Handicrafts, Textiles & Khadi', 'Handlooms & Textiles', 'Handlooms, Handicrafts, Textiles and Khadi', 'low'],
  ['it_digital', 'Information Technology & Digital Services', 'IT & Digital', 'Information Technology and Digital Services', 'low'],
  ['tourism_culture', 'Tourism, Culture & Religious Endowments', 'Tourism & Culture', 'Tourism, Culture and Religious Endowments', 'low'],
  ['youth_sports', 'Youth Welfare & Sports Development', 'Youth & Sports', 'Youth Welfare and Sports Development', 'low'],
  ['milk_dairy', 'Milk & Dairy Development', 'Milk & Dairy', 'Milk and Dairy Development', 'low'],
  ['tamil_development', 'Tamil Development & Information', 'Tamil Development', 'Tamil Official Language and Tamil Culture', 'low'],
  ['information_publicity', 'Information & Publicity', 'Information', 'Information and Publicity', 'low'],
  ['finance', 'Finance', 'Finance', 'Finance', 'low'],
  ['planning_development', 'Planning & Development', 'Planning', 'Planning and Development', 'low'],
  ['personnel_admin', 'Personnel & Administrative Reforms', 'Personnel & AR', 'Personnel and Administrative Reforms', 'low'],
  ['law', 'Law', 'Law', 'Law', 'low'],
  ['public_secretariat', 'Public (Secretariat)', 'Public', 'Public', 'low'],
  ['special_programme', 'Special Programme Implementation', 'Special Programmes', 'Special Programme Implementation', 'low'],
];

/**
 * Non-dialable placeholder numbers.
 * Indian mobile numbers start 6–9; a leading 5 can never be assigned.
 */
/** 10 digits, always starting 5 → correct shape, permanently unassignable. */
const demoMobile = (i) => {
  const n = String(5000000000 + ((i * 1234567 + 731594) % 999999999));
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
};

/** Chennai STD 44 plus an 8-digit local number starting 5. */
const demoLandline = (i) => {
  const n = String(50000000 + ((i * 137913 + 240817) % 9999999));
  return `+91 44 ${n.slice(0, 4)} ${n.slice(4)}`;
};

const DEPARTMENTS = DEPARTMENT_SEED.map(([key, name, short, portfolio, tier], i) => ({
  key,
  name,
  short,
  tier,
  minister: `Hon’ble Minister for ${portfolio}`,
  secretary: `${SECRETARY_POOL[i % SECRETARY_POOL.length]}, IAS — Principal Secretary`,
  contacts: {
    ministerOffice: {
      label: 'Minister’s Office',
      holder: `Hon’ble Minister for ${portfolio}`,
      phone: demoLandline(i),
      email: `minister.${key}@tnpowercenter.demo`,
    },
    secretary: {
      label: 'Principal Secretary',
      holder: SECRETARY_POOL[i % SECRETARY_POOL.length],
      phone: demoMobile(i),
      email: `secretary.${key}@tnpowercenter.demo`,
    },
    controlRoom: {
      label: 'Department Control Room',
      holder: '24×7 Departmental Control Room',
      phone: demoLandline(i + 40),
      email: `controlroom.${key}@tnpowercenter.demo`,
    },
  },
}));

/**
 * Project IDs are NOT stored here — not even as a fallback.
 *
 * An earlier version kept five hard-coded IDs "just in case". Those projects were
 * later trashed during de-duplication and every read returned 410 RESOURCE_TRASHED,
 * breaking the app while the portal itself was fine. A stale ID fails louder and
 * later than a missing one. Departments are resolved by name at runtime — see
 * resolve-departments.js.
 */
const KNOWN_PROJECT_IDS = {};

const DEPARTMENT_BY_KEY = new Map(DEPARTMENTS.map((d) => [d.key, d]));
const DEPARTMENT_BY_NAME = new Map(DEPARTMENTS.map((d) => [d.name.toLowerCase(), d]));

const byTier = (tier) => DEPARTMENTS.filter((d) => d.tier === tier);

module.exports = {
  DEPARTMENTS,
  DEPARTMENT_BY_KEY,
  DEPARTMENT_BY_NAME,
  KNOWN_PROJECT_IDS,
  SECRETARY_POOL,
  demoMobile,
  demoLandline,
  byTier,
};
