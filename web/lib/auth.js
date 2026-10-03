import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'cctv_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function checkPasscode(passcode) {
  const expected = process.env.APP_PASSCODE;
  return Boolean(expected) && typeof passcode === 'string' && safeEqual(passcode, expected);
}

export function setSession(res) {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  const token = `${expires}.${sign(expires)}`;
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function hasSession(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || !safeEqual(sig, sign(expires))) return false;
  return Number(expires) > Date.now() / 1000;
}

export function requireSession(req, res, next) {
  if (hasSession(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

export function requireWorker(req, res, next) {
  const expected = process.env.WORKER_TOKEN;
  const given = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (expected && given && safeEqual(given, expected)) return next();
  res.status(401).json({ error: 'Invalid worker token' });
}
