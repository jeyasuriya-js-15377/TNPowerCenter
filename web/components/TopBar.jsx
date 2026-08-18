'use client';

import { humanise } from '@/lib/format';

const VIEWS = [
  { key: 'command', label: 'Command Center' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'directives', label: 'Directives' },
  { key: 'intake', label: 'Citizen Intake' },
];

export default function TopBar({ user, view, onView, onRefresh, onSignOut, busy }) {
  return (
    <header className="topbar">
      <div className="brand small">
        <div className="brand-mark" />
        <div>
          <strong>Tamil Nadu Power Center</strong>
          <span className="backbone">Zoho Projects backbone</span>
        </div>
      </div>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`tab${view === v.key ? ' active' : ''}`}
            onClick={() => onView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="who">
        <div className="who-text">
          <strong>{user.name}</strong>
          <span>{humanise(user.role)}</span>
        </div>
        <button type="button" className="btn ghost" onClick={onRefresh} disabled={busy}>
          {busy ? 'Reading…' : 'Refresh'}
        </button>
        <button type="button" className="btn ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
