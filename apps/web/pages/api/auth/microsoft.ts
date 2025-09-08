// apps/web/pages/api/auth/microsoft.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { supabase } from '@/lib/supabase';
import { getSession, setSession, clearSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const action = (req.query.action as string) || '';

  if (action === 'login') {
    const url = await msalApp.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI!,
      prompt: 'select_account',
      state: 'msft',
    });
    return res.redirect(url);
  }

  if (action === 'logout') {
    clearSession(res);
    return res.redirect('/dashboard');
  }

  // called by Azure AD after consent
  if (req.query.code) {
    try {
      const result = await msalApp.acquireTokenByCode({
        code: req.query.code as string,
        scopes: MS_SCOPES,
        redirectUri: process.env.AZURE_REDIRECT_URI!,
      });
      const upn = result?.account?.username || '';
      setSession(res, { upn, account: result.account });

      // Best-effort: persist MSAL cache for webhooks
      try {
        await supabase.from('msal_token_cache').upsert(
          { user_id: upn || 'default', cache_json: msalApp.getTokenCache().serialize() } as any,
          { onConflict: 'user_id' } as any
        );
      } catch { /* ignore */ }

      return res.redirect('/dashboard');
    } catch (e: any) {
      console.error('ms auth error', e);
      return res.status(500).send(e.message || 'auth failed');
    }
  }

  if (action === 'me') {
    const sess = getSession(req);
    return res.status(200).json({ upn: sess.upn || null });
  }

  return res.status(400).json({ error: 'bad request' });
}
