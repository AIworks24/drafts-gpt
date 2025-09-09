import { getSession } from '@/lib/session';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import axios from 'axios';

export default async function handler(req, res) {
  const sess = getSession(req);
  if (!sess?.userId) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  // get cache row
  const { data: cacheRow } = await supabase
    .from('msal_token_cache')
    .select('*')
    .eq('user_id', sess.userId)
    .single();

  if (!cacheRow) {
    return res.status(401).json({ error: 'No token cache for user' });
  }

  // hydrate MSAL
  msalApp.getTokenCache().deserialize(JSON.stringify(cacheRow.cache_json));
  const account = (await msalApp.getTokenCache().getAllAccounts())[0];
  if (!account) return res.status(401).json({ error: 'No account in cache' });

  const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES });
  if (!token?.accessToken) return res.status(401).json({ error: 'No access token' });

  // create Graph subscription
  const resp = await axios.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    {
      changeType: 'created',
      notificationUrl: process.env.WEBHOOK_BASE_URL + '/api/graph/webhook',
      resource: '/me/messages',
      expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
      clientState: 'dgpt',
    },
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  // save subscription
  await supabase.from('graph_subscriptions').upsert({
    id: resp.data.id,
    user_id: sess.userId,
    client_state: resp.data.clientState,
    expires_at: resp.data.expirationDateTime,
  });

  return res.json({ ok: true, sub: resp.data });
}
