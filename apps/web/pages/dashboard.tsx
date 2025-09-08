export default function Dashboard() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Dashboard</h1>
      <p>If you can see this, the app built correctly.</p>
      <ul>
        <li><a href="/">Back to home</a></li>
        <li><a href="/api/health" target="_blank" rel="noreferrer">Check /api/health</a></li>
      </ul>
    </main>
  );
}
