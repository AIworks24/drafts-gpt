import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { setSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('Missing code');

  const token = await msalApp.acquireTokenByCode({
    code,
    scopes: MS_SCOPES,
    redirectUri: process.env.AZURE_REDIRECT_URI!
  });

  const idToken = token?.idTokenClaims as any;
  const upn = (idToken?.preferred_username || idToken?.upn || '').toLowerCase();
  const tenantId = idToken?.tid || 'unknown';
  const displayName = idToken?.name || upn;

  // upsert user
  const { data: u } = await supabase
    .from('app_users')
    .upsert({ upn, tenant_id: tenantId, display_name: displayName }, { onConflict: 'upn' })
    .select()
    .single();

  // persist serialized token cache per user
  const cacheJson = JSON.parse(msalApp.getTokenCache().serialize());
  await supabase.from('msal_token_cache')
    .upsert({ user_id: u.id, cache_json: cacheJson });

  // start session
  setSession(res, { userId: u.id });

  res.redirect('/dashboard');
}
