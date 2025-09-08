import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { randomBytes } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'Not signed in' });

  const { data: user } = await supabase.from('app_users').select().eq('id', sess.userId).single();
  if (!user) return res.status(404).json({ error: 'User not found' });

  // hydrate MSAL cache
  const { data: cacheRow } = await supabase.from('msal_token_cache').select().eq('user_id', user.id).single();
  if (!cacheRow) return res.status(400).json({ error: 'No token cache' });
  msalApp.getTokenCache().deserialize(JSON.stringify(cacheRow.cache_json));

  const token = await msalApp.acquireTokenSilent({ account: (await msalApp.getTokenCache().getAllAccounts())[0], scopes: MS_SCOPES });

  const clientState = randomBytes(12).toString('hex');
  const expiration = new Date(Date.now() + 60 * 60 * 24 * 1000 - 5 * 60 * 1000); // ~24h minus 5m

  const r = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token!.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created,updated',
      notificationUrl: `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`,
      resource: '/me/messages',
      clientState,
      expirationDateTime: expiration.toISOString()
    })
  });
  if (!r.ok) {
    return res.status(500).json({ error: 'Subscription failed', detail: await r.text() });
  }
  const sub = await r.json();

  await supabase.from('graph_subscriptions').upsert({
    id: sub.id,
    user_id: user.id,
    client_state: clientState,
    resource: sub.resource,
    expiration_time: sub.expirationDateTime
  });

  res.status(200).json({ ok: true, subscriptionId: sub.id, expiration: sub.expirationDateTime });
}
