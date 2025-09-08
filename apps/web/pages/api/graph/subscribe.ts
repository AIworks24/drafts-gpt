import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import crypto from 'crypto';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const sess = getSession(req);
  const upn = sess?.upn;
  if (!upn) return res.status(401).json({ error: 'Not signed in' });

  // Load MSAL cache for this UPN (saved during auth callback)
  const { data: cacheRow } = await supabase
    .from('msal_token_cache')
    .select('cache_json')
    .eq('user_id', upn)
    .maybeSingle();

  if (!cacheRow?.cache_json) {
    return res.status(400).json({ error: 'No token cache for user' });
  }

  const cache = msalApp.getTokenCache();
  cache.deserialize(String(cacheRow.cache_json));
  const [account] = await cache.getAllAccounts();
  if (!account) return res.status(400).json({ error: 'No MSAL account in cache' });

  const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
  if (!token?.accessToken) return res.status(400).json({ error: 'Could not get access token' });

  const clientState = crypto.randomBytes(16).toString('hex');
  const notificationUrl = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;
  const expirationDateTime = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  const { data: sub } = await axios.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    {
      changeType: 'created,updated',
      resource: 'me/messages',
      notificationUrl,
      clientState,
      expirationDateTime,
    },
    { headers: { Authorization: `Bearer ${token.accessToken}` } },
  );

  await supabase.from('graph_subscriptions').upsert(
    {
      id: sub.id,
      user_id: upn,
      resource: 'me/messages',
      client_state: clientState,
      expires_at: sub.expirationDateTime,
    },
    { onConflict: 'id' },
  );

  return res.status(200).json({ ok: true, subscriptionId: sub.id });
}
