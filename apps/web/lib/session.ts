import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, randomBytes } from 'crypto';
import { serialize, parse } from 'cookie';

const COOKIE = 'dgpt_sess';
const SECRET = process.env.SESSION_SECRET!;
if (!SECRET || SECRET.length < 32) throw new Error('SESSION_SECRET too short');

export type Sess = { userId: string };

function sign(payload: string) {
  return createHash('sha256').update(SECRET + payload).digest('hex');
}

export function setSession(res: NextApiResponse, sess: Sess) {
  const payload = JSON.stringify(sess);
  const sig = sign(payload);
  res.setHeader('Set-Cookie', serialize(COOKIE, Buffer.from(payload).toString('base64') + '.' + sig, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 60 * 60 * 24 * 30
  }));
}

export function getSession(req: NextApiRequest): Sess | null {
  const raw = parse(req.headers.cookie || '')[COOKIE];
  if (!raw) return null;
  const [b64, sig] = raw.split('.');
  const payload = Buffer.from(b64 || '', 'base64').toString();
  if (sign(payload) !== sig) return null;
  return JSON.parse(payload);
}

export function clearSession(res: NextApiResponse) {
  res.setHeader('Set-Cookie', serialize(COOKIE, '', { path: '/', maxAge: 0 }));
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}
