import type { NextApiRequest, NextApiResponse } from 'next';
import { buildAuthUrl } from '@/lib/msal';
import { newState } from '@/lib/session';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = newState();

  // short-lived state cookie to validate callback
  res.setHeader(
    'Set-Cookie',
    serialize('dgpt_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 300, // 5 minutes
    }),
  );

  const url = await buildAuthUrl(state);
  res.redirect(url);
}
