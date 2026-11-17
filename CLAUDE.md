# Meal log

Personal meal logger: log foods by weight, raw or cooked, and get calories plus protein, carbs and fat.
Single user, protected by one password. Hosted on Vercel (Hobby plan), data in Neon Postgres.

## Structure
- `index.html` — the whole front end (HTML, CSS and JS in one file, no build step, no framework).
  - `B` / `BASE` near the top of the script: built-in foods, values per 100 g, approximate (not from USDA).
  - The user's saved foods (`custom`, from the DB) take precedence over built-in foods with the same name.
- `api/data.js` — Vercel Node function: GET day's entries + saved foods, POST entry/food, PATCH entry, DELETE entry/food.
- `api/usda.js` — proxies USDA FoodData Central search (Foundation + SR Legacy only; values are per 100 g).
- `api/login.js` — password sign-in; sets an HttpOnly `meal_session` cookie (HMAC of APP_PASSWORD).
- The auth block is duplicated at the top of all three API files; keep them in sync if it changes.
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` — home-screen app icon.
- `schema.sql` — full schema for a fresh database. `migrate-macros.sql` — one-time migration (already applied).

## Data model
- `entries`: id, date (text YYYY-MM-DD), meal (Breakfast|Lunch|Dinner|Snacks), food, state (raw|cooked|asis),
  grams, kcal, protein, carbs, fat (nullable; older entries have none), created_at.
- `foods`: name (unique), raw/raw_p/raw_c/raw_f, cooked/cooked_p/cooked_c/cooked_f (nullable), method, source.
- Calories and macros are computed on the client at log time and stored on the entry.

## Environment variables (set in Vercel, never commit them)
- `DATABASE_URL` — added by the Vercel ↔ Neon integration.
- `APP_PASSWORD` — the app password; changing it signs out all devices.
- `USDA_API_KEY` — free key from fdc.nal.usda.gov/api-key-signup.

## Workflow
- Pushing to `main` deploys to production automatically.
- Local dev (optional): `npm i -g vercel`, `vercel link`, `vercel env pull .env.local`, then `vercel dev`.
  Keep `.env.local` out of git.
- Schema changes: write SQL that is safe to re-run (`ADD COLUMN IF NOT EXISTS`) and run it in the
  Neon SQL Editor on the production branch BEFORE pushing code that uses it.

## Conventions
- Keep it dependency-light: plain HTML/JS front end, `@neondatabase/serverless` is the only package.
- Light and dark themes use CSS variables on `:root`; new colors need both.
- Typographic apostrophes and quotes (’ “ ”) in user-facing text.