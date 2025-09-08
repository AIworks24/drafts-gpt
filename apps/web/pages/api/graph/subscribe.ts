import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import crypto from 'crypto';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1) Must be signed in (we expect { upn, account } in the session)
  const sess = getSession(req);
  const upn = sess?.upn;
  if (!upn) return res.status(401).json({ error: 'Not signed in' });

  // 2) Restore MSAL cache for this user to acquire access token
  const { data: cacheRow, error: cacheErr } = await supabase
    .from('msal_token_cache')
    .select('*')
    .eq('user_id', upn)
    .single();

  if (cacheErr || !cacheRow) {
    return res.status(400).json({ error: 'No token cache found for user' });
  }

  const cache = msalApp.getTokenCache();
  cache.deserialize(JSON.stringify(cacheRow.cache_json));
  const [account] = await cache.getAllAccounts();
  if (!account) return res.status(400).json({ error: 'No MSAL account in cache' });

  const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
  if (!token?.accessToken) return res.status(400).json({ error: 'Could not get access token' });

  // 3) Build subscription payload
  const clientState = crypto.randomBytes(16).toString('hex');
  const notificationUrl = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;
  // Graph max is ~4230 minutes; use ~23h to be safe (you can renew later)
  const expirationDateTime = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  // 4) Create the subscription
  const { data: sub } = await axios.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    {
      changeType: 'created,updated',
      resource: 'me/messages',
      notificationUrl,
      clientState,
      expirationDateTime,
    },
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  // 5) Persist subscription
  await supabase.from('graph_subscriptions').upsert(
    {
      id: sub.id,
      user_id: upn,
      client_state: clientState,
      resource: 'me/messages',
      expires_at: sub.expirationDateTime,
    },
    { onConflict: 'id' }
  );

  return res.status(200).json({ ok: true, subscriptionId: sub.id });
}
