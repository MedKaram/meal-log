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


// USDA nutrient numbers: 208 energy (kcal), 958/957 Atwater energy (used by some Foundation foods),
// 203 protein, 205 carbohydrate by difference, 204 total fat.
function pick(nutrients, numbers) {
  for (const num of numbers) {
    const n = nutrients.find(x => String(x.nutrientNumber) === num && (num === '208' || num === '957' || num === '958' ? /kcal/i.test(x.unitName || '') : true));
    if (n && typeof n.value === 'number') return n.value;
  }
  return null;
}
const r1 = v => (v === null ? null : Math.round(v * 10) / 10);

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const key = process.env.USDA_API_KEY;
  if (!key) return res.status(501).json({ error: 'USDA_API_KEY is not set' });
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: 'missing q' });

  try {
    const r = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Foundation + SR Legacy = generic foods with separate raw and cooked entries, values per 100 g
      body: JSON.stringify({ query: q, dataType: ['Foundation', 'SR Legacy'], pageSize: 25 })
    });
    if (r.status === 429) return res.status(429).json({ error: 'USDA rate limit' });
    if (!r.ok) { console.error('USDA', r.status, await r.text()); return res.status(502).json({ error: 'USDA error' }); }
    const data = await r.json();
    const results = (data.foods || []).map(f => {
      const n = f.foodNutrients || [];
      const p = pick(n, ['203']), c = pick(n, ['205']), fat = pick(n, ['204']);
      let kcal = pick(n, ['208', '958', '957']);
      if (kcal === null && p !== null && c !== null && fat !== null) kcal = 4 * p + 4 * c + 9 * fat;
      return { fdcId: f.fdcId, name: f.description, type: f.dataType, kcal: kcal === null ? null : Math.round(kcal), p: r1(p), c: r1(c), f: r1(fat) };
    }).filter(x => x.kcal !== null);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json({ results });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'USDA unreachable' });
  }
}
