// apps/web/pages/api/graph/subscribe.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { msalApp } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const sess = getSession(req);
  if (!sess?.upn) return res.status(401).json({ error: 'Not signed in' });

  try {
    // Load MSAL cache saved during callback
    const { data: cacheRow } = await supabase
      .from('msal_token_cache')
      .select('*')
      .eq('user_id', sess.userId)
      .single();

    if (!cacheRow?.cache_json) {
      return res.status(401).json({ error: 'No Token Cache for user' });
    }

    msalApp.getTokenCache().deserialize(JSON.stringify(cacheRow.cache_json));
    const [account] = await msalApp.getTokenCache().getAllAccounts();
    if (!account) return res.status(401).json({ error: 'No MSAL account in cache' });

    const token = await msalApp.acquireTokenSilent({
      account,
      scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.ReadWrite'],
    });

    const notifUrl = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;
    const clientState = process.env.EDGE_FUNCTION_SECRET || 'dgpt';

    // Create a Graph subscription for new messages
    const now = new Date();
    const exp = new Date(now.getTime() + 60 * 60 * 1000); // 1h (extend/renew in prod)

    const { data: sub } = await axios.post(
      'https://graph.microsoft.com/v1.0/subscriptions',
      {
        changeType: 'created',
        notificationUrl: notifUrl,
        resource: '/me/messages',
        expirationDateTime: exp.toISOString(),
        clientState,
        latestSupportedTlsVersion: 'v1_2',
      },
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );

    // Save subscription (optional but recommended)
    await supabase
      .from('graph_subscriptions')
      .upsert(
        {
          id: sub.id,
          user_id: sess.userId,
          client_state: clientState,
          resource: sub.resource,
          expiration: sub.expirationDateTime,
        },
        { onConflict: 'id' }
      );

    res.status(200).json({ ok: true, id: sub.id, expires: sub.expirationDateTime });
  } catch (e: any) {
    console.error('subscribe error', e?.response?.data || e?.message || e);
    res.status(500).json({ error: 'Subscribe failed' });
  }
}
