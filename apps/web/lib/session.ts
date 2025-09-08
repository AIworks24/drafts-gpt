import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize, parse } from 'cookie';
import { createHmac, randomBytes } from 'crypto';

const COOKIE = 'dgpt_sess';
const SECRET = process.env.SESSION_SECRET!;
if (!SECRET) {
  // Fail fast during build if not set
  throw new Error('SESSION_SECRET env var is required');
}

export type SessionData = {
  upn?: string;          // Microsoft user principal name (email)
  account?: any;         // MSAL account summary (optional)
};

function sign(payload: string) {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

export function setSession(res: NextApiResponse, data: SessionData) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    }),
  );
}

export function getSession(
  req: NextApiRequest | { headers: Record<string, string> },
): SessionData | null {
  const header = (req as any).headers?.cookie || '';
  const cookies = parse(header || '');
  const raw = cookies[COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

export function clearSession(res: NextApiResponse) {
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      expires: new Date(0),
    }),
  );
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}
