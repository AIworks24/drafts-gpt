import type { NextApiRequest, NextApiResponse } from 'next';
import { buildAuthUrl } from '@/lib/msal';
import { newState } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = newState();
  const url = await buildAuthUrl(state);
  res.redirect(url);
}
