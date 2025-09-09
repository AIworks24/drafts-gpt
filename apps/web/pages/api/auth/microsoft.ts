import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { setSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const action = (req.query.action as string) || 'login';

  if (action === 'login') {
    const url = await msalApp.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI!,
      prompt: 'select_account',
    });
    return res.redirect(url);
  }

  if (action === 'callback') {
    try {
      const code = req.query.code as string;
      if (!code) return res.status(400).json({ error: 'Missing code' });

      // 1) Exchange auth code for tokens
      const result = await msalApp.acquireTokenByCode({
        scopes: MS_SCOPES,
        redirectUri: process.env.AZURE_REDIRECT_URI!,
        code,
      });

      const upn = result?.account?.username || '';
      if (!upn) return res.status(400).json({ error: 'No UPN on token' });

      // 2) Ensure user exists (upsert)
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .upsert({ upn }, { onConflict: 'upn' })
        .select()
        .single();

      if (userErr || !userRow) {
        console.error('user upsert failed', userErr);
        return res.status(500).json({ error: 'user upsert failed' });
      }

      // 3) Save MSAL token cache tied to that user_id
      const cacheJson = JSON.parse(msalApp.getTokenCache().serialize());
      const { error: cacheErr } = await supabase
        .from('msal_token_cache')
        .upsert({ user_id: userRow.id, cache_json: cacheJson }, { onConflict: 'user_id' })
        .select()
        .single();

      if (cacheErr) {
        console.error('cache upsert failed', cacheErr);
        return res.status(500).json({ error: 'cache upsert failed', detail: cacheErr.message });
      }

      // 4) Set session cookie for your app
      setSession(res, { userId: userRow.id, upn });

      return res.redirect('/dashboard');
    } catch (e: any) {
      console.error('auth callback error', e);
      return res.status(500).json({ error: 'Auth callback failed', detail: e?.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
