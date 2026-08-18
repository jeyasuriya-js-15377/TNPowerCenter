'use client';

import {
  healthClass,
  healthBg,
  scoreClass,
  percentHealth,
  attentionClass,
  clock,
} from '@/lib/format';

/* ── State pulse ──────────────────────────────────────────────────── */

function PulseStrip({ pulse, totals, scorecards }) {
  return (
    <div className="pulse-strip">
      <div className="pulse-main">
        <div className="pulse-label">State pulse</div>
        <div className={`pulse-score ${scoreClass(pulse.score)}`}>
          {pulse.score ?? '—'}
          <span style={{ fontSize: 20, color: 'var(--ink-3)' }}>/100</span>
        </div>
        <div className="pulse-state">
          <span className={`pill ${healthClass(pulse.health)}`}>
            {String(pulse.health).replace('_', ' ')}
          </span>
        </div>
        <div className="pulse-state muted" style={{ fontSize: 12 }}>
          {pulse.departmentsScored} of {pulse.departmentsTotal} departments scored
          {pulse.weakest && (
            <>
              <br />
              Weakest: <b>{pulse.weakest.short}</b> ({pulse.weakest.score})
            </>
          )}
        </div>
      </div>

      <div className="pulse-drivers">
        <div className="pulse-label">What is driving the score</div>
        {pulse.drivers.length === 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            No department has enough data to contribute a driver yet.
          </p>
        )}
        {pulse.drivers.map((driver) => (
          <div className="driver" key={driver.key}>
            <div>
              <div className="driver-name">
                {driver.label} <em>weight {Math.round(driver.weight * 100)}%</em>
              </div>
              <div className="bar">
                <i
                  className={healthBg(percentHealth(driver.value))}
                  style={{ width: `${driver.value ?? 100}%` }}
                />
              </div>
            </div>
            <div className={`driver-val ${scoreClass(driver.value)}`}>{driver.value ?? '—'}</div>
          </div>
        ))}
      </div>

      <div className="pulse-totals">
        <div className="pulse-label">Live counts</div>
        <div className="totals-grid">
          <div className="total-cell">
            <b>{totals.complaints}</b>
            <span>Complaints</span>
          </div>
          <div className="total-cell">
            <b className="c-crit">{totals.breached}</b>
            <span>SLA breached</span>
          </div>
          <div className="total-cell">
            <b className="c-risk">{totals.atRisk}</b>
            <span>At risk</span>
          </div>
          <div className="total-cell">
            <b className="c-warn">{totals.awaitingCitizen}</b>
            <span>Awaiting citizen</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
          {scorecards.length} department{scorecards.length === 1 ? '' : 's'} in scope
        </p>
      </div>
    </div>
  );
}

/* ── Requires CM attention ────────────────────────────────────────── */

function RedFlags({ flags, onOpen }) {
  if (!flags.length) {
    return (
      <div className="empty">
        Nothing currently requires executive attention.
        <br />
        <span style={{ fontSize: 12 }}>
          The engine surfaces clusters and severe breaches only — an empty list is a real answer,
          not a missing one.
        </span>
      </div>
    );
  }

  return (
    <div className="flag-list">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className={`flag sev-${flag.severity}`}
          onClick={() => onOpen({ kind: 'flag', data: flag })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen({ kind: 'flag', data: flag });
          }}
        >
          <div>
            <h3>{flag.title}</h3>
            <p className="what">{flag.what}</p>
            <p className="why">{flag.why}</p>
            <div className="flag-meta">
              <span className="chip">{flag.department}</span>
              <span className="chip">{flag.district}</span>
              <span className="chip">{flag.citizenImpact} citizens affected</span>
              <span className="chip">{String(flag.type).replace(/_/g, ' ')}</span>
            </div>
          </div>
          <div className="attention">
            <b className={attentionClass(flag.severity)}>{flag.attentionScore}</b>
            <span>Attention</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Department health ────────────────────────────────────────────── */

function Matrix({ scorecards, onOpen }) {
  return (
    <div className="matrix">
      {scorecards.map((card) => (
        <div
          key={card.departmentId}
          className="dept-row"
          onClick={() => onOpen({ kind: 'department', data: card })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen({ kind: 'department', data: card });
          }}
        >
          <div>
            <div className="dept-name">{card.department}</div>
            <div className="dept-sub">
              {card.counts.total} complaints · {card.counts.breached} breached ·{' '}
              {card.counts.reopened} reopened
            </div>
          </div>
          <div>
            <span className={`pill ${healthClass(card.health)}`}>
              {String(card.health).replace('_', ' ')}
            </span>
          </div>
          <div className={`dept-score ${scoreClass(card.score)}`}>{card.score ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

/* ── District pulse ───────────────────────────────────────────────── */

function Districts({ districts }) {
  if (!districts.length) return <div className="empty">No district data.</div>;

  return (
    <div className="district-list">
      {districts.map((d) => (
        <div className="district" key={d.district}>
          <div>
            <div className="district-name">{d.district}</div>
            <div className="district-sub">
              {d.total} complaints · {d.departments.length} departments
              {d.reopened ? ` · ${d.reopened} reopened` : ''}
            </div>
          </div>
          <div
            className={`district-num ${
              d.breachRate >= 50 ? 'c-crit' : d.breachRate >= 25 ? 'c-risk' : 'c-ok'
            }`}
          >
            {d.breachRate}%
            <div className="district-sub" style={{ textAlign: 'right' }}>
              breached
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── View ─────────────────────────────────────────────────────────── */

export default function CommandCenter({ dashboard, error, loading, openDrawer }) {
  if (error) {
    return (
      <section className="view">
        <div className="empty">
          Could not load the command center.
          <br />
          <b>{error}</b>
        </div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="view">
        <div className="skeleton">{loading ? 'Reading Zoho Projects…' : 'No data yet.'}</div>
      </section>
    );
  }

  const { pulse, totals, scorecards, redFlags, districts, freshness, scope } = dashboard;

  return (
    <section className="view">
      <PulseStrip pulse={pulse} totals={totals} scorecards={scorecards} />

      <h2 className="section-head">
        Requires CM attention
        <span className="hint">Exceptions only — ranked by attention score, not volume</span>
      </h2>
      <RedFlags flags={redFlags} onOpen={openDrawer} />

      <div className="split">
        <div>
          <h2 className="section-head">Department health</h2>
          <Matrix scorecards={scorecards} onOpen={openDrawer} />
        </div>
        <div>
          <h2 className="section-head">District pulse</h2>
          <Districts districts={districts} />
        </div>
      </div>

      <div className="freshness">
        <span>
          <b className="c-ok">{freshness.state}</b> · source: {freshness.source}
        </span>
        <span>Last read: {clock(freshness.lastUpdated)}</span>
        <span>
          Scope:{' '}
          {scope.type === 'GLOBAL'
            ? 'Statewide'
            : `${(scope.departmentIds || []).length} department(s)`}
        </span>
        {freshness.dataGaps.length > 0 && (
          <span className="c-gap">
            <b>{freshness.dataGaps.length} DATA GAP(S)</b> — reported, never counted as zero
          </span>
        )}
      </div>
    </section>
  );
}
