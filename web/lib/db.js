import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');

export const sql = neon(url);

// Only scores, labels and captions are stored here. Raw frames never are
// (privacy by design); video files live in Blob storage.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS videos (
     id           SERIAL PRIMARY KEY,
     name         TEXT NOT NULL,
     url          TEXT NOT NULL,
     content_type TEXT,
     size_bytes   BIGINT,
     duration_s   REAL,
     width        INT,
     height       INT,
     label        TEXT NOT NULL DEFAULT 'unknown' CHECK (label IN ('fight', 'nonfight', 'unknown')),
     source       TEXT NOT NULL DEFAULT 'upload',
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS runs (
     id          SERIAL PRIMARY KEY,
     video_id    INT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
     model       TEXT NOT NULL,
     status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
     error       TEXT,
     worker_id   TEXT,
     device      TEXT,
     timing      JSONB,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     started_at  TIMESTAMPTZ,
     finished_at TIMESTAMPTZ
   )`,
  // Ground-truth fight intervals [{start_s, end_s}] from frame-level annotations (e.g. UBI-Fights).
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS gt_segments JSONB`,
  // Training summaries for trained models (how they were trained, cross-validated scores).
  `CREATE TABLE IF NOT EXISTS model_cards (
     name       TEXT PRIMARY KEY,
     info       JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS runs_status_idx ON runs (status, created_at)`,
  `CREATE INDEX IF NOT EXISTS runs_video_idx ON runs (video_id, model, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS segments (
     id          SERIAL PRIMARY KEY,
     run_id      INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     start_s     REAL NOT NULL,
     end_s       REAL NOT NULL,
     fight_score REAL NOT NULL,
     top_label   TEXT,
     details     JSONB,
     caption     TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS segments_run_idx ON segments (run_id, start_s)`,
  `CREATE TABLE IF NOT EXISTS workers (
     id        TEXT PRIMARY KEY,
     device    TEXT,
     models    JSONB NOT NULL DEFAULT '[]',
     last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

export async function migrate() {
  for (const statement of SCHEMA) await sql.query(statement);
}
