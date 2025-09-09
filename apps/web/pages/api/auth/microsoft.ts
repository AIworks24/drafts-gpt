import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';
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

    // Only set a cookie, no DB writes
    setSession(res, { upn });

    return res.redirect('/dashboard');
  } catch (e: any) {
    console.error('auth callback error', e);
    return res.status(500).json({ error: 'Auth callback failed' });
  }
}
