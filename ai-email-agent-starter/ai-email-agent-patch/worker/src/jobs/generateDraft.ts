import { openai } from "../utils/openai";
import { createReplyDraft, updateDraftBody } from "../utils/graph";

export async function generateDraft(token: string, messageId: string, prompt: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "Draft email reply" }, { role: "user", content: prompt }],
  });
  const html = completion.choices[0].message?.content || "";
  const draft = await createReplyDraft(token, messageId);
  await updateDraftBody(token, draft.id, html);
  return draft;
}