'use client';

import { useCallback, useEffect, useState } from 'react';
import { slaClass, humanise } from '@/lib/format';

const SLA_OPTIONS = [
  { value: '', label: 'All SLA states' },
  { value: 'BREACHED', label: 'Breached' },
  { value: 'AT_RISK', label: 'At risk' },
  { value: 'DUE', label: 'Within SLA' },
  { value: 'RESOLVED', label: 'Resolved' },
];

export default function Complaints({ request, openDrawer, notify }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);

  const [query, setQuery] = useState('');
  const [sla, setSla] = useState('');
  const [department, setDepartment] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (sla) params.set('sla', sla);
    if (department) params.set('departmentId', department);

    try {
      const result = await request(`/complaints${params.toString() ? `?${params}` : ''}`);
      setRows(result.data);

      // Populate the department filter once, from whatever is in scope.
      setDepartments((current) => {
        if (current.length) return current;
        const seen = new Map();
        result.data.forEach((c) => seen.set(c.departmentId, c.departmentName));
        return [...seen.entries()];
      });
    } catch (err) {
      setError(err.message);
      notify(err.message, 'bad');
    }
  }, [request, query, sla, department, notify]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 260);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section className="view">
      <div className="filters">
        <input
          placeholder="Search complaints, citizen reference…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={sla} onChange={(e) => setSla(e.target.value)}>
          {SLA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {departments.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="table">
        {error && <div className="empty">{error}</div>}
        {!error && rows === null && <div className="skeleton">Loading…</div>}
        {!error && rows && rows.length === 0 && <div className="empty">No complaints match.</div>}

        {!error && rows && rows.length > 0 && (
          <>
            <div className="trow head">
              <div>Complaint</div>
              <div>Department</div>
              <div>District</div>
              <div>SLA</div>
              <div>Stage</div>
            </div>
            {rows.map((c) => (
              <div
                key={c.id}
                className="trow"
                onClick={() => openDrawer({ kind: 'complaint', data: { id: c.id } })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openDrawer({ kind: 'complaint', data: { id: c.id } });
                }}
              >
                <div>
                  <div className="t-title">{c.title}</div>
                  <div className="t-sub">
                    {c.citizenRef || '—'} · {c.category} · {c.severity}
                  </div>
                </div>
                <div className="t-sub">{c.departmentShort}</div>
                <div className="t-sub">{c.district}</div>
                <div className={`t-mono ${slaClass(c.sla.state)}`}>
                  {c.sla.state === 'BREACHED' ? `+${c.sla.breachHours}h` : c.sla.state}
                </div>
                <div className="t-sub">{humanise(c.stage)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
