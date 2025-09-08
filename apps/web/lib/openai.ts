import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function draftReply(opts: {
  threadSummary: string;
  brandVoice?: string;
}) {
  const sys = `You draft professional email replies. Keep it concise, polite, and actionable. HTML only (no inline CSS).`;
  const user = `
Thread summary:
${opts.threadSummary}

Brand voice (optional):
${opts.brandVoice || 'neutral, professional'}

Draft a reply email body (HTML <p> and basic tags).`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.4
  });

  return res.choices[0]?.message?.content?.trim() || '<p>Thank you for your email.</p>';
}
