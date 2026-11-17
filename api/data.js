import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const STATES = ['raw', 'cooked', 'asis'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const isNum = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100000;
const optNum = n => n === null || n === undefined || isNum(n);
const opt = n => (n === null || n === undefined ? null : n);

function authorized(req) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-app-password'] || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL is not set' });
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const date = req.query.date;
      if (!isDate(date)) return res.status(400).json({ error: 'bad date' });
      const [entries, foods] = await Promise.all([
        sql`SELECT id, date, meal, food, state, grams, kcal, protein, carbs, fat,
                   (extract(epoch FROM created_at) * 1000)::bigint AS "createdAt"
            FROM entries WHERE date = ${date} ORDER BY created_at`,
        sql`SELECT id, name, raw, raw_p AS rp, raw_c AS rc, raw_f AS rf,
                   cooked, cooked_p AS cp, cooked_c AS cc, cooked_f AS cf, method, source
            FROM foods ORDER BY name`
      ]);
      entries.forEach(e => { e.createdAt = Number(e.createdAt); });
      return res.status(200).json({ entries, foods });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.type === 'entry') {
        if (!isText(b.id, 64) || !isDate(b.date) || !MEALS.includes(b.meal) || !isText(b.food, 200) ||
            !STATES.includes(b.state) || !isNum(b.grams) || !isNum(b.kcal) ||
            !optNum(b.protein) || !optNum(b.carbs) || !optNum(b.fat)) {
          return res.status(400).json({ error: 'bad entry' });
        }
        await sql`INSERT INTO entries (id, date, meal, food, state, grams, kcal, protein, carbs, fat)
                  VALUES (${b.id}, ${b.date}, ${b.meal}, ${b.food.trim()}, ${b.state}, ${b.grams}, ${Math.round(b.kcal)},
                          ${opt(b.protein)}, ${opt(b.carbs)}, ${opt(b.fat)})
                  ON CONFLICT (id) DO NOTHING`;
        return res.status(201).json({ ok: true });
      }
      if (b.type === 'food') {
        const hasCooked = b.cooked !== null && b.cooked !== undefined;
        if (!isText(b.id, 64) || !isText(b.name, 200) || !isNum(b.raw) ||
            ![b.rp, b.rc, b.rf, b.cooked, b.cp, b.cc, b.cf].every(optNum)) {
          return res.status(400).json({ error: 'bad food' });
        }
        const c = v => (hasCooked ? opt(v) : null);
        await sql`INSERT INTO foods (id, name, raw, raw_p, raw_c, raw_f, cooked, cooked_p, cooked_c, cooked_f, method, source)
                  VALUES (${b.id}, ${b.name.trim()}, ${b.raw}, ${opt(b.rp)}, ${opt(b.rc)}, ${opt(b.rf)},
                          ${c(b.cooked)}, ${c(b.cp)}, ${c(b.cc)}, ${c(b.cf)},
                          ${String(b.method || '').slice(0, 60)}, ${String(b.source || '').slice(0, 200)})
                  ON CONFLICT (name) DO UPDATE SET
                    raw = EXCLUDED.raw, raw_p = EXCLUDED.raw_p, raw_c = EXCLUDED.raw_c, raw_f = EXCLUDED.raw_f,
                    cooked = EXCLUDED.cooked, cooked_p = EXCLUDED.cooked_p, cooked_c = EXCLUDED.cooked_c, cooked_f = EXCLUDED.cooked_f,
                    method = EXCLUDED.method, source = EXCLUDED.source`;
        return res.status(201).json({ ok: true });
      }
      return res.status(400).json({ error: 'unknown type' });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!isText(b.id, 64) || !MEALS.includes(b.meal) || !STATES.includes(b.state) || !isNum(b.grams) || !isNum(b.kcal) ||
          !optNum(b.protein) || !optNum(b.carbs) || !optNum(b.fat)) {
        return res.status(400).json({ error: 'bad edit' });
      }
      const rows = await sql`UPDATE entries SET meal = ${b.meal}, state = ${b.state}, grams = ${b.grams}, kcal = ${Math.round(b.kcal)},
                                    protein = ${opt(b.protein)}, carbs = ${opt(b.carbs)}, fat = ${opt(b.fat)}
                             WHERE id = ${b.id} RETURNING id`;
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { type, id } = req.query;
      if (!isText(id, 64)) return res.status(400).json({ error: 'bad id' });
      if (type === 'entry') await sql`DELETE FROM entries WHERE id = ${id}`;
      else if (type === 'food') await sql`DELETE FROM foods WHERE id = ${id}`;
      else return res.status(400).json({ error: 'unknown type' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
}
