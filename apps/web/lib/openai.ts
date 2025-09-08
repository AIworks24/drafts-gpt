// apps/web/lib/openai.ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type DraftArgs = {
  originalPlain: string;
  subject: string;
  tone?: string;            // e.g. "neutral", "friendly", "formal"
  companyName?: string;     // optional metadata you already use
  template?: string;        // optional HTML or plaintext template
  instructions?: string;    // optional policies / style guide
};

export type DraftReplyOutput = {
  bodyHtml: string;
  tokens?: { prompt: number; completion: number; total: number };
};

/**
 * Draft an email reply and return HTML (no <html>/<body> wrapper).
 * Safe to extend later with your richer prompt pieces.
 */
export async function draftReply(args: DraftArgs): Promise<DraftReplyOutput> {
  const {
    originalPlain,
    subject,
    tone = 'neutral',
    companyName,
    template,
    instructions,
  } = args;

  const userPrompt = [
    `You are drafting a professional email reply as HTML (use <p>, <ul>, <br/>; no <html> or <body> tags).`,
    companyName ? `Company: ${companyName}` : undefined,
    `Tone: ${tone}`,
    instructions ? `Policies/Instructions:\n${instructions}` : undefined,
    template ? `Template (use if relevant; otherwise ignore):\n${template}` : undefined,
    `\nOriginal Email Subject: ${subject}`,
    `Original Email (plain text):\n${originalPlain}`,
  ]
  .filter(Boolean)
  .join('\n');

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'Draft concise, helpful replies as HTML fragments (<p>, <ul>, <br/>) without wrapping in <html> or <body>.',
      },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = completion.choices?.[0]?.message?.content?.trim() || 'Thanks for your email.';
  // Ensure we return HTML; wrap plain text if needed
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  const bodyHtml = looksLikeHtml ? text : `<p>${text}</p>`;

  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return {
    bodyHtml,
    tokens: {
      prompt: usage.prompt_tokens ?? 0,
      completion: usage.completion_tokens ?? 0,
      total: usage.total_tokens ?? 0,
    },
  };
}
