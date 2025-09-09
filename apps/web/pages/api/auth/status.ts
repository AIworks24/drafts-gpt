// apps/web/pages/api/auth/status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (session?.userId) {
    return res.json({ authenticated: true, userId: session.userId, upn: session.upn });
  }
  return res.status(401).json({ authenticated: false });
}