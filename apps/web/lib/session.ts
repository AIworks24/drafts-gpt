import type { NextApiResponse } from 'next';

export type SessionData = {
  userId?: string;
  upn?: string;
};

const COOKIE = 'dgpt_sess';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const [k, ...rest] = part.trim().split('=');
    if (!k) return;
    out[k] = decodeURIComponent(rest.join('=') || '');
  });
  return out;
}

export function getSession(
  req: { headers?: Record<string, any>; cookies?: Record<string, string> }
): SessionData | null {
  let raw = '';
  if (req.cookies && req.cookies[COOKIE]) {
    raw = req.cookies[COOKIE];
  } else if (req.headers && typeof req.headers['cookie'] === 'string') {
    const c = parseCookieHeader(req.headers['cookie']);
    raw = c[COOKIE] || '';
  }
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

export function setSession(res: NextApiResponse, data: SessionData) {
  const val = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const cookie = `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
  const prev = res.getHeader('Set-Cookie');
  if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, cookie]);
  else if (prev) res.setHeader('Set-Cookie', [String(prev), cookie]);
  else res.setHeader('Set-Cookie', cookie);
}

export function clearSession(res: NextApiResponse) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
