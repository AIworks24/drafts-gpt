// supabase/functions/worker-run/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RunPayload = { messageId?: string };

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_BASE = Deno.env.get("GRAPH_BASE") ?? "https://graph.microsoft.com/v1.0";
const EDGE_FUNCTION_SECRET = Deno.env.get("EDGE_FUNCTION_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generateHtmlReply(prompt: string) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
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
  return data?.choices?.[0]?.message?.content ?? "<p>Thanks for reaching out. We'll follow up shortly.</p>";
}

async function getAccessToken() {
  // Get the first user
  const { data: users } = await supabase.from("users").select("*").limit(1);
  if (!users?.length) throw new Error("No users found");

  // Get their token cache
  const { data: tokenCache } = await supabase
    .from("msal_token_cache")
    .select("cache_json")
    .eq("user_id", users[0].id)
    .single();

  if (!tokenCache) throw new Error("No token cache found");

  const cacheData = tokenCache.cache_json;
  
  if (cacheData?.AccessToken) {
    const tokens = Object.values(cacheData.AccessToken);
    const validToken = tokens.find((token: any) => 
      token?.secret && 
      token?.expires_on && 
      parseInt(token.expires_on) * 1000 > Date.now()
    );
    
    if (validToken) {
      return (validToken as any).secret;
    }
  }
  
  throw new Error("No valid access token found");
}

async function graphCreateReplyDraft(accessToken: string, messageId: string) {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/createReply`;
  const resp = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Graph createReply failed: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function graphUpdateDraftBody(accessToken: string, draftId: string, html: string) {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(draftId)}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: { contentType: "html", content: html } }),
  });
  if (!resp.ok) throw new Error(`Graph PATCH draft failed: ${resp.status} ${await resp.text()}`);
}

async function processSingleMessage(messageId: string) {
  console.log(`Processing message: ${messageId}`);
  
  try {
    console.log("Getting access token...");
    const accessToken = await getAccessToken();
    console.log("✅ Access token obtained");

    console.log("Generating AI reply...");
    const html = await generateHtmlReply("Draft a short, polite acknowledgment reply and promise a follow-up.");
    console.log("✅ AI reply generated");
    
    console.log("Creating reply draft...");
    const draft = await graphCreateReplyDraft(accessToken, messageId);
    console.log(`✅ Draft created with ID: ${draft.id}`);
    
    console.log("Updating draft body...");
    await graphUpdateDraftBody(accessToken, draft.id, html);
    console.log("✅ Draft body updated");
    
    console.log("Saving to database...");
    await supabase.from("drafts").upsert({ 
      message_id: messageId, 
      draft_id: draft.id, 
      status: "completed" 
    });
    console.log("✅ Saved to database");

    return { processed: 1, draftId: draft.id };
  } catch (error: any) {
    console.error("❌ Error processing message:", error.message);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    console.log("=== EDGE FUNCTION CALLED ===");
    console.log("Method:", req.method);
    
    if (EDGE_FUNCTION_SECRET) {
      const headerSecret = req.headers.get("x-edge-secret") || "";
      if (headerSecret !== EDGE_FUNCTION_SECRET) {
        console.log("❌ Invalid secret");
        return new Response("forbidden", { status: 403 });
      }
    }
    
    const payload = (await req.json().catch(() => ({}))) as RunPayload;
    console.log("Payload:", JSON.stringify(payload, null, 2));
    
    if (payload?.messageId) {
      const result = await processSingleMessage(payload.messageId);
      console.log("✅ Processing complete:", result);
      return new Response(JSON.stringify({ ok: true, ...result }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }
    
    console.log("❌ No messageId provided");
    return new Response(JSON.stringify({ ok: true, processed: 0, note: "No messageId provided" }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (e: any) {
    console.error("❌ Edge function error:", e.message);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { 
      headers: { "Content-Type": "application/json" }, 
      status: 500 
    });
  }
});