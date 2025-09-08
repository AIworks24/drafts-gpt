// apps/web/pages/admin/clients.tsx
import { useEffect, useState } from "react";

export default function ClientsAdmin() {
  const [clients, setClients] = useState<any[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const r = await fetch("/api/admin/clients");
    setClients(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name) return;
    await fetch("/api/admin/clients", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    load();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Clients</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="New client name" />
        <button onClick={create}>Create</button>
      </div>
      <ul>
        {clients.map(c => (
          <li key={c.id}>
            <a href={`/admin/clients/${c.id}`}>{c.name}</a> – {c.timezone}
          </li>
        ))}
      </ul>
    </main>
  );
}
