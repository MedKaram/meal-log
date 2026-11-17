import { createHmac, timingSafeEqual } from 'node:crypto';

// ---- sign-in (same block in data.js, usda.js and login.js) ----
// A remembered device holds a cookie derived from APP_PASSWORD.
// Changing APP_PASSWORD in Vercel signs every device out.
const COOKIE = 'meal_session';
const same = (x, y) => { const a = Buffer.from(String(x)), b = Buffer.from(String(y)); return a.length === b.length && timingSafeEqual(a, b); };
const sessionToken = () => createHmac('sha256', process.env.APP_PASSWORD).update('meal-log-session-v1').digest('base64url');
function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
function authorized(req) {
  const pw = process.env.APP_PASSWORD || '';
  if (!pw) return false;
  const c = readCookie(req, COOKIE);
  if (c && same(c, sessionToken())) return true;
  const h = req.headers['x-app-password'];
  return !!h && same(h, pw);
}
// ----

export default async function handler(req, res) {
  const pw = process.env.APP_PASSWORD || '';
  if (!pw) return res.status(500).json({ error: 'APP_PASSWORD is not set' });

  if (req.method === 'POST') {
    const given = (req.body && req.body.password) || '';
    if (!given || !same(given, pw)) {
      await new Promise(r => setTimeout(r, 800));   // slow down password guessing
      return res.status(401).json({ error: 'wrong password' });
    }
    res.setHeader('Set-Cookie', `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {   // "am I signed in?"
    return res.status(authorized(req) ? 200 : 401).json({ ok: authorized(req) });
  }

  if (req.method === 'DELETE') {   // sign this device out
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'method not allowed' });
}
