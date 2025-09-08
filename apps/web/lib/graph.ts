const GRAPH_BASE = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';

export async function graphGet(accessToken: string, path: string) {
  const r = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Graph GET ${path} failed: ${r.status} ${text}`);
  }
  return r.json();
}

export async function graphPost(accessToken: string, path: string, body?: any) {
  const r = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Graph POST ${path} failed: ${r.status} ${text}`);
  }
  return r.json();
}

export async function graphPatch(accessToken: string, path: string, body: any) {
  const r = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Graph PATCH ${path} failed: ${r.status} ${text}`);
  }
  if (r.status === 204) return null;
  return r.json().catch(() => null);
}

// convenience helpers used by your API routes
export async function getMessage(accessToken: string, id: string) {
  return graphGet(accessToken, `/me/messages/${id}`);
}

export async function createReplyDraft(accessToken: string, id: string, replyAll = false) {
  return graphPost(accessToken, `/me/messages/${id}/${replyAll ? 'createReplyAll' : 'createReply'}`);
}

export async function updateDraftBody(accessToken: string, draftId: string, html: string) {
  return graphPatch(accessToken, `/me/messages/${draftId}`, {
    body: { contentType: 'html', content: html }
  });
}
