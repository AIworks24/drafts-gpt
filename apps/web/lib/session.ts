// apps/web/lib/session.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize, parse } from 'cookie';
import { createHmac, randomBytes } from 'crypto';

const COOKIE = 'dgpt_sess';

export type SessionData = {
  // we store Microsoft UPN after login
  upn?: string;
  // MSAL account cache snippet (used by webhook flow)
  account?: any;
  // legacy compatibility
  userId?: string;
};

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Throw only when used, so the mere import of this module won't crash the build.
    throw new Error('SESSION_SECRET env var is required');
  }
  return s;
}

function sign(payloadB64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

export function getSession(
  req: NextApiRequest | { headers: Record<string, string | string[] | undefined> }
): SessionData | null {
  const cookieHeader = Array.isArray(req.headers.cookie)
    ? req.headers.cookie.join('; ')
    : (req.headers.cookie || '');
  if (!cookieHeader) return null;

  const cookies = parse(cookieHeader);
  const raw = cookies[COOKIE];
  if (!raw) return null;

  const [payloadB64, sig] = raw.split('.');
  if (!payloadB64 || !sig) return null;

  const secret = getSecret();
  const expected = sign(payloadB64, secret);
  if (sig !== expected) return null;

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

export function setSession(res: NextApiResponse, data: SessionData) {
  const secret = getSecret();
  const payloadB64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = sign(payloadB64, secret);
  const value = `${payloadB64}.${sig}`;

  const cookie = serialize(COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  res.setHeader('Set-Cookie', cookie);
}

export function clearSession(res: NextApiResponse) {
  const cookie = serialize(COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.setHeader('Set-Cookie', cookie);
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}
