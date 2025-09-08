import { useEffect, useState } from "react";

export default function TemplateManager() {
  const [client, setClient] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", body: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch("/api/clients").then(r=>r.json()).then(setClient); }, []);
  useEffect(() => { if (client?.id) refresh(); }, [client?.id]);

  async function refresh() {
    const r = await fetch(`/api/templates?client_id=${client.id}`);
    setTemplates(await r.json());
  }

  async function save() {
    setSaving(true);
    await fetch("/api/templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, client_id: client.id })
    });
    setSaving(false);
    setDraft({ id: "", name: "", body: "" });
    refresh();
  }

  if (!client) return <div>Loading templates…</div>;

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3>Templates</h3>
      <ul>
        {templates.map(t => (
          <li key={t.id} style={{ marginBottom: 8 }}>
            <strong>{t.name}</strong>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{t.body.slice(0, 120)}{t.body.length > 120 ? "…" : ""}</div>
            <button onClick={() => setDraft(t)}>Edit</button>
          </li>
        ))}
      </ul>
      <hr />
      <h4>{draft.id ? "Edit Template" : "New Template"}</h4>
      <label>Name<br/><input value={draft.name} onChange={e=>setDraft({ ...draft, name: e.target.value })} /></label>
      <div style={{ height: 8 }} />
      <label>Body (HTML or text)<br/><textarea rows={6} value={draft.body} onChange={e=>setDraft({ ...draft, body: e.target.value })} /></label>
      <div style={{ height: 8 }} />
      <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Template"}</button>
    </section>
  );
}
