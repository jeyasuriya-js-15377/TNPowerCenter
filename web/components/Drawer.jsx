'use client';

import { useEffect, useState } from 'react';
import {
  healthClass,
  healthBg,
  scoreClass,
  fractionHealth,
  slaClass,
  humanise,
  time,
  inDays,
} from '@/lib/format';

/* ── Shell ────────────────────────────────────────────────────────── */

export default function Drawer(props) {
  const { drawer, closeDrawer } = props;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [closeDrawer]);

  return (
    <div className="drawer">
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <aside className="drawer-panel">
        <button type="button" className="drawer-close" onClick={closeDrawer} aria-label="Close">
          ×
        </button>

        {drawer.kind === 'flag' && <RedFlagBody flag={drawer.data} {...props} />}
        {drawer.kind === 'department' && <DepartmentBody card={drawer.data} />}
        {drawer.kind === 'complaint' && <ComplaintBody id={drawer.data.id} {...props} />}
        {drawer.kind === 'directiveIssued' && <DirectiveIssuedBody result={drawer.data} />}
      </aside>
    </div>
  );
}

/* ── Red flag investigation ───────────────────────────────────────── */

function RedFlagBody({ flag, user, request, notify, openDrawer, refreshDashboard }) {
  const canIssue = user.permissions.includes('directive:issue');

  const [title, setTitle] = useState(`Restore service reliability in ${flag.district}`);
  const [objective, setObjective] = useState(
    `Resolve all breached complaints in ${flag.district} under ${flag.department} within 7 days, with field verification before any complaint is marked resolved. Report daily to the CM War Room.`
  );
  const [deadline, setDeadline] = useState(inDays(7));
  const [busy, setBusy] = useState(false);

  const issue = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await request('/directives', {
        method: 'POST',
        body: {
          title,
          objective,
          departmentId: flag.departmentId,
          deadline,
          redFlagId: flag.id,
        },
      });
      openDrawer({ kind: 'directiveIssued', data: result });
      notify('Directive issued.', 'ok');
      refreshDashboard(false);
    } catch (err) {
      notify(err.message, 'bad');
      setBusy(false);
    }
  };

  return (
    <>
      <h2>{flag.title}</h2>
      <div className="flag-meta" style={{ marginBottom: 6 }}>
        <span className="chip">Attention {flag.attentionScore}</span>
        <span className="chip">{flag.severity}</span>
        <span className="chip">{flag.district}</span>
      </div>

      <div className="dsec">
        <h4>What is happening</h4>
        <p>{flag.what}</p>
      </div>

      <div className="dsec">
        <h4>Why it matters</h4>
        <p>{flag.why}</p>
      </div>

      <div className="dsec">
        <h4>Who is accountable</h4>
        <dl className="kv">
          <dt>Department</dt>
          <dd>{flag.department}</dd>
          <dt>Political</dt>
          <dd>{flag.accountability.political.holder}</dd>
          <dt>Administrative</dt>
          <dd>{flag.accountability.administrative.holder}</dd>
        </dl>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {flag.accountability.note}
        </p>
      </div>

      <div className="dsec">
        <h4>
          Evidence — {flag.evidence.length} of {flag.citizenImpact} complaints
        </h4>
        {flag.evidence.map((e) => (
          <div className="evidence" key={e.id}>
            <div className="e-title">{e.title}</div>
            <div className="e-meta">
              {e.citizenRef || 'no reference'} ·{' '}
              <span className={slaClass(e.sla)}>
                {e.sla}
                {e.breachHours ? ` by ${e.breachHours}h` : ''}
              </span>
              {e.satisfaction === 'Unsatisfied' && (
                <> · <span className="c-crit">citizen rejected the resolution</span></>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="dsec">
        <h4>Recommended action</h4>
        <div className="notice warn">{flag.recommendation}</div>
      </div>

      <div className="dsec">
        <h4>Issue a CM directive</h4>

        {canIssue ? (
          <form onSubmit={issue} style={{ display: 'grid', gap: 11 }}>
            <label>
              Directive title
              <input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Objective
              <textarea
                required
                rows={3}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </label>
            <label>
              Deadline
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Issuing…' : 'Issue directive'}
            </button>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              This is a privileged, audited action. It creates a directive record and real execution
              work in the responsible department.
            </p>
          </form>
        ) : (
          <div className="notice bad">
            Your role (<b>{humanise(user.role)}</b>) can investigate and prepare, but cannot issue a
            directive. Visibility and authority are deliberately separate, and the rule is enforced
            on the server — not by hiding this button.
          </div>
        )}
      </div>
    </>
  );
}

/* ── Directive issued confirmation ────────────────────────────────── */

function DirectiveIssuedBody({ result }) {
  return (
    <>
      <h2>Directive issued</h2>
      <div className="notice ok">
        The directive is recorded and execution work has been created in the
        responsible department.
      </div>
      <div className="dsec">
        <dl className="kv">
          <dt>Directive</dt>
          <dd>{result.directive.title}</dd>
          <dt>Department</dt>
          <dd>{result.directive.department}</dd>
          <dt>Status</dt>
          <dd>{result.directive.status}</dd>
          <dt>Execution task</dt>
          <dd>{result.execution.zohoTaskId || result.execution.detail}</dd>
          <dt>Issued by</dt>
          <dd>
            {result.audit.actor} ({humanise(result.audit.role)})
          </dd>
          <dt>At</dt>
          <dd>{time(result.audit.at)}</dd>
        </dl>
      </div>
    </>
  );
}

/* ── Department 360 ───────────────────────────────────────────────── */

function DepartmentBody({ card }) {
  return (
    <>
      <h2>{card.department}</h2>
      <div className="flag-meta" style={{ marginBottom: 6 }}>
        <span className={`pill ${healthClass(card.health)}`}>
          {String(card.health).replace('_', ' ')}
        </span>
        <span className="chip">Score {card.score ?? '—'}</span>
        <span className="chip">Coverage {Math.round(card.coverage * 100)}%</span>
      </div>

      <div className="dsec">
        <h4>Accountability</h4>
        <dl className="kv">
          <dt>Political</dt>
          <dd>{card.minister}</dd>
          <dt>Administrative</dt>
          <dd>{card.secretary}</dd>
        </dl>
      </div>

      <div className="dsec">
        <h4>Scorecard breakdown</h4>
        {Object.entries(card.dimensions).map(([key, d]) => (
          <div className="driver" style={{ marginBottom: 12 }} key={key}>
            <div>
              <div className="driver-name">
                {d.label} <em>weight {Math.round(d.weight * 100)}%</em>
              </div>
              <div className="bar">
                <i
                  className={healthBg(fractionHealth(d.value))}
                  style={{ width: `${d.value == null ? 100 : Math.round(d.value * 100)}%` }}
                />
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                {d.detail}
              </div>
            </div>
            <div
              className={`driver-val ${
                d.value == null ? 'c-gap' : scoreClass(Math.round(d.value * 100))
              }`}
            >
              {d.value == null ? 'GAP' : Math.round(d.value * 100)}
            </div>
          </div>
        ))}

        {card.score == null && (
          <div className="notice warn">
            Too little of this scorecard is backed by data to produce a score. This is reported as a
            DATA GAP — it is never shown as good performance.
          </div>
        )}
      </div>

      <div className="dsec">
        <h4>Counts</h4>
        <dl className="kv">
          <dt>Total complaints</dt>
          <dd>{card.counts.total}</dd>
          <dt>Open</dt>
          <dd>{card.counts.open}</dd>
          <dt>SLA breached</dt>
          <dd className="c-crit">{card.counts.breached}</dd>
          <dt>At risk</dt>
          <dd className="c-risk">{card.counts.atRisk}</dd>
          <dt>Reopened by citizens</dt>
          <dd className="c-crit">{card.counts.reopened}</dd>
          <dt>Awaiting validation</dt>
          <dd>{card.counts.awaitingCitizen}</dd>
        </dl>
      </div>
    </>
  );
}

/* ── Complaint 360 ────────────────────────────────────────────────── */

function ComplaintBody({ id, request, notify, closeDrawer, refreshDashboard }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await request(`/complaints/${id}`);
        if (!cancelled) setDetail(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, request]);

  const validate = async (satisfied) => {
    setBusy(true);
    try {
      const result = await request(`/complaints/${id}/feedback`, {
        method: 'POST',
        body: { satisfied, rating: satisfied ? 5 : 1 },
      });
      notify(result.message, satisfied ? 'ok' : 'bad');
      closeDrawer();
      refreshDashboard(false);
    } catch (err) {
      notify(err.message, 'bad');
      setBusy(false);
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (!detail) return <div className="skeleton">Loading complaint…</div>;

  const c = detail.complaint;

  return (
    <>
      <h2>{c.title}</h2>
      <div className="flag-meta" style={{ marginBottom: 6 }}>
        <span className="chip">{c.key || c.id}</span>
        <span className={`chip ${slaClass(c.sla.state)}`}>
          {c.sla.state}
          {c.sla.breachHours ? ` +${c.sla.breachHours}h` : ''}
        </span>
        <span className="chip">{humanise(c.stage)}</span>
      </div>

      <div className="dsec">
        <h4>Citizen report</h4>
        <p>{c.description || <span className="muted">No description.</span>}</p>
      </div>

      <div className="dsec">
        <h4>Classification</h4>
        <dl className="kv">
          <dt>Department</dt>
          <dd>{c.departmentName}</dd>
          <dt>Category</dt>
          <dd>{c.category}</dd>
          <dt>Sentiment</dt>
          <dd>{c.sentiment}</dd>
          <dt>Confidence</dt>
          <dd>{c.aiConfidence != null ? `${Math.round(c.aiConfidence * 100)}%` : '—'}</dd>
        </dl>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {detail.classification.note}
        </p>
      </div>

      <div className="dsec">
        <h4>Accountability at the time of the incident</h4>
        <dl className="kv">
          <dt>Political</dt>
          <dd>{detail.accountability.political.holder}</dd>
          <dt>Administrative</dt>
          <dd>{detail.accountability.administrative.holder}</dd>
          <dt>Assigned officer</dt>
          <dd>{c.assignee ? c.assignee.name : 'Unassigned'}</dd>
        </dl>
      </div>

      {detail.contact && (
        <div className="dsec">
          <h4>Reach someone about this complaint</h4>
          {detail.contact.officer && detail.contact.officer.phone && (
            <div className="contact-row">
              <div className="cr-step">1</div>
              <div className="cr-main">
                <div className="cr-holder">{detail.contact.officer.name}</div>
                <div className="cr-label">
                  {detail.contact.officer.designation}
                  {detail.contact.officer.district ? ` · ${detail.contact.officer.district}` : ''}
                </div>
              </div>
              <div className="cr-reach">
                <a className="cr-phone" href={`tel:${detail.contact.officer.phone.replace(/\s/g, '')}`}>
                  {detail.contact.officer.phone}
                </a>
              </div>
            </div>
          )}
          {[detail.contact.controlRoom, detail.contact.secretary]
            .filter(Boolean)
            .map((cc, i) => (
              <div className="contact-row" key={cc.label}>
                <div className="cr-step">{i + 2}</div>
                <div className="cr-main">
                  <div className="cr-holder">{cc.holder}</div>
                  <div className="cr-label">{cc.label}</div>
                </div>
                <div className="cr-reach">
                  <a className="cr-phone" href={`tel:${String(cc.phone).replace(/\s/g, '')}`}>{cc.phone}</a>
                </div>
              </div>
            ))}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Escalate in order. Numbers are non-dialable placeholders — every one begins with 5,
            which Indian mobile numbering never assigns.
          </p>
        </div>
      )}

      <div className="dsec">
        <h4>SLA</h4>
        <dl className="kv">
          <dt>Reported</dt>
          <dd>{time(c.reportedAt)}</dd>
          <dt>Deadline</dt>
          <dd>{time(c.sla.dueAt)}</dd>
          <dt>State</dt>
          <dd className={slaClass(c.sla.state)}>{c.sla.state}</dd>
          <dt>Citizen validation</dt>
          <dd
            className={
              c.satisfaction === 'Unsatisfied'
                ? 'c-crit'
                : c.satisfaction === 'Satisfied'
                ? 'c-ok'
                : ''
            }
          >
            {c.satisfaction}
          </dd>
        </dl>
      </div>

      {detail.timeline.length > 0 && (
        <div className="dsec">
          <h4>Timeline</h4>
          {detail.timeline.map((t, i) => (
            <div className="timeline-item" key={i}>
              <div>{t.content}</div>
              <div className="ti-meta">
                {t.by} · {time(t.at)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dsec">
        <h4>Citizen validation</h4>
        {c.isClosed ? (
          <div className="notice ok">Closed after the citizen confirmed the resolution.</div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12.5 }}>
              A department cannot close this complaint on its own. Closure requires the citizen to
              accept the resolution — administrative closure cannot erase dissatisfaction.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => validate(true)}
              >
                Citizen accepts resolution
              </button>
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => validate(false)}
              >
                Citizen rejects resolution
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
