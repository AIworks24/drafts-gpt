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

      // Exchange code
      const result = await msalApp.acquireTokenByCode({
        scopes: MS_SCOPES,
        redirectUri: process.env.AZURE_REDIRECT_URI!,
        code,
      });

      const upn = result?.account?.username || '';
      if (!upn) return res.status(400).json({ error: 'No UPN on token' });

      // 1) Ensure user exists (create if not)
      const { data: userRow, error: upsertErr } = await supabase
        .from('users')
        .upsert({ upn }, { onConflict: 'upn' })
        .select()
        .single();

      if (upsertErr || !userRow) {
        return res.status(500).json({ error: 'user upsert failed', detail: upsertErr?.message });
      }

      // 2) Persist MSAL cache for this user (so webhooks/silent flows can use it)
      try {
        const cacheJson = JSON.parse(msalApp.getTokenCache().serialize()); // serialize returns string
        const { error: cacheErr } = await supabase
          .from('msal_token_cache')
          .upsert({ user_id: userRow.id, cache_json: cacheJson }) // FK will be valid now
          .select()
          .single();

        if (cacheErr) {
          // surface the exact FK failure if it happens
          return res.status(500).json({ error: 'cache upsert failed', detail: cacheErr.message });
        }
      } catch (e: any) {
        return res.status(500).json({ error: 'cache serialize failed', detail: e?.message });
      }

      // 3) Set a small session cookie your app uses
      setSession(res, { userId: userRow.id, upn });

      return res.redirect('/dashboard');
    } catch (e: any) {
      return res.status(500).json({ error: 'Auth callback failed', detail: e?.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
