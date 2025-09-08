import axios from "axios";

const GRAPH = process.env.GRAPH_BASE || "https://graph.microsoft.com/v1.0";

export async function getMessage(accessToken: string, id: string) {
  const { data } = await axios.get(`${GRAPH}/me/messages/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return data;
}

export async function createReplyDraft(accessToken: string, id: string, replyAll = false) {
  const url = `${GRAPH}/me/messages/${id}/${replyAll ? "createReplyAll" : "createReply"}`;
  const { data } = await axios.post(url, {}, { headers: { Authorization: `Bearer ${accessToken}` } });
  return data; // draft message
}

export async function updateDraftBody(accessToken: string, draftId: string, html: string) {
  await axios.patch(
    `${GRAPH}/me/messages/${draftId}`,
    { body: { contentType: "html", content: html } },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}
