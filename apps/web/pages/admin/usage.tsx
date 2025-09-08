// apps/web/pages/admin/usage.tsx
import { useEffect, useState } from "react";

export default function Usage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(()=>{ (async ()=>{
    const r = await fetch("/api/admin/usage");
    setRows(await r.json());
  })(); }, []);

  return (
    <main style={{padding:24,fontFamily:"system-ui"}}>
      <h1>Usage</h1>
      <table border={1} cellPadding={6} style={{marginTop:12}}>
        <thead>
          <tr><th>When</th><th>Client</th><th>Mailbox</th><th>Event</th><th>Prompt</th><th>Completion</th></tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.client_name || r.client_id}</td>
              <td>{r.mailbox_upn}</td>
              <td>{r.event_type}</td>
              <td>{r.tokens_prompt}</td>
              <td>{r.tokens_completion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
