import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSession } from '@/lib/session';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  clearSession(res);
  res.redirect('/');
}
