// apps/web/lib/enhanced-openai.ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface DraftContext {
  originalPlain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  tone?: {
    persona: string;
    formality: string;
    warmth: number;
    conciseness: string;
  };
  companyName?: string;
  template?: string;
  policies?: string;
  signature?: string;
  meetingTimes?: string[];
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
  reasoning?: string;
}

/**
 * Enhanced email draft generation with comprehensive context
 */
export async function generateEnhancedDraft(context: DraftContext): Promise<DraftResult> {
  const {
    originalPlain,
    subject,
    fromEmail,
    fromName,
    tone = { persona: 'professional', formality: 'medium', warmth: 0.5, conciseness: 'brief' },
    companyName,
    template,
    policies,
    signature,
    meetingTimes = [],
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
    template,
    meetingTimes
  });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: calculateTemperature(tone.warmth, tone.persona),
      max_tokens: calculateMaxTokens(tone.conciseness),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse response if it includes reasoning
    let bodyHtml = rawContent;
    let reasoning = '';

    // Check if response includes reasoning section
    const reasoningMatch = rawContent.match(/^REASONING:\s*(.+?)\n\nRESPONSE:\s*(.+)$/s);
    if (reasoningMatch) {
      reasoning = reasoningMatch[1].trim();
      bodyHtml = reasoningMatch[2].trim();
    }

    // Ensure HTML formatting
    if (!/<\/?[a-z][\s\S]*>/i.test(bodyHtml)) {
      // Convert plain text to HTML paragraphs
      bodyHtml = bodyHtml
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${p.trim()}</p>`)
        .join('\n');
    }

    // Add signature if provided
    if (signature) {
      bodyHtml += `\n\n${signature}`;
    }

    const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      bodyHtml,
      tokens: {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
        total: usage.total_tokens
      },
      reasoning
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Fallback response
    let fallbackHtml = '<p>Thank you for your email. I\'ll review your message and get back to you soon.</p>';
    
    if (meetingTimes.length > 0) {
      const timesList = meetingTimes.map(time => `<li>${time}</li>`).join('');
      fallbackHtml += `<p>Here are some available times for us to connect:</p><ul>${timesList}</ul>`;
    }
    
    if (signature) {
      fallbackHtml += `\n\n${signature}`;
    }

    return {
      bodyHtml: fallbackHtml,
      tokens: { prompt: 0, completion: 0, total: 0 },
      reasoning: 'Fallback due to API error'
    };
  }
}

function buildSystemPrompt(config: {
  tone: DraftContext['tone'];
  companyName?: string;
  policies?: string;
  businessHours?: Record<string, string>;
  timezone?: string;
}): string {
  const { tone, companyName, policies, businessHours, timezone } = config;

  let prompt = `You are an AI assistant that drafts professional email replies. Your responses should be in HTML format using tags like <p>, <ul>, <li>, <br/>, <strong>, etc. Do NOT include <html>, <head>, or <body> tags.

TONE GUIDELINES:
- Persona: ${tone?.persona || 'professional'}
- Formality: ${tone?.formality || 'medium'}
- Warmth level: ${tone?.warmth || 0.5}/1.0 (0=very formal, 1=very warm)
- Conciseness: ${tone?.conciseness || 'brief'}

`;

  if (companyName) {
    prompt += `COMPANY: You represent ${companyName}.\n\n`;
  }

  if (businessHours) {
    prompt += `BUSINESS HOURS: ${JSON.stringify(businessHours)} (${timezone})\n\n`;
  }

  if (policies) {
    prompt += `COMPANY POLICIES & GUIDELINES:
${policies}

Follow these guidelines strictly when drafting responses.

`;
  }

  prompt += `RESPONSE RULES:
1. Be helpful and professional
2. Address the sender's main points
3. If meeting times are provided, include them naturally
4. Keep responses concise but complete
5. Use appropriate HTML formatting
6. Do NOT include email signatures (they'll be added separately)
7. Match the requested tone and formality level

`;

  return prompt.trim();
}

function buildUserPrompt(context: {
  originalPlain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  template?: string;
  meetingTimes?: string[];
}): string {
  const { originalPlain, subject, fromEmail, fromName, template, meetingTimes = [] } = context;

  let prompt = `Draft a reply to this email:

SUBJECT: ${subject}
FROM: ${fromName || fromEmail || 'Unknown'}${fromEmail ? ` <${fromEmail}>` : ''}

ORIGINAL MESSAGE:
${originalPlain}

`;

  if (template) {
    prompt += `TEMPLATE REFERENCE (use as guidance, adapt as needed):
${template}

`;
  }

  if (meetingTimes.length > 0) {
    prompt += `AVAILABLE MEETING TIMES (include if relevant):
${meetingTimes.map((time, i) => `${i + 1}. ${time}`).join('\n')}

`;
  }

  prompt += `Generate an appropriate email reply as HTML. Focus on being helpful and addressing their specific needs.`;

  return prompt.trim();
}

function calculateTemperature(warmth: number, persona: string): number {
  let base = 0.3; // Conservative default
  
  // Adjust based on warmth
  base += warmth * 0.4; // 0.3 to 0.7 range
  
  // Adjust based on persona
  switch (persona.toLowerCase()) {
    case 'casual':
      base += 0.2;
      break;
    case 'friendly':
      base += 0.15;
      break;
    case 'formal':
      base -= 0.1;
      break;
    case 'professional':
    default:
      // No adjustment
      break;
  }
  
  // Ensure within valid range
  return Math.max(0.1, Math.min(1.0, base));
}

function calculateMaxTokens(conciseness: string): number {
  switch (conciseness.toLowerCase()) {
    case 'brief':
      return 300;
    case 'detailed':
      return 600;
    case 'verbose':
      return 1000;
    default:
      return 400;
  }
}

/**
 * Analyze an incoming email to determine the best response strategy
 */
export async function analyzeEmailContext(emailContent: string, subject: string): Promise<{
  category: 'inquiry' | 'meeting' | 'follow-up' | 'support' | 'general';
  urgency: 'low' | 'medium' | 'high';
  suggestedTemplate?: string;
  requiresMeetingTimes: boolean;
  keyTopics: string[];
}> {
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `Analyze emails and return JSON with:
- category: inquiry|meeting|follow-up|support|general
- urgency: low|medium|high
- requiresMeetingTimes: boolean (true if they want to schedule something)
- keyTopics: array of main topics mentioned

Return only valid JSON.`
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\nContent: ${emailContent}`
        }
      ]
    });

    const result = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    
    return {
      category: result.category || 'general',
      urgency: result.urgency || 'medium',
      requiresMeetingTimes: result.requiresMeetingTimes || false,
      keyTopics: result.keyTopics || [],
      suggestedTemplate: result.category
    };
    
  } catch (error) {
    console.error('Email analysis error:', error);
    
    // Fallback analysis
    const requiresMeetingTimes = /\b(meeting|call|schedule|available|time|when|calendar)\b/i.test(subject + ' ' + emailContent);
    const isUrgent = /\b(urgent|asap|immediately|emergency|critical)\b/i.test(subject + ' ' + emailContent);
    
    return {
      category: requiresMeetingTimes ? 'meeting' : 'general',
      urgency: isUrgent ? 'high' : 'medium',
      requiresMeetingTimes,
      keyTopics: [],
      suggestedTemplate: requiresMeetingTimes ? 'meeting' : 'general'
    };
  }
}

/**
 * Generate multiple draft variations for A/B testing
 */
export async function generateDraftVariations(
  context: DraftContext,
  variations: Array<{ name: string; adjustments: Partial<DraftContext> }>
): Promise<Array<{ name: string; draft: DraftResult }>> {
  const results = [];
  
  for (const variation of variations) {
    const adjustedContext = { ...context, ...variation.adjustments };
    const draft = await generateEnhancedDraft(adjustedContext);
    results.push({
      name: variation.name,
      draft
    });
  }
  
  return results;
}

/**
 * Legacy function for backward compatibility
 */
export async function draftReply(args: {
  originalPlain: string;
  subject: string;
  tone?: string;
  companyName?: string;
  template?: string;
  instructions?: string;
}): Promise<{ bodyHtml: string; tokens?: { prompt: number; completion: number; total: number } }> {
  const context: DraftContext = {
    originalPlain: args.originalPlain,
    subject: args.subject,
    tone: {
      persona: args.tone || 'professional',
      formality: 'medium',
      warmth: 0.5,
      conciseness: 'brief'
    },
    companyName: args.companyName,
    template: args.template,
    policies: args.instructions
  };
  
  const result = await generateEnhancedDraft(context);
  
  return {
    bodyHtml: result.bodyHtml,
    tokens: result.tokens
  };
}