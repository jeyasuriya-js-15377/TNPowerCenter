'use client';

import { useEffect } from 'react';

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDone, 5200);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  if (!toast) return null;
  return <div className={`toast ${toast.kind || ''}`}>{toast.message}</div>;
}
