// apps/web/pages/api/auth/callback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // Exchange code
    const result = await msalApp.acquireTokenByCode({
      code,
      scopes: MS_SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI!,
    });

    const upn = result.account?.username || '';
    if (!upn) return res.status(400).json({ error: 'No account username (UPN)' });

    // Make sure a local user exists
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .upsert({ upn }, { onConflict: 'upn' })
      .select()
      .single();
    if (userErr) throw userErr;

    // Persist MSAL token cache for webhook/subscription flows
    const cacheJson = JSON.parse(msalApp.getTokenCache().serialize());
    const { error: cacheErr } = await supabase
      .from('msal_token_cache')
      .upsert(
        { user_id: userRow.id, cache_json: cacheJson },
        { onConflict: 'user_id' }
      );
    if (cacheErr) throw cacheErr;

    // Start a cookie session (what the rest of the app reads)
    setSession(res, { upn, userId: userRow.id, account: result.account });

    // Done
    res.redirect('/dashboard');
  } catch (e: any) {
    console.error('callback error', e?.message || e);
    res.status(500).json({ error: 'Auth callback failed' });
  }
}
