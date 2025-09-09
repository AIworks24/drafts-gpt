import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirectUri = process.env.AZURE_REDIRECT_URI;
  if (!redirectUri) return res.status(500).json({ error: 'AZURE_REDIRECT_URI missing' });

  try {
    // If Azure sent us back with a ?code=..., this is the callback
    const code = (req.query.code as string) || '';
    if (code) {
      const result = await msalApp.acquireTokenByCode({
        code,
        scopes: MS_SCOPES,
        redirectUri,
      });

      const upn = result.account?.username || '';
      if (!upn) return res.status(400).json({ error: 'No account username (UPN)' });

      // Ensure local user row
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .upsert({ upn }, { onConflict: 'upn' })
        .select()
        .single();
      if (userErr) throw userErr;

      // Persist MSAL token cache for later silent token acquisition
      const cacheJson = JSON.parse(msalApp.getTokenCache().serialize());
      const { error: cacheErr } = await supabase
        .from('msal_token_cache')
        .upsert({ user_id: userRow.id, cache_json: cacheJson }, { onConflict: 'user_id' });
      if (cacheErr) throw cacheErr;

      // Session cookie used by the app
      setSession(res, { userId: userRow.id, upn });
      return res.redirect('/dashboard');
    }

    // Otherwise: start login
    const authUrl = await msalApp.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri,
      prompt: 'select_account',
    });
    return res.redirect(authUrl);
  } catch (e: any) {
    console.error('microsoft auth error', e?.response?.data || e?.message || e);
    return res.status(500).json({ error: 'Auth callback failed' });
  }
}
