'use client';

import { useEffect, useState } from 'react';
import { applyTheme, readTheme, toggleTheme } from '@/lib/theme';

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(applyTheme(readTheme()));
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? 'Light theme' : 'Dark theme';

  return (
    <button
      type="button"
      className={`btn ghost theme-toggle${compact ? ' compact' : ''}`}
      onClick={() => setTheme(toggleTheme())}
      aria-label={`Switch to ${next} theme`}
      title={label}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
