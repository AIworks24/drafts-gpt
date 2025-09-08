// apps/web/lib/graph.ts
import axios from 'axios';

const GRAPH = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Generic GET to Microsoft Graph (relative URL like '/me/messages/{id}') */
export async function gGet(accessToken: string, path: string, params?: Record<string, any>) {
  const url = path.startsWith('http') ? path : `${GRAPH}${path.startsWith('/') ? path : `/${path}`}`;
  const { data } = await axios.get(url, {
    headers: bearer(accessToken),
    params,
  });
  return data;
}

/** Fetch a single message by id */
export async function getMessage(accessToken: string, id: string) {
  const { data } = await axios.get(`${GRAPH}/me/messages/${id}`, {
    headers: bearer(accessToken),
  });
  return data;
}

/** Create a reply (or reply-all) DRAFT for a message id; returns the draft message */
export async function createReplyDraft(accessToken: string, messageId: string, replyAll = false) {
  const endpoint = `${GRAPH}/me/messages/${messageId}/${replyAll ? 'createReplyAll' : 'createReply'}`;
  const { data } = await axios.post(endpoint, {}, { headers: bearer(accessToken) });
  return data; // draft message object (isDraft=true)
}

/** Update the draft body HTML for a given draftId */
export async function updateDraftBody(accessToken: string, draftId: string, html: string) {
  await axios.patch(
    `${GRAPH}/me/messages/${draftId}`,
    { body: { contentType: 'html', content: html } },
    { headers: bearer(accessToken) }
  );
}
