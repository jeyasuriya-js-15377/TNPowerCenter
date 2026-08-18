'use strict';

/**
 * Demo data definitions.
 *
 * The Tiruvallur water cluster was seeded directly through the Zoho Projects
 * MCP server while the schema was being built. The remainder lives here so the
 * portal can be re-seeded at any time by calling POST /admin/seed as the
 * Chief Minister account — useful when re-recording a demo.
 *
 * Every record is prefixed DEMO DATA in Zoho. None of it is real government
 * information, and nothing here should ever be presented as such.
 *
 * `reportedAt` and `slaDue` are Power Center's own fields. Zoho's native
 * due_date rejects any value earlier than the record's created_time, which
 * makes it unusable for seeded history. See docs/WHAT_BROKE.md.
 */

const DEMO_COMPLAINTS = [
  /* --- Health & Family Welfare: broadly healthy, one weak spot --------- */
  {
    dept: 'Health', district: 'Chennai', category: 'Hospital Services',
    title: 'No paediatrician on duty at night - Royapuram UPHC',
    description: 'Night shift paediatric cover missing for three consecutive nights. Parents redirected to a hospital 11km away.',
    citizenRef: 'TN-000201', sentiment: 'Negative', confidence: '0.92', satisfaction: 'Pending',
    severity: 'CRITICAL', status: 'IN_PROGRESS',
    reportedAt: '2026-08-16T05:00:00.000Z', slaDue: '2026-08-20T05:00:00.000Z',
  },
  {
    dept: 'Health', district: 'Madurai', category: 'Hospital Services',
    title: 'Ambulance took 55 minutes to arrive - Thirumangalam',
    description: 'Emergency call response far outside the stated standard. Patient transported privately in the end.',
    citizenRef: 'TN-000202', sentiment: 'Negative', confidence: '0.90', satisfaction: 'Satisfied',
    severity: 'MAJOR', status: 'CLOSED',
    reportedAt: '2026-08-08T14:20:00.000Z', slaDue: '2026-08-12T14:20:00.000Z',
  },
  {
    dept: 'Health', district: 'Coimbatore', category: 'Hospital Services',
    title: 'Free medicine counter closed during stated hours',
    description: 'Counter shut at 15:00 against the posted 20:00 closing time on two visits.',
    citizenRef: 'TN-000203', sentiment: 'Neutral', confidence: '0.84', satisfaction: 'Satisfied',
    severity: 'MINOR', status: 'CLOSED',
    reportedAt: '2026-08-05T09:00:00.000Z', slaDue: '2026-08-12T09:00:00.000Z',
  },
  {
    dept: 'Health', district: 'Salem', category: 'Hospital Services',
    title: 'Ward cleanliness poor in government hospital',
    description: 'Toilets not cleaned through the day. Photographs submitted with the complaint.',
    citizenRef: 'TN-000204', sentiment: 'Negative', confidence: '0.81', satisfaction: 'Pending',
    severity: 'MAJOR', status: 'AWAITING_CITIZEN',
    reportedAt: '2026-08-14T07:30:00.000Z', slaDue: '2026-08-21T07:30:00.000Z',
  },
  {
    dept: 'Health', district: 'Thanjavur', category: 'Hospital Services',
    title: 'Vaccination camp did not take place as announced',
    description: 'Camp advertised for 12 Aug did not happen. No revised date communicated.',
    citizenRef: 'TN-000205', sentiment: 'Neutral', confidence: '0.78', satisfaction: 'Satisfied',
    severity: 'MINOR', status: 'CLOSED',
    reportedAt: '2026-08-12T06:00:00.000Z', slaDue: '2026-08-19T06:00:00.000Z',
  },

  /* --- Municipal: two more outside the Tiruvallur cluster -------------- */
  {
    dept: 'Municipal & Water', district: 'Chennai', category: 'Solid Waste',
    title: 'Garbage not collected for four days - Adyar',
    description: 'Street bins overflowing. Stray animal nuisance reported by residents.',
    citizenRef: 'TN-000107', sentiment: 'Negative', confidence: '0.88', satisfaction: 'Pending',
    severity: 'MAJOR', status: 'IN_PROGRESS',
    reportedAt: '2026-08-15T04:00:00.000Z', slaDue: '2026-08-19T04:00:00.000Z',
  },
  {
    dept: 'Municipal & Water', district: 'Coimbatore', category: 'Water Supply',
    title: 'Low pressure in piped supply - Peelamedu',
    description: 'Supply reaching ground floor only. Upper floors dependent on pumps.',
    citizenRef: 'TN-000108', sentiment: 'Neutral', confidence: '0.86', satisfaction: 'Satisfied',
    severity: 'MINOR', status: 'CLOSED',
    reportedAt: '2026-08-06T05:00:00.000Z', slaDue: '2026-08-13T05:00:00.000Z',
  },

  /* --- Highways: moderate pressure ------------------------------------ */
  {
    dept: 'Highways', district: 'Salem', category: 'Road Condition',
    title: 'Deep potholes causing two-wheeler accidents - Omalur road',
    description: 'Three accidents reported at the same stretch in a fortnight. No warning signage.',
    citizenRef: 'TN-000301', sentiment: 'Negative', confidence: '0.94', satisfaction: 'Pending',
    severity: 'SHOWSTOPPER', status: 'IN_PROGRESS',
    reportedAt: '2026-08-11T03:00:00.000Z', slaDue: '2026-08-12T03:00:00.000Z',
  },
  {
    dept: 'Highways', district: 'Madurai', category: 'Road Condition',
    title: 'Street lights not working on bypass for three weeks',
    description: 'Complete darkness on a 2km stretch. Residents avoiding the route after dark.',
    citizenRef: 'TN-000302', sentiment: 'Negative', confidence: '0.87', satisfaction: 'Pending',
    severity: 'MAJOR', status: 'OPEN',
    reportedAt: '2026-08-13T12:00:00.000Z', slaDue: '2026-08-17T12:00:00.000Z',
  },
  {
    dept: 'Highways', district: 'Thanjavur', category: 'Road Condition',
    title: 'Footpath encroachment blocking pedestrian access',
    description: 'Permanent stalls occupying the footpath, forcing pedestrians onto the carriageway.',
    citizenRef: 'TN-000303', sentiment: 'Neutral', confidence: '0.72', satisfaction: 'Pending',
    severity: 'MINOR', status: 'AWAITING_CITIZEN',
    reportedAt: '2026-08-14T08:00:00.000Z', slaDue: '2026-08-21T08:00:00.000Z',
  },

  /* --- Energy: performing well ---------------------------------------- */
  {
    dept: 'Energy', district: 'Coimbatore', category: 'Power Supply',
    title: 'Transformer failure caused 14 hour outage - Saravanampatti',
    description: 'Replacement completed. Citizen asked for compensation guidance for spoiled stock.',
    citizenRef: 'TN-000401', sentiment: 'Negative', confidence: '0.93', satisfaction: 'Satisfied',
    severity: 'CRITICAL', status: 'CLOSED',
    reportedAt: '2026-08-09T02:00:00.000Z', slaDue: '2026-08-11T02:00:00.000Z',
  },
  {
    dept: 'Energy', district: 'Chennai', category: 'Billing',
    title: 'Electricity bill three times the usual amount',
    description: 'Suspected incorrect meter reading. Requested re-reading and revised bill.',
    citizenRef: 'TN-000402', sentiment: 'Neutral', confidence: '0.89', satisfaction: 'Satisfied',
    severity: 'MINOR', status: 'CLOSED',
    reportedAt: '2026-08-07T10:00:00.000Z', slaDue: '2026-08-14T10:00:00.000Z',
  },
  {
    dept: 'Energy', district: 'Salem', category: 'Power Supply',
    title: 'Frequent voltage fluctuation damaging appliances',
    description: 'Repeated fluctuation over two weeks. Two households report damaged refrigerators.',
    citizenRef: 'TN-000403', sentiment: 'Negative', confidence: '0.85', satisfaction: 'Pending',
    severity: 'MAJOR', status: 'IN_PROGRESS',
    reportedAt: '2026-08-15T11:00:00.000Z', slaDue: '2026-08-19T11:00:00.000Z',
  },

  /* --- Revenue: slow, paperwork-bound --------------------------------- */
  {
    dept: 'Revenue', district: 'Thanjavur', category: 'Land Records',
    title: 'Patta transfer pending for five months',
    description: 'Application submitted in March. No status update despite three follow-up visits.',
    citizenRef: 'TN-000501', sentiment: 'Negative', confidence: '0.90', satisfaction: 'Pending',
    severity: 'MAJOR', status: 'OPEN',
    reportedAt: '2026-08-04T06:00:00.000Z', slaDue: '2026-08-11T06:00:00.000Z',
  },
  {
    dept: 'Revenue', district: 'Madurai', category: 'Land Records',
    title: 'Income certificate application rejected without reason',
    description: 'Rejection notice carried no stated ground. Citizen requesting written reasons.',
    citizenRef: 'TN-000502', sentiment: 'Negative', confidence: '0.83', satisfaction: 'Pending',
    severity: 'MINOR', status: 'AWAITING_CITIZEN',
    reportedAt: '2026-08-12T09:30:00.000Z', slaDue: '2026-08-19T09:30:00.000Z',
  },
  {
    dept: 'Revenue', district: 'Tiruvallur', category: 'Land Records',
    title: 'Encroachment on classified water body not acted on',
    description: 'Reported encroachment adjoining a tank. Referred between offices without action.',
    citizenRef: 'TN-000503', sentiment: 'Negative', confidence: '0.88', satisfaction: 'Pending',
    severity: 'CRITICAL', status: 'OPEN',
    reportedAt: '2026-08-10T07:00:00.000Z', slaDue: '2026-08-12T07:00:00.000Z',
  },
];

module.exports = { DEMO_COMPLAINTS };
