import { useEffect, useState } from "react";

export default function ClientSettings() {
  const [client, setClient] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(setClient);
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(client) });
    setSaving(false);
  }

  if (!client) return <div>Loading client…</div>;

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3>Client Settings</h3>
      <label>Name<br/>
        <input value={client.name || ""} onChange={e => setClient({ ...client, name: e.target.value })} />
      </label>
      <div style={{ height: 8 }} />
      <label>Tone (voice)<br/>
        <input value={client.tone?.voice || ""} onChange={e => setClient({ ...client, tone: { ...(client.tone||{}), voice: e.target.value } })} />
      </label>
      <div style={{ height: 8 }} />
      <label>Policies / Instructions<br/>
        <textarea rows={4} value={client.policies || ""} onChange={e => setClient({ ...client, policies: e.target.value })} />
      </label>
      <div style={{ height: 8 }} />
      <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    </section>
  );
}
