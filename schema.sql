-- Run this once in the Neon console's SQL Editor.
CREATE TABLE IF NOT EXISTS entries (
  id         text PRIMARY KEY,
  date       text NOT NULL,              -- YYYY-MM-DD
  meal       text NOT NULL,
  food       text NOT NULL,
  state      text NOT NULL,              -- raw | cooked | asis
  grams      real NOT NULL,
  kcal       integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_date_idx ON entries (date);

CREATE TABLE IF NOT EXISTS foods (
  id     text PRIMARY KEY,
  name   text NOT NULL UNIQUE,
  raw    real NOT NULL,                  -- kcal per 100 g raw / as is
  cooked real,                           -- kcal per 100 g cooked (optional)
  method text NOT NULL DEFAULT ''
);
