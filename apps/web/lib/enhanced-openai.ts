import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface DraftContext {
  originalPlain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  tone: string;
  companyName?: string;
  template?: string;
  policies?: string;
  businessHours?: Record<string, string>;
  timezone?: string;
}

export interface DraftResult {
  bodyHtml: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Enhanced email draft generation with client-specific customization
 */
export async function generateEnhancedDraft(context: DraftContext): Promise<DraftResult> {
  const {
    originalPlain,
    subject,
    fromEmail,
    fromName,
    tone = 'professional',
    companyName,
    template,
    policies,
    businessHours,
    timezone = 'UTC'
  } = context;

  // Build comprehensive system prompt
  const systemPrompt = buildSystemPrompt({
    tone,
    companyName,
    policies,
    businessHours,
    timezone
  });

  // Build user prompt with all context
  const userPrompt = buildUserPrompt({
    originalPlain,
    subject,
    fromEmail,
    fromName,
    template
  });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: calculateTemperature(tone),
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    let bodyHtml = completion.choices?.[0]?.message?.content?.trim() || '';
    
    // Ensure HTML formatting
    if (!/<\/?[a-z][\s\S]*>/i.test(bodyHtml)) {
      // Convert plain text to HTML paragraphs
      bodyHtml = bodyHtml
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${p.trim()}</p>`)
        .join('\n');
    }

    const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      bodyHtml,
      tokens: {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
        total: usage.total_tokens
      }
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Fallback response
    return {
      bodyHtml: '<p>Thank you for your email. I\'ll review your message and get back to you soon.</p>',
      tokens: { prompt: 0, completion: 0, total: 0 }
    };
  }
}

function buildSystemPrompt(config: {
  tone: string;
  companyName?: string;
  policies?: string;
  businessHours?: Record<string, string>;
  timezone?: string;
}): string {
  const { tone, companyName, policies, businessHours, timezone } = config;

  let prompt = `You are an AI assistant that drafts professional email replies. Your responses should be in HTML format using tags like <p>, <ul>, <li>, <br/>, <strong>, etc. Do NOT include <html>, <head>, or <body> tags.

TONE: ${tone} - Match this tone consistently throughout your response.`;

  if (companyName) {
    prompt += `\n\nCOMPANY: You represent ${companyName}. Write as if you work for this company.`;
  }

  if (businessHours) {
    prompt += `\n\nBUSINESS HOURS: ${JSON.stringify(businessHours)} (${timezone})
Reference these hours when discussing availability or scheduling.`;
  }

  if (policies) {
    prompt += `\n\nCOMPANY POLICIES & GUIDELINES:
${policies}

Follow these guidelines strictly when drafting responses.`;
  }

  prompt += `

RESPONSE RULES:
1. Be helpful and address the sender's main points
2. Match the ${tone} tone consistently
3. Keep responses concise but complete (2-4 sentences typically)
4. Use proper HTML formatting with <p> tags
5. Do NOT include email signatures (they'll be added separately)
6. Be natural and conversational while maintaining professionalism
7. If they're asking to schedule something, acknowledge it positively`;

  return prompt.trim();
}

function buildUserPrompt(context: {
  originalPlain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  template?: string;
}): string {
  const { originalPlain, subject, fromEmail, fromName, template } = context;

  let prompt = `Draft a reply to this email:

SUBJECT: ${subject}
FROM: ${fromName || fromEmail || 'Unknown'}

ORIGINAL MESSAGE:
${originalPlain}

`;

  if (template) {
    prompt += `TEMPLATE REFERENCE (adapt as needed for this specific email):
${template}

`;
  }

  prompt += `Generate an appropriate email reply in HTML format. Focus on being helpful and addressing their specific needs.`;

  return prompt.trim();
}

function calculateTemperature(tone: string): number {
  switch (tone.toLowerCase()) {
    case 'casual':
      return 0.8;
    case 'friendly':
      return 0.7;
    case 'professional':
      return 0.5;
    case 'formal':
      return 0.3;
    default:
      return 0.5;
  }
}

/**
 * Backward compatibility function - matches your existing draftReply signature
 */
export async function draftReply(args: {
  originalPlain: string;
  subject: string;
  tone?: string;
  companyName?: string;
  template?: string;
  instructions?: string;
}): Promise<{ bodyHtml: string; tokens?: { prompt: number; completion: number; total: number } }> {
  const result = await generateEnhancedDraft({
    originalPlain: args.originalPlain,
    subject: args.subject,
    tone: args.tone || 'professional',
    companyName: args.companyName,
    template: args.template,
    policies: args.instructions
  });
  
  return {
    bodyHtml: result.bodyHtml,
    tokens: result.tokens
  };
}

/**
 * Analyze an incoming email to determine response strategy
 */
export async function analyzeEmailContent(emailContent: string, subject: string): Promise<{
  category: 'inquiry' | 'meeting' | 'follow-up' | 'support' | 'general';
  urgency: 'low' | 'medium' | 'high';
  requiresMeetingTimes: boolean;
  keyTopics: string[];
}> {
  // Simple keyword-based analysis (can be enhanced with AI later)
  const text = `${subject} ${emailContent}`.toLowerCase();
  
  const requiresMeetingTimes = /\b(meeting|call|schedule|available|time|when|calendar|appointment)\b/i.test(text);
  const isUrgent = /\b(urgent|asap|immediately|emergency|critical|deadline)\b/i.test(text);
  
  let category: 'inquiry' | 'meeting' | 'follow-up' | 'support' | 'general' = 'general';
  
  if (requiresMeetingTimes) {
    category = 'meeting';
  } else if (/\b(question|ask|help|information|inquiry|quote|price)\b/i.test(text)) {
    category = 'inquiry';
  } else if (/\b(follow|update|status|progress|next steps)\b/i.test(text)) {
    category = 'follow-up';
  } else if (/\b(issue|problem|error|bug|support|help|broken)\b/i.test(text)) {
    category = 'support';
  }
  
  return {
    category,
    urgency: isUrgent ? 'high' : 'medium',
    requiresMeetingTimes,
    keyTopics: [] // Can be enhanced later
  };
}