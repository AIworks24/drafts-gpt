// apps/web/lib/session.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import type { IncomingHttpHeaders } from 'http';
import { serialize, parse } from 'cookie';
import { createHash, randomBytes } from 'crypto';

const COOKIE = 'dgpt_sess';
const SECRET = process.env.SESSION_SECRET || 'dev-secret';

export type SessionData = {
  userId?: string;
  state?: string;
  upn?: string;
  account?: any;
};

// sign/verify a compact cookie payload
function sign(v: string) {
  return createHash('sha256').update(v + SECRET).digest('hex');
}
function encode(obj: SessionData) {
  const json = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = sign(json);
  return `${json}.${sig}`;
}
function decodeCookie(value: string | undefined): SessionData | null {
  if (!value) return null;
  const [json, sig] = value.split('.');
  if (!json || !sig) return null;
  if (sign(json) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(json, 'base64url').toString());
  } catch {
    return null;
  }
}

// Generate a CSRF-ish state token for the OAuth dance
export function newState(): string {
  return randomBytes(16).toString('hex');
}

// Works for both API routes (NextApiRequest) and getServerSideProps (Node req)
export function getSession(
  req: NextApiRequest | { headers: IncomingHttpHeaders; cookies?: Record<string, string> }
): SessionData | null {
  const cookies =
    // NextApiRequest has a parsed cookies object
    (req as any).cookies ??
    // getServerSideProps gives raw headers; parse them
    parse((req.headers as any)?.cookie || '');
  return decodeCookie(cookies[COOKIE]);
}

export function setSession(res: NextApiResponse, data: SessionData) {
  const value = encode(data);
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, value, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30d
      secure: process.env.NODE_ENV === 'production',
    })
  );
}

export function clearSession(res: NextApiResponse) {
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    })
  );
}
