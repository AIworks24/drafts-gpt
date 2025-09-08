// apps/web/pages/admin/clients/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function ClientDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [client, setClient] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tone, setTone] = useState<any>({ persona:"professional", formality:"medium", warmth:0.5, conciseness:"brief" });
  const [tz, setTz] = useState("America/New_York");
  const [bh, setBh] = useState('{"mon_fri":"09:00-17:00"}');

  const [tTitle, setTTitle] = useState("");
  const [tCat, setTCat] = useState("scheduling");
  const [tBody, setTBody] = useState("");

  async function load() {
    if (!id) return;
    const r = await fetch(`/api/admin/clients/${id}`);
    const data = await r.json();
    setClient(data.client);
    setTone(data.client.tone);
    setTz(data.client.timezone);
    setBh(JSON.stringify(data.client.business_hours));
    setTemplates(data.templates);
  }
  useEffect(()=>{ load(); }, [id]);

  async function save() {
    await fetch(`/api/admin/clients/${id}`, {
      method:"PUT",
      body: JSON.stringify({ timezone: tz, tone, business_hours: JSON.parse(bh) })
    });
    load();
  }

  async function addTemplate() {
    await fetch(`/api/admin/templates`, {
      method:"POST",
      body: JSON.stringify({ client_id: id, title: tTitle, category: tCat, body_md: tBody })
    });
    setTTitle(""); setTCat("scheduling"); setTBody("");
    load();
  }

  if (!client) return <main style={{padding:24}}>Loading...</main>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>{client.name}</h1>

      <section style={{marginTop:16}}>
        <h2>Brand Voice</h2>
        <div style={{display:"grid", gap:8, maxWidth:600}}>
          <label>Timezone <input value={tz} onChange={e=>setTz(e.target.value)}/></label>
          <label>Persona <input value={tone.persona} onChange={e=>setTone({...tone, persona:e.target.value})}/></label>
          <label>Formality <input value={tone.formality} onChange={e=>setTone({...tone, formality:e.target.value})}/></label>
          <label>Warmth (0-1) <input type="number" step="0.1" value={tone.warmth} onChange={e=>setTone({...tone, warmth:parseFloat(e.target.value||"0")})}/></label>
          <label>Conciseness <input value={tone.conciseness} onChange={e=>setTone({...tone, conciseness:e.target.value})}/></label>
          <label>Business Hours JSON
            <textarea rows={4} value={bh} onChange={e=>setBh(e.target.value)} />
          </label>
          <button onClick={save}>Save</button>
        </div>
      </section>

      <section style={{marginTop:24}}>
        <h2>Templates</h2>
        <div style={{display:"grid", gap:8, maxWidth:700}}>
          <input placeholder="Title" value={tTitle} onChange={e=>setTTitle(e.target.value)} />
          <input placeholder="Category" value={tCat} onChange={e=>setTCat(e.target.value)} />
          <textarea placeholder="Body (Markdown)" rows={6} value={tBody} onChange={e=>setTBody(e.target.value)} />
          <button onClick={addTemplate}>Add Template</button>
        </div>

        <ul style={{marginTop:16}}>
          {templates.map((t:any)=>(
            <li key={t.id}><b>{t.title}</b> ({t.category})</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
