import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { gGet, createReplyDraft, updateDraftBody } from '@/lib/graph';
import { draftReply } from '@/lib/openai';

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

  // Immediately ack
  res.status(202).json({ ok: true });

  try {
    const payload = req.body;
    const events: any[] = payload?.value || [];
    for (const n of events) {
      if (n.lifecycleEvent === 'reauthorizationRequired') continue;

      // verify clientState, find user
      const { data: sub } = await supabase.from('graph_subscriptions').select().eq('id', n.subscriptionId).single();
      if (!sub) continue;
      if (sub.client_state !== n.clientState) continue;

      const { data: cacheRow } = await supabase.from('msal_token_cache').select().eq('user_id', sub.user_id).single();
      if (!cacheRow) continue;

      // hydrate MSAL cache for this user
      msalApp.getTokenCache().deserialize(JSON.stringify(cacheRow.cache_json));
      const account = (await msalApp.getTokenCache().getAllAccounts())[0];
      if (!account) continue;

      const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
      if (!token?.accessToken) continue;

      // fetch message
      const messageId = n.resourceData?.id;
      if (!messageId) continue;

      const msg = await gGet(token.accessToken, `/me/messages/${messageId}`);

      // very small summary for LLM
      const summary = [
        `Subject: ${msg.subject || ''}`,
        `From: ${msg.from?.emailAddress?.address || ''}`,
        `Preview: ${msg.bodyPreview || ''}`
      ].join('\n');

      // generate HTML body
      const html = await draftReply({ threadSummary: summary });

      // create reply draft & patch body
      const draft = await createReplyDraft(token.accessToken, messageId, false);
      await updateDraftBody(token.accessToken, draft.id, html);
    }
  } catch (e) {
    // swallow to avoid retries storm; use logging in real prod
    console.error('webhook error', e);
  }
}
