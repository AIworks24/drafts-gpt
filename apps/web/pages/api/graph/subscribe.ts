// apps/web/pages/api/graph/subscribe.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/session';

const GRAPH = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';
const WEBHOOK_URL = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const sess = getSession(req);
  if (!sess.upn) return res.status(401).json({ error: 'Not signed in' });

  // find cached account + token
  const accounts = await msalApp.getTokenCache().getAllAccounts();
  const account = accounts.find(a => a.username === sess.upn) || accounts[0];
  if (!account) return res.status(401).json({ error: 'No account in cache' });
  const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
  if (!token?.accessToken) return res.status(401).json({ error: 'No token' });

  const clientState = Math.random().toString(36).slice(2);
  const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour (renew later)

  try {
    const { data: sub } = await axios.post(
      `${GRAPH}/subscriptions`,
      {
        changeType: 'created',
        resource: "/me/mailFolders('Inbox')/messages",
        notificationUrl: WEBHOOK_URL,
        clientState,
        expirationDateTime: expiration,
        latestSupportedTlsVersion: 'v1_2',
      },
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );

    try {
      await supabase.from('graph_subscriptions').upsert(
        { id: sub.id, client_state: clientState, user_id: sess.upn } as any
      );
    } catch { /* ignore */ }

    res.status(200).json({ ok: true, id: sub.id });
  } catch (e: any) {
    console.error('subscribe error', e?.response?.data || e);
    res.status(500).json({ error: e?.response?.data || e.message });
  }
}
