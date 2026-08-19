'use client';

import { useState } from 'react';
import { humanise, time } from '@/lib/format';

const DISTRICTS = ['Chennai', 'Tiruvallur', 'Coimbatore', 'Madurai', 'Salem', 'Thanjavur'];

export default function Intake({ request, notify, refreshDashboard }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [district, setDistrict] = useState('Chennai');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await request('/complaints', {
        method: 'POST',
        body: { title: title.trim(), description: description.trim(), district },
      });
      setResult(response);
      setTitle('');
      setDescription('');
      notify('Complaint filed and routed.', 'ok');
      refreshDashboard(false);
    } catch (err) {
      notify(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view">
      <div className="intake-grid">
        <form className="card" onSubmit={submit}>
          <h2>File a citizen complaint</h2>
          <p className="muted">
            Submitted complaints are classified, routed and given an SLA deadline, then filed
            against the responsible department.
          </p>

          <label>
            Complaint title
            <input
              required
              minLength={8}
              value={title}
              placeholder="No water supply for six days in ward 12"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label>
            Description
            <textarea
              rows={5}
              value={description}
              placeholder="Describe what happened, for how long, and how many people are affected."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label>
            District
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit complaint'}
          </button>
        </form>

        <div className="card result-card">
          <h2>Classification &amp; routing</h2>

          {!result && (
            <p className="muted">
              Submit a complaint to see how Power Center classifies it, which department it routes
              to, why, and what deadline it sets.
            </p>
          )}

          {result && <IntakeResult result={result} />}
        </div>
      </div>
    </section>
  );
}

function IntakeResult({ result }) {
  const c = result.classification;
  const terms = c.evidence.matchedTerms;
  const urgency = c.evidence.urgencySignals;
  const alternatives = c.evidence.alternatives;

  return (
    <>
      <div className="notice ok">
        Complaint <b>{result.complaint.key || result.complaint.id}</b> filed and routed.
      </div>

      <dl className="kv">
        <dt>Routed to</dt>
        <dd>{result.complaint.department}</dd>
        <dt>Category</dt>
        <dd>{c.category}</dd>
        <dt>Priority</dt>
        <dd>{c.severity}</dd>
        <dt>Sentiment</dt>
        <dd>{c.sentiment}</dd>
        <dt>Confidence</dt>
        <dd>{Math.round(c.confidence * 100)}%</dd>
        <dt>Decision</dt>
        <dd>{humanise(c.routing)}</dd>
        <dt>SLA deadline</dt>
        <dd>
          {time(result.sla.dueAt)} ({result.sla.resolutionHours}h)
        </dd>
      </dl>

      <div className="dsec">
        <h4>Why it was routed this way</h4>
        <p style={{ fontSize: 12.5 }}>
          Matched terms:{' '}
          {terms.length ? (
            terms.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))
          ) : (
            <span className="muted">none</span>
          )}
        </p>
        {urgency.length > 0 && (
          <p style={{ fontSize: 12.5 }}>
            Urgency signals:{' '}
            {urgency.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </p>
        )}
        {alternatives.length > 0 && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Alternatives considered: {alternatives.map((a) => a.category).join(', ')}
          </p>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          The classifier is a deterministic lexicon, not a black box — every routing decision shows
          the evidence that produced it and can be overridden by an officer.
        </p>
      </div>
    </>
  );
}
