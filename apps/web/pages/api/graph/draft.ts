import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { gGet, createReplyDraft, updateDraftBody } from '@/lib/graph';
import { draftReply } from '@/lib/openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { messageId } = req.body || {};
  if (!messageId) return res.status(400).json({ error: 'messageId required' });

  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Not signed in' });

  const { data: cacheRow } = await supabase.from('msal_token_cache').select().eq('user_id', sess.userId).single();
  if (!cacheRow) return res.status(400).json({ error: 'No token cache' });

  msalApp.getTokenCache().deserialize(JSON.stringify(cacheRow.cache_json));
  const account = (await msalApp.getTokenCache().getAllAccounts())[0];
  if (!account) return res.status(400).json({ error: 'No account' });

  const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES });
  const msg = await gGet(token.accessToken, `/me/messages/${messageId}`);

  const summary = [
    `Subject: ${msg.subject || ''}`,
    `From: ${msg.from?.emailAddress?.address || ''}`,
    `Preview: ${msg.bodyPreview || ''}`
  ].join('\n');

  const html = await draftReply({ threadSummary: summary });
  const draft = await createReplyDraft(token.accessToken, messageId, false);
  await updateDraftBody(token.accessToken, draft.id, html);

  res.status(200).json({ ok: true, draftId: draft.id });
}
