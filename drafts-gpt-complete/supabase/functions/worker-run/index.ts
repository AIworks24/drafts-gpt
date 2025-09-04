// supabase/functions/worker-run/index.ts
// Deno runtime (Edge Functions). Use fetch + ESM imports.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RunPayload = { messageId?: string };

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_BASE = Deno.env.get("GRAPH_BASE") ?? "https://graph.microsoft.com/v1.0";
const EDGE_FUNCTION_SECRET = Deno.env.get("EDGE_FUNCTION_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- OpenAI (via fetch) ----
async function generateHtmlReply(prompt: string) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You draft concise, professional email replies in HTML." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const html =
    data?.choices?.[0]?.message?.content ??
    "<p>Thanks for reaching out. We'll follow up shortly.</p>";
  return html;
}

// ---- Graph helpers (delegated /me endpoints) ----
async function graphCreateReplyDraft(accessToken: string, messageId: string) {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/createReply`;
  const resp = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Graph createReply failed: ${resp.status} ${await resp.text()}`);
  return await resp.json(); // draft message
}

async function graphUpdateDraftBody(accessToken: string, draftId: string, html: string) {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(draftId)}`;
  const body = { body: { contentType: "html", content: html } };
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Graph PATCH draft failed: ${resp.status} ${await resp.text()}`);
}

async function processSingleMessage(messageId: string) {
  // TODO: Map subscription → correct user token. For MVP, use first token.
  const { data: users, error: uerr } = await supabase.from("m365_users").select("*").limit(1);
  if (uerr) throw uerr;
  const token = users?.[0]?.access_token_encrypted;
  if (!token) return { processed: 0, note: "No stored mailbox token (authorize first)." };

  const html = await generateHtmlReply(
    "Draft a short, polite acknowledgment reply and promise a follow-up."
  );
  const draft = await graphCreateReplyDraft(token, messageId);
  await graphUpdateDraftBody(token, draft.id, html);

  // optional: also persist in drafts table if present
  await supabase.from("drafts").upsert({ message_id: messageId, draft_id: draft.id, status: "completed" });

  return { processed: 1, draftId: draft.id };
}

Deno.serve(async (req) => {
  try {
    // Optional shared secret (recommended for production)
    if (EDGE_FUNCTION_SECRET) {
      const headerSecret = req.headers.get("x-edge-secret") || "";
      if (headerSecret !== EDGE_FUNCTION_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
    }

    const payload = (await req.json().catch(() => ({}))) as RunPayload;
    if (payload?.messageId) {
      const result = await processSingleMessage(payload.messageId);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fallback: nothing to do if no messageId
    return new Response(JSON.stringify({ ok: true, processed: 0, note: "No messageId provided" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
