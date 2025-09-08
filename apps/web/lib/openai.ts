// apps/web/lib/openai.ts
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type DraftArgs = {
  client: any; // row from clients
  templates: Array<{ title: string; category: string; body_md: string }>;
  email: { subject: string; bodyText: string; from?: string };
  scheduling?: { wantScheduling: boolean; slots?: string[] }; // add slots from Graph
};

const SYS = `You draft Outlook reply emails for a specific client.
- Respect brand voice and tone.
- Be accurate; do not invent facts.
- If scheduling context is provided, propose the suggested time windows.
- Keep replies concise, professional, and clearly actionable.`;

export async function draftReplyWithTone(args: DraftArgs) {
  const { client, templates, email, scheduling } = args;

  const templateBullets =
    templates?.length
      ? templates
          .map((t) => `### ${t.title} (${t.category})\n${t.body_md}`)
          .join("\n\n")
      : "No templates provided.";

  const schedulingBlock = scheduling?.wantScheduling
    ? `\n\nScheduling:\n${(scheduling.slots || []).map((s) => `- ${s}`).join("\n") || "(no slots found)"}`
    : "";

  const tone = client?.tone || {};
  const toneLine = `Persona: ${tone.persona ?? "professional"}, Formality: ${tone.formality ?? "medium"}, Warmth: ${tone.warmth ?? 0.5}, Conciseness: ${tone.conciseness ?? "brief"}`;

  const biz = client?.business_hours ? JSON.stringify(client.business_hours) : "{}";

  const prompt = `
Client Name: ${client?.name}
Time Zone: ${client?.timezone}
Business Hours: ${biz}
Tone: ${toneLine}

Templates (markdown):
${templateBullets}

Email to reply:
Subject: ${email.subject}
From: ${email.from ?? "(unknown)"}
Body:
${email.bodyText}

${schedulingBlock}

Task:
1) Classify the email intent quickly (scheduling / refund / support / sales / other).
2) If a matching template exists, adapt it; otherwise build from scratch using brand tone.
3) If scheduling slots were supplied, offer 2-3 concise options.
4) Output JSON:

{
  "subject": "string|null", 
  "body_html": "<p>...</p>"
}
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" as const },
  });

  const text = resp.choices[0]?.message?.content || "{}";
  let json;
  try { json = JSON.parse(text); } catch { json = { subject: null, body_html: "<p>(error parsing model output)</p>" }; }
  return { json, tokens: (resp.usage as any) || {} };
}
