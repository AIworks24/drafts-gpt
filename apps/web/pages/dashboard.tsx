import { useState } from 'react';

export default function Dashboard() {
  const [messageId, setMessageId] = useState('');
  const [log, setLog] = useState<string>('');

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      <h1>Drafts-GPT Dashboard</h1>

      <section style={{ marginTop: 24 }}>
        <h3>1) Microsoft 365</h3>
        <p><a href="/api/auth/login">Sign in with Microsoft</a> &nbsp;|&nbsp; <a href="/api/auth/logout">Logout</a></p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>2) Subscribe to mailbox webhook</h3>
        <button onClick={async () => {
          const r = await fetch('/api/graph/subscribe', { method: 'POST' });
          const j = await r.json();
          setLog(JSON.stringify(j, null, 2));
        }}>Create / Renew Subscription</button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>3) Manual draft (for testing)</h3>
        <input placeholder="Message ID" value={messageId} onChange={e => setMessageId(e.target.value)}
               style={{ width: '100%', padding: 8, marginBottom: 8 }}/>
        <button onClick={async () => {
          const r = await fetch('/api/graph/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId })
          });
          const j = await r.json();
          setLog(JSON.stringify(j, null, 2));
        }}>Create Draft Reply</button>
      </section>

      <pre style={{ marginTop: 24, background: '#111', color: '#0f0', padding: 16, borderRadius: 8, overflow: 'auto' }}>
        {log}
      </pre>
    </main>
  );
}
