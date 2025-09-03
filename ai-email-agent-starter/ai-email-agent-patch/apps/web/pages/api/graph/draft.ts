import type { NextApiRequest, NextApiResponse } from "next";
import { createReplyDraft, updateDraftBody } from "@/lib/graph";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { accessToken, messageId, html } = req.body;
  try {
    const draft = await createReplyDraft(accessToken, messageId);
    await updateDraftBody(accessToken, draft.id, html);
    res.status(200).json(draft);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}