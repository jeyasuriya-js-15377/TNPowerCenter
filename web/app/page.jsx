'use client';

/**
 * Application shell.
 *
 * Everything runs in the browser — this is a static export, so there is no
 * server component doing data work. Session restore happens in an effect
 * rather than during render, because sessionStorage does not exist at export
 * time and reading it during render would break the build.
 */

import { useCallback, useEffect, useState } from 'react';

import { withToken, loadSession, saveSession, clearSession } from '@/lib/api';

import Login from '@/components/Login';
import TopBar from '@/components/TopBar';
import CommandCenter from '@/components/CommandCenter';
import Complaints from '@/components/Complaints';
import Directives from '@/components/Directives';
import Intake from '@/components/Intake';
import Monthly from '@/components/Monthly';
import Contacts from '@/components/Contacts';
import Drawer from '@/components/Drawer';
import Toast from '@/components/Toast';

export default function Page() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  const [view, setView] = useState('command');
  const [dashboard, setDashboard] = useState(null);
  const [dashError, setDashError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [drawer, setDrawer] = useState(null); // { kind, data }
  const [toast, setToast] = useState(null);

  /* Restore an existing session after mount. */
  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const notify = useCallback((message, kind = '') => {
    setToast({ message, kind, at: Date.now() });
  }, []);

  const request = useCallback(
    (path, options) => withToken(session ? session.token : null)(path, options),
    [session]
  );

  const loadDashboard = useCallback(
    async (announce = false) => {
      if (!session) return;
      setLoading(true);
      setDashError(null);
      try {
        const data = await request('/dashboard');
        setDashboard(data);
        if (announce) notify('Updated from Zoho Projects.', 'ok');
      } catch (err) {
        setDashError(err.message);
        notify(err.message, 'bad');
      } finally {
        setLoading(false);
      }
    },
    [session, request, notify]
  );

  useEffect(() => {
    if (session) loadDashboard(false);
    // Re-runs when the signed-in user changes.
  }, [session, loadDashboard]);

  const onSignedIn = (result) => {
    const next = { token: result.token, user: result.user };
    saveSession(next);
    setSession(next);
    setView('command');
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    setDashboard(null);
    setDrawer(null);
  };

  // Avoid a flash of the login screen while the saved session is being read.
  if (!ready) return null;

  if (!session) return <Login onSignedIn={onSignedIn} />;

  const shared = {
    user: session.user,
    request,
    notify,
    openDrawer: setDrawer,
    closeDrawer: () => setDrawer(null),
    refreshDashboard: loadDashboard,
  };

  return (
    <>
      <TopBar
        user={session.user}
        view={view}
        onView={setView}
        onRefresh={() => loadDashboard(true)}
        onSignOut={signOut}
        busy={loading}
      />

      <main>
        {view === 'command' && (
          <CommandCenter dashboard={dashboard} error={dashError} loading={loading} {...shared} />
        )}
        {view === 'complaints' && <Complaints {...shared} />}
        {view === 'directives' && <Directives {...shared} />}
        {view === 'monthly' && <Monthly {...shared} />}
        {view === 'contacts' && <Contacts {...shared} />}
        {view === 'intake' && <Intake {...shared} />}
      </main>

      {drawer && <Drawer drawer={drawer} {...shared} />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}
