// apps/web/pages/m365.tsx
import { useEffect, useState } from 'react';

export default function M365Connect() {
  const [upn, setUpn] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/auth/microsoft?action=me')
      .then(r => r.json())
      .then(d => setUpn(d.upn))
      .catch(() => setUpn(null));
  }, []);

  async function subscribe() {
    setStatus('Subscribing…');
    const r = await fetch('/api/graph/subscribe', { method: 'POST' });
    const j = await r.json();
    setStatus(r.ok ? `Subscribed: ${j.id}` : `Error: ${JSON.stringify(j)}`);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Microsoft 365 Connection</h1>
      <section style={{ border: '1px solid #ddd', padding: 16, marginTop: 16 }}>
        <h2>Sign in</h2>
        {upn ? (
          <>
            <p>Signed in as <b>{upn}</b></p>
            <p>
              <a href="/api/auth/microsoft?action=logout">Sign out</a>
              {' · '}
              <button onClick={subscribe} style={{ marginLeft: 8 }}>Subscribe to mailbox webhook</button>
            </p>
            <p>{status}</p>
          </>
        ) : (
          <p><a href="/api/auth/microsoft?action=login">Sign in with Microsoft</a></p>
        )}
      </section>

      <p style={{ marginTop: 24 }}>
        When connected & subscribed, send an email to this mailbox. A draft reply will appear automatically in Outlook → Drafts.
        Then continue your setup in <a href="/dashboard">/dashboard</a>.
      </p>
    </main>
  );
}
