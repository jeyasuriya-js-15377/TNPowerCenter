'use client';

export const THEME_KEY = 'tnpc-theme';

export function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private mode */
  }
  return 'dark';
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.setAttribute('data-theme', next);
  root.style.colorScheme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode */
  }
  return next;
}

export function toggleTheme() {
  const current =
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  return applyTheme(current === 'dark' ? 'light' : 'dark');
}
