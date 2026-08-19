'use client';

import { useEffect, useState } from 'react';

export default function Directives({ request, notify }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await request('/directives');
        if (!cancelled) setRows(result.data);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        notify(err.message, 'bad');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, notify]);

  return (
    <section className="view">
      <h2 className="section-head">
        CM directives
        <span className="hint">
          A directive is an executable object — issuing one creates real work in the
          responsible department
        </span>
      </h2>

      <div className="table">
        {error && <div className="empty">{error}</div>}
        {!error && rows === null && <div className="skeleton">Loading…</div>}
        {!error && rows && rows.length === 0 && (
          <div className="empty">
            No directives yet. Open a red flag on the Command Center to issue one.
          </div>
        )}

        {!error && rows && rows.length > 0 && (
          <>
            <div className="trow head">
              <div>Directive</div>
              <div>Department</div>
              <div>Accountable</div>
              <div>Deadline</div>
              <div>Status</div>
            </div>
            {rows.map((d) => (
              <div className="trow" key={d.id}>
                <div>
                  <div className="t-title">{d.title}</div>
                  <div className="t-sub">{String(d.objective).slice(0, 110)}</div>
                </div>
                <div className="t-sub">{d.department}</div>
                <div className="t-sub">{d.accountableAuthority}</div>
                <div className="t-mono">{d.deadline || '—'}</div>
                <div>
                  <span className="pill c-ok">{d.status}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
