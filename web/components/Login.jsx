'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

const DEMO_ACCOUNTS = [
  {
    email: 'cm@tnpowercenter.in',
    password: 'PowerCenter@2026',
    role: 'Chief Minister',
    capability: 'Full state visibility · can issue directives',
  },
  {
    email: 'warroom@tnpowercenter.in',
    password: 'WarRoom@2026',
    role: 'CM War Room — Analyst',
    capability: 'Full visibility · cannot issue directives',
  },
  {
    email: 'water@tnpowercenter.in',
    password: 'Water@2026',
    role: 'Minister Control Team — Water',
    capability: 'Scoped to one department only',
  },
];

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      onSignedIn(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <h1>Tamil Nadu Power Center</h1>
            <p className="brand-sub">Executive operating system for government performance</p>
          </div>
        </div>

        <form onSubmit={submit}>
          <label>
            Official email
            <input
              type="email"
              required
              value={email}
              autoComplete="username"
              placeholder="cm@tnpowercenter.in"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              autoComplete="current-password"
              placeholder="••••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <div className="demo-accounts">
          <p className="demo-title">Demo accounts — click to fill</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              className="demo-row"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
            >
              <span className="role">{account.role}</span>
              <span className="cap">{account.capability}</span>
            </button>
          ))}
        </div>

        <p className="footnote">
          All data shown is clearly-labelled synthetic <b>DEMO DATA</b>.
        </p>
      </div>
    </div>
  );
}
