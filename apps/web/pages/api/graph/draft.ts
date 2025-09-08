// apps/web/pages/api/graph/draft.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";
import { msalApp, MS_SCOPES } from "@/lib/msal";
import { getMessage, createReplyDraft, updateDraftBody } from "@/lib/graph";
import { getClientByUser, getClientTemplates, recordUsage } from "@/lib/config";
import { draftReplyWithTone } from "@/lib/openai";
import { findMeetingTimes } from "@/lib/graph";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { upn, messageId, attendeeForScheduling } = req.body as {
    upn: string;
    messageId: string;
    attendeeForScheduling?: string; // optional: force scheduling on the other party
  };

  try {
    // 1) which client?
    const client = await getClientByUser(upn);
    if (!client) return res.status(400).json({ error: "Mailbox is not assigned to a client." });

    const templates = await getClientTemplates(client.id);

    // 2) acquire token for this user (you should already store refresh; simplified here)
    // In your app you likely have access_token saved on sign-in; use that. This sample assumes it's present in m365_users.access_token_encrypted
    const { data: u } = await supabase.from("m365_users").select("*").eq("upn", upn).single();
    const accessToken: string = u?.access_token_encrypted;
    if (!accessToken) return res.status(401).json({ error: "No Graph token for user." });

    // 3) fetch the original message
    const msg = await getMessage(accessToken, messageId);
    const subject = msg?.subject ?? "(no subject)";
    const from = msg?.from?.emailAddress?.address ?? "";
    const bodyText = (msg?.bodyPreview || "").slice(0, 8000);

    // 4) calendar suggestions (only if intent likely to be scheduling OR user forced it)
    let slots: string[] = [];
    const tz = client.timezone || "UTC";
    const start = new Date();
    const end = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const attendee = attendeeForScheduling || from;
    try {
      slots = await findMeetingTimes(accessToken, {
        attendee,
        tz,
        windowStartISO: start.toISOString(),
        windowEndISO: end.toISOString(),
        durationISO: "PT30M",
        maxCandidates: 5,
      });
    } catch {
      // ignore scheduling errors; continue drafting without slots
    }

    // 5) call OpenAI with tone + templates + (optional) slots
    const { json, tokens } = await draftReplyWithTone({
      client,
      templates,
      email: { subject, bodyText, from },
      scheduling: { wantScheduling: slots.length > 0, slots },
    });

    // 6) create a draft reply in-thread
    const draft = await createReplyDraft(accessToken, messageId, false);
    const html = json.body_html || "<p>(no content)</p>";
    await updateDraftBody(accessToken, draft.id, html);

    await recordUsage({
      client_id: client.id,
      mailbox_upn: upn,
      event_type: "draft",
      meta: { subject, messageId, slotsCount: slots.length },
      tokens_prompt: tokens?.prompt_tokens ?? 0,
      tokens_completion: tokens?.completion_tokens ?? 0,
      cost_usd: 0, // fill if you measure cost
    });

    return res.status(200).json({ draftId: draft.id, threadSubject: subject, slots });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "draft failed" });
  }
}
