import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const result = await msalApp.acquireTokenByCode({
      code,
      scopes: MS_SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI!,
    });

    const upn = result.account?.username || '';
    if (!upn) return res.status(400).json({ error: 'No UPN on token' });

    // Ensure a user row exists
    const { data: user, error: userErr } = await supabase
      .from('users')
      .upsert({ upn }, { onConflict: 'upn' })
      .select()
      .single();
    if (userErr || !user) return res.status(500).json({ error: 'users upsert failed', detail: userErr?.message });

    // Persist MSAL cache (used for silent tokens & webhooks)
    const cacheJson = JSON.parse(msalApp.getTokenCache().serialize());
    const { error: cacheErr } = await supabase
      .from('msal_token_cache')
      .upsert({ user_id: user.id, cache_json: cacheJson }, { onConflict: 'user_id' });
    if (cacheErr) return res.status(500).json({ error: 'cache upsert failed', detail: cacheErr.message });

    // Set a simple session
    setSession(res, { userId: user.id, upn });

    return res.redirect('/dashboard');
  } catch (e: any) {
    console.error('auth callback error', e?.response?.data || e);
    return res.status(500).json({ error: 'Auth callback failed' });
  }
}
