// apps/web/lib/session.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize, parse } from 'cookie';
import { createHmac } from 'crypto';

const COOKIE = 'dgpt_sess';
const SECRET = process.env.SESSION_SECRET!;

export type SessionData = { upn?: string; account?: any; userId?: string };

function sign(v: string) {
  return createHmac('sha256', SECRET).update(v).digest('hex');
}

export function getSession(req: NextApiRequest): SessionData {
  const raw = req.headers.cookie ? parse(req.headers.cookie)[COOKIE] : undefined;
  if (!raw) return {};
  try {
    const [payloadB64, sig] = raw.split('.');
    if (sign(payloadB64) !== sig) return {};
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function setSession(res: NextApiResponse, data: SessionData) {
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const val = `${payloadB64}.${sign(payloadB64)}`;
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, val, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
  );
}

export function clearSession(res: NextApiResponse) {
  res.setHeader('Set-Cookie', serialize(COOKIE, '', { path: '/', maxAge: 0 }));
}
