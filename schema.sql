-- Fresh install: run this once in the Neon console's SQL Editor.
CREATE TABLE IF NOT EXISTS entries (
  id         text PRIMARY KEY,
  date       text NOT NULL,              -- YYYY-MM-DD
  meal       text NOT NULL,
  food       text NOT NULL,
  state      text NOT NULL,              -- raw | cooked | asis
  grams      real NOT NULL,
  kcal       integer NOT NULL,
  protein    real,                       -- grams, for this entry
  carbs      real,
  fat        real,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_date_idx ON entries (date);

CREATE TABLE IF NOT EXISTS foods (
  id       text PRIMARY KEY,
  name     text NOT NULL UNIQUE,
  raw      real NOT NULL,                -- per 100 g raw / as is
  raw_p    real, raw_c real, raw_f real,
  cooked   real,                         -- per 100 g cooked (optional)
  cooked_p real, cooked_c real, cooked_f real,
  method   text NOT NULL DEFAULT '',
  source   text NOT NULL DEFAULT ''      -- e.g. "USDA 171477, 171534"
);
