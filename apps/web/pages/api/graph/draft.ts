import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";
import { msalApp, MS_SCOPES } from "@/lib/msal";
import { getMessage, createReplyDraft, updateDraftBody, findMeetingTimes } from "@/lib/graph";
import { draftReply } from "@/lib/openai";
import { getClientByUser, getClientTemplates, recordUsage } from "@/lib/config";

/**
 * POST /api/graph/draft
 * Body: { user_id: string, messageId: string, replyAll?: boolean, suggestTimes?: boolean, tz?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { user_id, messageId, replyAll = false, suggestTimes = false, tz = "UTC" } = req.body || {};
    if (!user_id || !messageId) {
      return res.status(400).json({ error: "Missing user_id or messageId" });
    }

    // 1) get access token
    const { data: cacheRow, error: cacheErr } = await supabase
      .from("msal_token_cache")
      .select("*")
      .eq("user_id", user_id)
      .single();
    if (cacheErr || !cacheRow) return res.status(401).json({ error: "No token cache for user" });

    const cache = msalApp.getTokenCache();
    cache.deserialize(JSON.stringify(cacheRow.cache_json));
    const [account] = await cache.getAllAccounts();
    if (!account) return res.status(401).json({ error: "No MSAL account in cache" });

    const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
    if (!token?.accessToken) return res.status(401).json({ error: "Failed to acquire token" });

    // 2) source message
    const msg = await getMessage(token.accessToken, messageId);
    const subject: string = msg?.subject ?? "";
    const fromAddr: string = msg?.from?.emailAddress?.address ?? "";

    let bodyText = "";
    const raw = String(msg?.body?.content ?? "");
    if ((msg?.body?.contentType || "").toLowerCase() === "html") {
      bodyText = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else {
      bodyText = raw || String(msg?.bodyPreview ?? "");
    }

    // 3) client config & template
    const client = await getClientByUser(user_id);
    const templates = await getClientTemplates(client?.id);
    const templateBody = templates?.[0]?.body ?? "";

    // 4) optional meeting times  ❗ FIX: call with (accessToken, opts)
    let slotLines: string[] = [];
    if (suggestTimes) {
      const now = new Date();
      const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      slotLines = await findMeetingTimes(token.accessToken, {
        attendee: fromAddr,
        tz,
        windowStartISO: now.toISOString(),
        windowEndISO: in7.toISOString(),
        durationISO: "PT30M",
        maxCandidates: 5,
      });
    }

    // 5) AI reply
    const ai = await draftReply({
      originalPlain: bodyText,
      subject,
      tone: client?.tone?.voice ?? "neutral",
      companyName: client?.name ?? "",
      template: templateBody,
      instructions: client?.policies ?? "",
    });

    let html = ai.bodyHtml || "<p>Thanks for your email.</p>";
    if (slotLines.length) {
      const list = slotLines.map((s) => `<li>${s}</li>`).join("");
      html += `<p>Here are some times that work for us:</p><ul>${list}</ul>`;
    }

    // 6) create/patch draft
    const draft = await createReplyDraft(token.accessToken, messageId, replyAll);
    await updateDraftBody(token.accessToken, draft.id, html);

    // 7) usage log  ❗ FIX: use fields your helper accepts
    const t = ai.tokens ?? { prompt: 0, completion: 0, total: 0 };
    await recordUsage({
      client_id: client?.id,
      mailbox_upn: fromAddr,
      event_type: "draft",
      meta: { subject, messageId, slotsCount: slotLines.length },
      tokens_prompt: t.prompt,
      tokens_completion: t.completion,
      cost_usd: 0,
    });

    return res.status(200).json({ ok: true, draftId: draft.id });
  } catch (e: any) {
    console.error("draft handler error", e);
    return res.status(500).json({ error: e?.message || "Internal error" });
  }
}
