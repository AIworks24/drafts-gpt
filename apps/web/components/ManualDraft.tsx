import { useState } from "react";

export default function ManualDraft() {
  const [messageId, setMessageId] = useState("");
  const [suggestTimes, setSuggestTimes] = useState(true);
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [replyAll, setReplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const r = await fetch("/api/graph/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "self", messageId, suggestTimes, tz, replyAll })
    });
    const j = await r.json();
    setBusy(false);
    setResult(j);
  }

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
      <h3>Manual Draft (Test)</h3>
      <label>Message ID<br/>
        <input value={messageId} onChange={e=>setMessageId(e.target.value)} placeholder="Outlook message id" />
      </label>
      <div style={{ height: 8 }} />
      <label><input type="checkbox" checked={suggestTimes} onChange={e=>setSuggestTimes(e.target.checked)} /> Suggest meeting times</label>
      <div style={{ height: 8 }} />
      <label>Time zone<br/>
        <input value={tz} onChange={e=>setTz(e.target.value)} />
      </label>
      <div style={{ height: 8 }} />
      <label><input type="checkbox" checked={replyAll} onChange={e=>setReplyAll(e.target.checked)} /> Reply all</label>
      <div style={{ height: 8 }} />
      <button onClick={run} disabled={busy || !messageId}>{busy ? "Drafting…" : "Create Draft"}</button>
      {result && <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}
