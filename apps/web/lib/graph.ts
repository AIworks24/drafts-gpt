const BASE = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';

async function asJson(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

export async function gGet(token: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`GET ${path} ${r.status} ${await r.text()}`);
  return r.json();
}

export async function gPost(token: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`POST ${path} ${r.status} ${await asJson(r)}`);
  return r.json();
}

export async function gPatch(token: string, path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok && r.status !== 204) throw new Error(`PATCH ${path} ${r.status} ${await asJson(r)}`);
  return r.status === 204 ? null : r.json();
}

export async function createReplyDraft(token: string, id: string, replyAll = false) {
  return gPost(token, `/me/messages/${id}/${replyAll ? 'createReplyAll' : 'createReply'}`);
}
export async function updateDraftBody(token: string, draftId: string, html: string) {
  return gPatch(token, `/me/messages/${draftId}`, { body: { contentType: 'html', content: html } });
}
