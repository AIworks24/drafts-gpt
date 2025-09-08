// apps/web/lib/openai.ts
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export type DraftReplyInput = {
  originalPlain?: string;
  threadSummary?: string;
  subject?: string | null;
  tone?: string;                // "friendly" | "formal" | ...
  companyName?: string;
  template?: string;            // a single template to adapt
  instructions?: string;        // policy/guardrails text
  locale?: string;              // e.g. "en-US"
};

export type DraftReplyOutput = {
  subject: string | null;
  bodyHtml: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** Core helper: returns { subject, bodyHtml } */
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
 * Compatibility wrapper for routes that expect:
 *   { json: { subject, body_html }, tokens }
 * We reuse draftReply() and reshape the result.
 */
export async function draftReplyWithTone(input: any): Promise<{
  json: { subject: string | null; body_html: string };
  tokens: number;
}> {
  // Normalize inputs that might come from your route
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

  // VERY rough token estimate (char/4). Good enough for reporting UI.
  const approxTokens = Math.ceil(
    ((out.bodyHtml?.length || 0) + (out.subject?.length || 0)) / 4
  );

  return {
    json: { subject: out.subject, body_html: out.bodyHtml },
    tokens: approxTokens,
  };
}

/** tiny HTML escaper for the fallback path */
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
