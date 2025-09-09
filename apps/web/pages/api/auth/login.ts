import type { NextApiRequest, NextApiResponse } from 'next';
import { msalApp, MS_SCOPES } from '@/lib/msal';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const redirectUri = process.env.AZURE_REDIRECT_URI!;
  const url = await msalApp.getAuthCodeUrl({
    scopes: MS_SCOPES,
    redirectUri,
    prompt: 'select_account',
    responseMode: 'query',
  });
  res.redirect(url);
}
