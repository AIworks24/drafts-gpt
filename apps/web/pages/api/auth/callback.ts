import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { setSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const expectedState = cookies['dgpt_state'];
  const returnedState = String(req.query.state || '');
  if (!expectedState || expectedState !== returnedState) {
    return res.status(400).send('Invalid state');
  }

  const code = String(req.query.code || '');
  if (!code) return res.status(400).send('Missing code');

  const result = await msalApp.acquireTokenByCode({
    code,
    scopes: MS_SCOPES,
    redirectUri: process.env.AZURE_REDIRECT_URI!,
  });

  const upn = result.account?.username || '';
  if (!upn) return res.status(400).send('No UPN on token');

  // Persist MSAL cache so background routes (webhooks/subscribe) can get tokens
  try {
    const cache = msalApp.getTokenCache();
    const serialized = cache.serialize(); // string
    await supabase.from('msal_token_cache').upsert(
      { user_id: upn, cache_json: serialized },
      { onConflict: 'user_id' },
    );
  } catch {
    // non-fatal
  }

  // Put UPN in your signed cookie (this is what /api/graph/subscribe expects)
  setSession(res, { upn, account: result.account });

  res.redirect('/dashboard');
}
