// apps/web/lib/openai.ts
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Shape you can pass from your API routes; it's flexible on purpose */
export type DraftReplyInput = {
  /** Raw plain-text from the latest inbound email (or whole thread) */
  originalPlain?: string;
  /** Short summary of the thread if you already computed it */
  threadSummary?: string;
  /** Optional subject hint; function will generate one if null */
  subject?: string | null;
  /** Brand / client knobs */
  tone?: "friendly" | "formal" | "neutral" | "concise" | "warm" | string;
  companyName?: string;
  /** Optional canned template text the model can adapt */
  template?: string;
  /** Extra guardrails or business rules */
  instructions?: string;
  /** Locale hint */
  locale?: string;
};

export type DraftReplyOutput = {
  subject: string | null;
  bodyHtml: string;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * draftReply — produce HTML email body (and optional subject) using OpenAI.
 * Designed to be tolerant of different inputs so your API routes don’t have to match
 * a rigid schema while you iterate.
 */
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

  // Build a compact prompt
  const system = [
    `You are an assistant that drafts professional email replies.`,
    `Write in ${tone} tone. Company: ${companyName || "N/A"}. Locale: ${locale}.`,
    `Follow instructions if present. If insufficient info, be concise and ask for 1 clear next step.`,
    `Output valid, simple HTML (paragraphs, strong, links). No inline CSS.`,
  ].join(" ");

  const user = [
    template ? `TEMPLATE (optional, adapt as needed):\n${template}\n` : "",
    instructions ? `POLICY/RULES:\n${instructions}\n` : "",
    threadSummary ? `THREAD SUMMARY:\n${threadSummary}\n` : "",
    `LATEST MESSAGE (plain text):\n${originalPlain}\n`,
    `Return JSON with keys: subject (string|null), body_html (string).`,
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
      // fallback: wrap the model text if it didn't return JSON
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
    // last-resort fallback so your build/routes never crash
    console.error("draftReply error:", err);
    return {
      subject: subject ?? null,
      bodyHtml:
        "<p>Thanks for reaching out. We’ve received your message and will get back to you shortly.</p>",
    };
  }
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
