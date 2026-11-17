import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const STATES = ['raw', 'cooked', 'asis'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const isNum = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100000;

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
        sql`SELECT id, date, meal, food, state, grams, kcal,
                   (extract(epoch FROM created_at) * 1000)::bigint AS "createdAt"
            FROM entries WHERE date = ${date} ORDER BY created_at`,
        sql`SELECT id, name, raw, cooked, method FROM foods ORDER BY name`
      ]);
      entries.forEach(e => { e.createdAt = Number(e.createdAt); });
      return res.status(200).json({ entries, foods });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.type === 'entry') {
        if (!isText(b.id, 64) || !isDate(b.date) || !MEALS.includes(b.meal) || !isText(b.food, 200) ||
            !STATES.includes(b.state) || !isNum(b.grams) || !isNum(b.kcal)) {
          return res.status(400).json({ error: 'bad entry' });
        }
        await sql`INSERT INTO entries (id, date, meal, food, state, grams, kcal)
                  VALUES (${b.id}, ${b.date}, ${b.meal}, ${b.food.trim()}, ${b.state}, ${b.grams}, ${Math.round(b.kcal)})
                  ON CONFLICT (id) DO NOTHING`;
        return res.status(201).json({ ok: true });
      }
      if (b.type === 'food') {
        const cooked = b.cooked === null || b.cooked === undefined ? null : b.cooked;
        if (!isText(b.id, 64) || !isText(b.name, 200) || !isNum(b.raw) || (cooked !== null && !isNum(cooked))) {
          return res.status(400).json({ error: 'bad food' });
        }
        await sql`INSERT INTO foods (id, name, raw, cooked, method)
                  VALUES (${b.id}, ${b.name.trim()}, ${b.raw}, ${cooked}, ${String(b.method || '').slice(0, 60)})
                  ON CONFLICT (name) DO UPDATE SET raw = EXCLUDED.raw, cooked = EXCLUDED.cooked, method = EXCLUDED.method`;
        return res.status(201).json({ ok: true });
      }
      return res.status(400).json({ error: 'unknown type' });
    }

    if (req.method === 'DELETE') {
      const { type, id } = req.query;
      if (!isText(id, 64)) return res.status(400).json({ error: 'bad id' });
      if (type === 'entry') await sql`DELETE FROM entries WHERE id = ${id}`;
      else if (type === 'food') await sql`DELETE FROM foods WHERE id = ${id}`;
      else return res.status(400).json({ error: 'unknown type' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
}
