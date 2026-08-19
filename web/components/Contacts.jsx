'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Contact directory.
 *
 * The point of this screen is that the Chief Minister should never have to leave
 * the system to find out who to ring about a failing service. Departments are
 * ordered by how much trouble they are in, and each row shows the escalation
 * path plus the officers actually holding breached complaints.
 */
export default function Contacts({ request, notify }) {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const data = await request(`/contacts${params}`);
      setRows(data.data);
      setMeta({ guidance: data.guidance, disclaimer: data.disclaimer });
    } catch (err) {
      setError(err.message);
      notify(err.message, 'bad');
    }
  }, [request, query, notify]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (error) return <section className="view"><div className="empty">{error}</div></section>;

  return (
    <section className="view">
      <div className="filters">
        <input
          placeholder="Search department or officer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {meta && <div className="notice warn" style={{ marginBottom: 14 }}>{meta.guidance}</div>}

      {rows === null && <div className="skeleton">Loading directory…</div>}
      {rows && rows.length === 0 && <div className="empty">No match.</div>}

      <div className="contact-list">
        {(rows || []).map((d) => (
          <div className="contact-card" key={d.departmentId}>
            <button
              type="button"
              className="contact-head"
              onClick={() => setOpen(open === d.departmentId ? null : d.departmentId)}
            >
              <div>
                <div className="dept-name">{d.department}</div>
                <div className="dept-sub">
                  {d.complaints} complaints
                  {d.breached > 0 && <span className="c-crit"> · {d.breached} breached</span>}
                  {d.officers.length > 0 && ` · ${d.officers.length} officer${d.officers.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <span className="contact-toggle">{open === d.departmentId ? '−' : '+'}</span>
            </button>

            {open === d.departmentId && (
              <div className="contact-body">
                <div className="dsec">
                  <h4>Escalation path</h4>
                  {d.escalationPath.map((c, i) => (
                    <div className="contact-row" key={c.label}>
                      <div className="cr-step">{i + 1}</div>
                      <div className="cr-main">
                        <div className="cr-holder">{c.holder}</div>
                        <div className="cr-label">{c.label}</div>
                      </div>
                      <div className="cr-reach">
                        <a href={`tel:${String(c.phone).replace(/\s/g, '')}`} className="cr-phone">{c.phone}</a>
                        <a href={`mailto:${c.email}`} className="cr-email">{c.email}</a>
                      </div>
                    </div>
                  ))}
                </div>

                {d.officers.length > 0 && (
                  <div className="dsec">
                    <h4>Officers holding complaints — worst first</h4>
                    {d.officers.map((o) => (
                      <div className="contact-row" key={o.email}>
                        <div className={`cr-step ${o.breached ? 'bad' : ''}`}>{o.breached || o.open}</div>
                        <div className="cr-main">
                          <div className="cr-holder">{o.name}</div>
                          <div className="cr-label">
                            {o.designation}
                            {o.district ? ` · ${o.district}` : ''}
                            {' · '}
                            <span className={o.breached ? 'c-crit' : 'muted'}>
                              {o.open} open, {o.breached} breached
                            </span>
                          </div>
                        </div>
                        <div className="cr-reach">
                          {o.phone
                            ? <a href={`tel:${o.phone.replace(/\s/g, '')}`} className="cr-phone">{o.phone}</a>
                            : <span className="muted">no number on file</span>}
                          {o.officePhone && <span className="cr-email">office {o.officePhone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {meta && <p className="muted" style={{ fontSize: 11.5, marginTop: 18 }}>{meta.disclaimer}</p>}
    </section>
  );
}
