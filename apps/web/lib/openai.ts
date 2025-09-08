// apps/web/lib/openai.ts
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export type DraftReplyInput = {
  originalPlain?: string;
  threadSummary?: string;
  subject?: string | null;
  tone?: string;
  companyName?: string;
  template?: string;
  instructions?: string;
  locale?: string;
};

export type DraftReplyOutput = {
  subject: string | null;
  bodyHtml: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function draftReply(input: DraftReplyInput): Promise<DraftReplyOutput> {
  const {
    originalPlain = "",
    threadSummary = "",
    subject = null,
    tone = "neutral",
    companyName = "",
    template = "",
    instructions = "",
    locale = "en-US",
  } = input;

  const system = [
    `You are an assistant that drafts professional email replies.`,
    `Write in ${tone} tone. Company: ${companyName || "N/A"}. Locale: ${locale}.`,
    `Follow instructions if present. Be accurate, concise, and action-oriented.`,
    `Output valid, minimal HTML (p, ul/li, strong, a). No inline CSS.`,
    `Return JSON with keys: subject (string|null), body_html (string).`,
  ].join(" ");

  const user = [
    template ? `TEMPLATE (optional, adapt as needed):\n${template}\n` : "",
    instructions ? `POLICY/RULES:\n${instructions}\n` : "",
    threadSummary ? `THREAD SUMMARY:\n${threadSummary}\n` : "",
    `LATEST MESSAGE (plain text):\n${originalPlain}\n`,
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { subject, body_html: `<p>${escapeHtml(raw)}</p>` };
    }

    const safeSubject =
      typeof parsed.subject === "string" || parsed.subject === null
        ? parsed.subject
        : subject;

    const safeBody =
      typeof parsed.body_html === "string" && parsed.body_html.trim()
        ? parsed.body_html
        : `<p>Thank you for your message. We’ll follow up shortly.</p>`;

    return { subject: safeSubject ?? null, bodyHtml: safeBody };
  } catch (err) {
    console.error("draftReply error:", err);
    return {
      subject: subject ?? null,
      bodyHtml:
        "<p>Thanks for reaching out. We’ve received your message and will get back to you shortly.</p>",
    };
  }
}

/**
 * Compatibility wrapper expected by API routes.
 * Returns { json: {subject, body_html}, tokens: {prompt_tokens, completion_tokens, total_tokens} }
 */
export async function draftReplyWithTone(input: any): Promise<{
  json: { subject: string | null; body_html: string };
  tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const originalPlain =
    input?.originalPlain ??
    input?.bodyPlain ??
    input?.latestPlain ??
    input?.email?.bodyText ??
    input?.messagePlain ??
    "";

  const tone =
    input?.tone ??
    input?.toneProfile?.voice ??
    input?.toneProfile?.style ??
    (input?.client?.tone?.voice ?? "neutral");

  const companyName =
    input?.companyName ??
    input?.clientName ??
    input?.client?.name ??
    "";

  let template = input?.template ?? "";
  const intent = input?.intent ?? input?.classification ?? "";
  if (!template && Array.isArray(input?.templates) && input.templates.length) {
    const byIntent = input.templates.find(
      (t: any) =>
        (t.intent && t.intent === intent) ||
        (t.category && t.category === intent)
    );
    template =
      byIntent?.body ||
      byIntent?.text ||
      input.templates[0]?.body ||
      input.templates[0]?.text ||
      "";
  }

  const instructions =
    input?.instructions ??
    input?.policies ??
    input?.client?.policies ??
    "";

  const threadSummary = input?.threadSummary ?? input?.summary ?? "";

  const subjectIn =
    typeof input?.subject === "string"
      ? input.subject
      : input?.email?.subject ?? null;

  const locale = input?.locale ?? input?.client?.locale ?? "en-US";

  // rough prompt/compl estimates (chars/4)
  const promptChars =
    (originalPlain?.length || 0) +
    (threadSummary?.length || 0) +
    (instructions?.length || 0) +
    (template?.length || 0);
  const prompt_tokens = Math.ceil(promptChars / 4);

  const out = await draftReply({
    originalPlain,
    threadSummary,
    subject: subjectIn,
    tone,
    companyName,
    template,
    instructions,
    locale,
  });

  const completion_tokens = Math.ceil(
    ((out.bodyHtml?.length || 0) + (out.subject?.length || 0)) / 4
  );
  const total_tokens = prompt_tokens + completion_tokens;

  return {
    json: { subject: out.subject, body_html: out.bodyHtml },
    tokens: { prompt_tokens, completion_tokens, total_tokens },
  };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
