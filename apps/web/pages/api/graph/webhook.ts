import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { gGet, createReplyDraft, updateDraftBody, findMeetingTimes } from '@/lib/graph';
import { draftReply } from '@/lib/enhanced-openai';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function handleValidation(req: NextApiRequest, res: NextApiResponse) {
  const token = req.query.validationToken as string | undefined;
  console.log('Webhook validation request:', { token, query: req.query });
  
  if (token) {
    console.log('Returning validation token:', token);
    return res.status(200).send(token);
  }
  
  console.log('Missing validation token');
  return res.status(400).send('Missing validationToken');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleValidation(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Immediately acknowledge to prevent retry storms
  res.status(202).json({ ok: true });

  try {
    const events: any[] = Array.isArray(req.body?.value) ? req.body.value : [];
    for (const n of events) {
      if (n.lifecycleEvent === 'reauthorizationRequired') continue;

      // verify clientState, find the subscription row
      const { data: sub } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('id', n.subscriptionId)
        .single();
      if (!sub) continue;
      if (sub.client_state !== n.clientState) continue;

      // hydrate MSAL cache for this user
      const { data: cacheRow } = await supabase
        .from('msal_token_cache')
        .select('*')
        .eq('user_id', sub.user_id)
        .single();
      if (!cacheRow) continue;

      const cache = msalApp.getTokenCache();
      cache.deserialize(JSON.stringify(cacheRow.cache_json));
      const [account] = await cache.getAllAccounts();
      if (!account) continue;

      const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
      if (!token?.accessToken) continue;

      const messageId: string | undefined = n.resourceData?.id;
      if (!messageId) continue;

      // Fetch the full message
      const msg = await gGet(token.accessToken, `/me/messages/${messageId}`);

      // Extract subject and a plain-text body we can feed to the model
      const subject: string = msg?.subject ?? '';
      let bodyText = '';
      if (msg?.body?.content) {
        const raw = String(msg.body.content);
        if (msg.body.contentType === 'html') {
          bodyText = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // strip HTML tags
        } else {
          bodyText = raw;
        }
      }
      if (!bodyText) bodyText = String(msg?.bodyPreview ?? '');

      // Get client configuration
      const { data: user } = await supabase
        .from('users')
        .select(`
          id,
          upn,
          client_id,
          clients (*)
        `)
        .eq('id', sub.user_id)
        .single();

      if (!user?.clients) continue;

      const client = user.clients as any;

      // Get templates for this client
      const { data: templates } = await supabase
        .from('templates')
        .select('*')
        .eq('client_id', client.id)
        .eq('active', true)
        .order('created_at', { ascending: true });

      const template = templates?.[0]?.body_md || '';

      // Check if this looks like a meeting request
      const looksLikeMeetingRequest = /\b(meeting|call|schedule|available|time|when|calendar)\b/i.test(subject + ' ' + bodyText);
      
      let meetingTimes: string[] = [];
      if (looksLikeMeetingRequest) {
        try {
          const now = new Date();
          const inWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          
          meetingTimes = await findMeetingTimes(token.accessToken, {
            attendee: msg?.from?.emailAddress?.address || '',
            tz: client.timezone || 'UTC',
            windowStartISO: now.toISOString(),
            windowEndISO: inWeek.toISOString(),
            durationISO: 'PT30M',
            maxCandidates: 3
          });
        } catch (error) {
          console.warn('Failed to get meeting times:', error);
        }
      }

      // Draft the reply (using your existing draftReply function)
      const ai = await draftReply({
        originalPlain: bodyText,
        subject,
        tone: client.tone?.voice || 'professional',
        companyName: client.name,
        template: template,
        instructions: client.policies || undefined,
      });

      let html: string = ai?.bodyHtml ?? '<p>Thanks for your email.</p>';

      // Add meeting times if available
      if (meetingTimes.length > 0) {
        const timesList = meetingTimes
          .map(time => `<li>${time}</li>`)
          .join('');
        html += `<p>Here are some times that work for us:</p><ul>${timesList}</ul>`;
      }

      // Add signature if configured
      if (client.signature) {
        html += `<br/><br/>${client.signature}`;
      }

      // Create a reply draft and patch the body (leave as Draft)
      const draft = await createReplyDraft(token.accessToken, messageId, false);
      await updateDraftBody(token.accessToken, draft.id, html);

      // Record usage
      const tokens = ai?.tokens || { prompt: 0, completion: 0, total: 0 };
      const estimatedCost = tokens.total * 0.000002;

      const { error: usageError } = await supabase.from('usage_events').insert({
        client_id: client.id,
        user_id: user.id,
        mailbox_upn: user.upn,
        event_type: 'webhook',
        message_id: messageId,
        draft_id: draft.id,
        subject,
        meta: {
          from: msg?.from?.emailAddress?.address || '',
          meetingTimesFound: meetingTimes.length,
          templateUsed: !!template
        },
        tokens_prompt: tokens.prompt,
        tokens_completion: tokens.completion,
        cost_usd: estimatedCost,
        status: 'completed'
      });

      if (usageError) {
        console.error('Failed to record usage:', usageError);
      }
    }
  } catch (e) {
    console.error('webhook error', e);
  }
}