// apps/web/pages/api/graph/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { gGet, createReplyDraft, updateDraftBody } from '@/lib/graph';
import { draftReply } from '@/lib/enhanced-openai';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

// 1) Graph validation (GET) echoes validationToken
function handleValidation(req: NextApiRequest, res: NextApiResponse) {
  const token = req.query.validationToken as string | undefined;
  if (token) return res.status(200).send(token);
  return res.status(400).send('Missing validationToken');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleValidation(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Immediately ack so Graph doesn't retry
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

      // Draft the reply (keep it simple; tone can be wired to your client config later)
      const ai = await draftReply({
        originalPlain: bodyText,
        subject,
        tone: 'neutral',
      });

      const html: string = ai?.bodyHtml ?? '<p>Thanks for your email.</p>';

      // Create a reply draft and patch the body (leave as Draft)
      const draft = await createReplyDraft(token.accessToken, messageId, false);
      await updateDraftBody(token.accessToken, draft.id, html);
    }
  } catch (e) {
    // swallow to avoid retries storms; add logging/alerts in prod
    console.error('webhook error', e);
  }
}
