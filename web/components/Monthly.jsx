'use client';

import { useEffect, useState } from 'react';
import { healthClass, scoreClass, healthBg, percentHealth } from '@/lib/format';

/**
 * Monthly performance and the Department of the Month award.
 *
 * The Command Center answers "what is wrong now". This answers "who is actually
 * improving, and who deserves recognition" — and shows the reasoning, because an
 * award with no citation is just a number with a rosette on it.
 */
export default function Monthly({ request, notify }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await request('/dashboard/monthly?months=6');
        if (!cancelled) setReport(data);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        notify(err.message, 'bad');
      }
    })();
    return () => { cancelled = true; };
  }, [request, notify]);

  if (error) return <section className="view"><div className="empty">{error}</div></section>;
  if (!report) return <section className="view"><div className="skeleton">Computing monthly performance…</div></section>;

  const month = report.months[selected];
  if (!month) return <section className="view"><div className="empty">No monthly data yet.</div></section>;

  const delta = (n) =>
    n == null ? <span className="muted">—</span>
      : n > 0 ? <span className="c-ok">▲ {n}</span>
      : n < 0 ? <span className="c-crit">▼ {Math.abs(n)}</span>
      : <span className="muted">no change</span>;

  return (
    <section className="view">
      {/* month selector */}
      <div className="month-strip">
        {report.months.map((m, i) => (
          <button
            key={m.month}
            type="button"
            className={`month-chip${i === selected ? ' active' : ''}${m.complaints ? '' : ' empty'}`}
            onClick={() => setSelected(i)}
          >
            {/* Always rendered, even when blank, so every chip aligns and the
                tag can never overlap the month label. */}
            <span className="mc-tag">{m.isCurrent ? 'In progress' : ''}</span>
            <span className="mc-label">{m.label}</span>
            {m.complaints === 0 ? (
              <span className="mc-none">no data</span>
            ) : (
              <span className={`mc-score ${scoreClass(m.pulse.score)}`}>{m.pulse.score ?? '—'}</span>
            )}
            <span className="mc-sub">
              {m.complaints === 0 ? 'not yet seeded' : `${m.complaints} complaints`}
            </span>
          </button>
        ))}
      </div>

      {/* award */}
      <h2 className="section-head">
        Department of the Month
        <span className="hint">Highest departmental score, minimum {report.minimumVolume} complaints in the month</span>
      </h2>

      {month.award ? (
        <div className="award">
          <div className="award-medal">
            <span className="award-rank">1</span>
            <span className="award-label">{month.label}</span>
          </div>
          <div className="award-body">
            <h3>{month.award.department}</h3>
            <div className="flag-meta" style={{ marginBottom: 10 }}>
              <span className={`pill ${healthClass('HEALTHY')}`}>Score {month.award.score}/100</span>
              <span className="chip">{month.award.basis.complaintsHandled} complaints handled</span>
              <span className="chip">{month.award.basis.closedAndAccepted} accepted by citizens</span>
              <span className="chip">{month.award.basis.slaBreaches} SLA breaches</span>
            </div>
            <p className="award-citation">{month.award.citation}</p>

            <div className="dsec" style={{ marginTop: 14 }}>
              <h4>Basis for the award</h4>
              {Object.entries(month.award.basis.dimensions).map(([k, d]) => (
                <div className="driver" key={k} style={{ marginBottom: 9 }}>
                  <div>
                    <div className="driver-name">{d.label}</div>
                    <div className="bar">
                      <i className={healthBg(percentHealth(d.value))} style={{ width: `${d.value ?? 100}%` }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{d.detail}</div>
                  </div>
                  <div className={`driver-val ${scoreClass(d.value)}`}>{d.value ?? 'GAP'}</div>
                </div>
              ))}
            </div>

            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Accountable</dt><dd>{month.award.minister}</dd>
              <dt>Administrative</dt><dd>{month.award.secretary}</dd>
              {month.award.runnersUp.length > 0 && (
                <>
                  <dt>Placed ahead of</dt>
                  <dd>{month.award.runnersUp.map((u) => `${u.department} (${u.score})`).join(', ')}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      ) : (
        <div className="empty">
          No department cleared the {report.minimumVolume}-complaint minimum this month, so no award is given.
          <br />
          <span style={{ fontSize: 12 }}>An award on thin data would be meaningless — better to withhold it.</span>
        </div>
      )}

      {/* leaderboard + movement */}
      <div className="split">
        <div>
          <h2 className="section-head">Ranking — {month.label}</h2>
          <div className="table">
            <div className="trow head">
              <div>Department</div><div>Complaints</div><div>Breached</div><div>Change</div><div>Score</div>
            </div>
            {month.departments.map((d) => (
              <div className="trow" key={d.departmentId}>
                <div>
                  <div className="t-title">{d.department}</div>
                  <div className="t-sub">
                    <span className={healthClass(d.health)}>{String(d.health).replace('_', ' ')}</span>
                    {d.rank ? ` · rank ${d.rank}` : ' · unranked (below volume minimum)'}
                  </div>
                </div>
                <div className="t-mono">{d.counts.total}</div>
                <div className={`t-mono ${d.counts.breached ? 'c-crit' : 'c-ok'}`}>{d.counts.breached}</div>
                <div className="t-mono">{delta(d.delta)}</div>
                <div className={`dept-score ${scoreClass(d.score)}`}>{d.score ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="section-head">Movement</h2>
          <div className="card" style={{ gap: 16 }}>
            {month.mostImproved && (
              <div>
                <div className="pulse-label">Most improved</div>
                <div style={{ fontSize: 15, fontWeight: 550 }}>{month.mostImproved.department}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {delta(month.mostImproved.delta)} to {month.mostImproved.score}/100
                </div>
              </div>
            )}
            {month.needsAttention && (
              <div>
                <div className="pulse-label">Lowest ranked</div>
                <div style={{ fontSize: 15, fontWeight: 550 }}>{month.needsAttention.department}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {month.needsAttention.score}/100 across {month.needsAttention.counts.total} complaints
                </div>
              </div>
            )}
            <div>
              <div className="pulse-label">State pulse this month</div>
              <div className={`pulse-score ${scoreClass(month.pulse.score)}`} style={{ fontSize: 38 }}>
                {month.pulse.score ?? '—'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {month.pulse.departmentsScored} of {month.pulse.departmentsTotal} departments scored
              </div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>{report.note}</p>
        </div>
      </div>
    </section>
  );
}
