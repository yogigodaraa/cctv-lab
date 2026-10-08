import express from 'express';
import { del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

import { checkPasscode, clearSession, hasSession, requireSession, requireWorker, setSession } from './auth.js';
import { sql } from './db.js';
import { confusion, footageMetrics, rocAuc, sweep } from './metrics.js';

const WORKER_ONLINE_S = 45;
const STALE_RUN_MIN = 20;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const LABELS = new Set(['fight', 'nonfight', 'unknown']);

export const app = express();
app.use(express.json({ limit: '2mb' }));

const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

// ---------- session ----------

app.post('/api/login', (req, res) => {
  if (!checkPasscode(req.body?.passcode)) return res.status(401).json({ error: 'Wrong passcode' });
  setSession(res);
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => res.json({ signedIn: hasSession(req) }));

// ---------- worker (the Mac running the models) ----------

const worker = express.Router();
worker.use(requireWorker);

worker.post('/heartbeat', async (req, res) => {
  const { worker_id, device, models } = req.body ?? {};
  if (!worker_id) return res.status(400).json({ error: 'worker_id required' });
  await sql`
    INSERT INTO workers (id, device, models, last_seen)
    VALUES (${worker_id}, ${device ?? null}, ${JSON.stringify(models ?? [])}, now())
    ON CONFLICT (id) DO UPDATE SET device = EXCLUDED.device, models = EXCLUDED.models, last_seen = now()`;
  res.json({ ok: true });
});

worker.post('/claim', async (req, res) => {
  const { worker_id, models } = req.body ?? {};
  if (!worker_id || !Array.isArray(models) || !models.length) {
    return res.status(400).json({ error: 'worker_id and models required' });
  }
  // Requeue runs whose worker disappeared mid-job.
  await sql`
    UPDATE runs SET status = 'queued', worker_id = NULL, started_at = NULL
    WHERE status = 'running' AND started_at < now() - make_interval(mins => ${STALE_RUN_MIN})`;
  const [run] = await sql`
    UPDATE runs SET status = 'running', worker_id = ${worker_id}, started_at = now()
    WHERE id = (
      SELECT id FROM runs
      WHERE status = 'queued' AND model = ANY(${models})
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, video_id, model`;
  if (!run) return res.status(204).end();
  const [video] = await sql`SELECT id, name, url, duration_s FROM videos WHERE id = ${run.video_id}`;
  res.json({ run, video });
});

worker.post('/runs/:id/complete', async (req, res) => {
  const runId = intParam(req.params.id);
  const { segments, timing, device } = req.body ?? {};
  if (runId === null || !Array.isArray(segments)) return res.status(400).json({ error: 'Bad request' });
  if (segments.length) {
    await sql`
      INSERT INTO segments (run_id, start_s, end_s, fight_score, top_label, details, caption)
      SELECT ${runId}, s.start_s, s.end_s, s.fight_score, s.top_label, s.details, s.caption
      FROM jsonb_to_recordset(${JSON.stringify(segments)}::jsonb)
        AS s(start_s real, end_s real, fight_score real, top_label text, details jsonb, caption text)`;
  }
  await sql`
    UPDATE runs SET status = 'done', finished_at = now(), device = ${device ?? null},
                    timing = ${JSON.stringify(timing ?? {})}
    WHERE id = ${runId}`;
  res.json({ ok: true });
});

worker.post('/runs/:id/fail', async (req, res) => {
  const runId = intParam(req.params.id);
  if (runId === null) return res.status(400).json({ error: 'Bad request' });
  await sql`
    UPDATE runs SET status = 'error', error = ${String(req.body?.error ?? 'unknown').slice(0, 2000)},
                    finished_at = now()
    WHERE id = ${runId}`;
  res.json({ ok: true });
});

app.use('/api/worker', worker);

// ---------- app (signed-in users) ----------

const api = express.Router();
api.use(requireSession);

api.get('/status', async (_req, res) => {
  const workers = await sql`
    SELECT id, device, models, last_seen,
           last_seen > now() - make_interval(secs => ${WORKER_ONLINE_S})
             -- A worker busy on a long video sends no heartbeat until it finishes.
             OR EXISTS (SELECT 1 FROM runs r WHERE r.worker_id = workers.id AND r.status = 'running'
                        AND r.started_at > now() - make_interval(mins => ${STALE_RUN_MIN})) AS online
    FROM workers ORDER BY last_seen DESC`;
  const [queue] = await sql`
    SELECT count(*) FILTER (WHERE status = 'queued')::int AS queued,
           count(*) FILTER (WHERE status = 'running')::int AS running
    FROM runs`;
  const models = new Map();
  for (const w of workers) for (const m of w.models) models.set(m.name, m);
  res.json({ workers, queue, models: [...models.values()] });
});

api.get('/model-cards', async (_req, res) => {
  res.json(await sql`SELECT name, info, updated_at FROM model_cards ORDER BY name`);
});

// Token endpoint for direct browser -> Blob uploads (bypasses the 4.5 MB function body limit).
api.post('/blob-upload', async (req, res) => {
  const result = await handleUpload({
    request: req,
    body: req.body,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ['video/*'],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      addRandomSuffix: true,
    }),
    // No onUploadCompleted: the client registers the video itself via POST /api/videos,
    // so Blob never needs to call back into this (session-protected) route.
  });
  res.json(result);
});

api.get('/videos', async (_req, res) => {
  const rows = await sql`
    SELECT v.*,
      COALESCE((
        SELECT jsonb_object_agg(r.model, jsonb_build_object('run_id', r.id, 'status', r.status, 'max_score', r.max_score))
        FROM (
          SELECT DISTINCT ON (model) id, model, status,
                 (SELECT max(fight_score) FROM segments s WHERE s.run_id = runs.id) AS max_score
          FROM runs WHERE video_id = v.id
          ORDER BY model, created_at DESC
        ) r
      ), '{}'::jsonb) AS latest
    FROM videos v ORDER BY v.created_at DESC`;
  res.json(rows);
});

api.post('/videos', async (req, res) => {
  const { name, url, content_type, size_bytes, duration_s, width, height, label } = req.body ?? {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const [video] = await sql`
    INSERT INTO videos (name, url, content_type, size_bytes, duration_s, width, height, label)
    VALUES (${name}, ${url}, ${content_type ?? null}, ${size_bytes ?? null}, ${duration_s ?? null},
            ${width ?? null}, ${height ?? null}, ${LABELS.has(label) ? label : 'unknown'})
    RETURNING *`;
  res.status(201).json(video);
});

api.patch('/videos/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const { label, name } = req.body ?? {};
  if (id === null || (label !== undefined && !LABELS.has(label))) return res.status(400).json({ error: 'Bad request' });
  const [video] = await sql`
    UPDATE videos SET label = COALESCE(${label ?? null}, label), name = COALESCE(${name ?? null}, name)
    WHERE id = ${id} RETURNING *`;
  if (!video) return res.status(404).json({ error: 'Not found' });
  res.json(video);
});

api.delete('/videos/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const [video] = await sql`DELETE FROM videos WHERE id = ${id} RETURNING url`;
  if (!video) return res.status(404).json({ error: 'Not found' });
  await del(video.url).catch(() => {}); // DB row is gone either way
  res.json({ ok: true });
});

api.post('/videos/:id/runs', async (req, res) => {
  const id = intParam(req.params.id);
  const { model } = req.body ?? {};
  if (id === null || !model) return res.status(400).json({ error: 'model required' });
  const [active] = await sql`
    SELECT id FROM runs WHERE video_id = ${id} AND model = ${model} AND status IN ('queued', 'running')`;
  if (active) return res.json({ id: active.id, status: 'already queued' });
  const [run] = await sql`INSERT INTO runs (video_id, model) VALUES (${id}, ${model}) RETURNING *`;
  res.status(201).json(run);
});

api.get('/videos/:id/runs', async (req, res) => {
  const id = intParam(req.params.id);
  const runs = await sql`
    SELECT DISTINCT ON (model) id, model, status, error, device, timing, created_at, started_at, finished_at
    FROM runs WHERE video_id = ${id}
    ORDER BY model, created_at DESC`;
  const ids = runs.map((r) => r.id);
  const segments = ids.length
    ? await sql`SELECT run_id, start_s, end_s, fight_score, top_label, details, caption
                FROM segments WHERE run_id = ANY(${ids}) ORDER BY start_s`
    : [];
  res.json(runs.map((r) => ({ ...r, segments: segments.filter((s) => s.run_id === r.id) })));
});

// Queue every labelled video that has no finished run for this model yet.
api.post('/runs/batch', async (req, res) => {
  const { model, dry_run } = req.body ?? {};
  if (!model) return res.status(400).json({ error: 'model required' });
  // dry_run returns how many clips WOULD be queued, using the same rule as the insert.
  if (dry_run) {
    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM videos v
      WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE r.video_id = v.id AND r.model = ${model} AND r.status <> 'error')`;
    return res.json({ would_queue: n });
  }
  const rows = await sql`
    INSERT INTO runs (video_id, model)
    SELECT v.id, ${model} FROM videos v
    WHERE NOT EXISTS (
      SELECT 1 FROM runs r WHERE r.video_id = v.id AND r.model = ${model} AND r.status <> 'error'
    )
    RETURNING id`;
  res.json({ queued: rows.length });
});

api.get('/metrics', async (req, res) => {
  const threshold = Number.parseFloat(req.query.threshold ?? '0.5');
  const rows = await sql`
    SELECT DISTINCT ON (r.video_id, r.model) r.id, r.model, v.label, v.duration_s, v.gt_segments,
           (SELECT max(fight_score) FROM segments s WHERE s.run_id = r.id) AS max_score,
           (r.timing->>'ms_per_segment')::real AS ms_per_segment
    FROM runs r JOIN videos v ON v.id = r.video_id
    WHERE r.status = 'done' AND v.label <> 'unknown'
    ORDER BY r.video_id, r.model, r.created_at DESC`;
  const hot = rows.length
    ? await sql`SELECT run_id, start_s, end_s FROM segments
                WHERE run_id = ANY(${rows.map((r) => r.id)}) AND fight_score >= ${threshold}`
    : [];
  const hotByRun = new Map();
  for (const s of hot) {
    if (!hotByRun.has(s.run_id)) hotByRun.set(s.run_id, []);
    hotByRun.get(s.run_id).push(s);
  }
  const byModel = new Map();
  for (const r of rows) {
    if (r.max_score === null) continue;
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model).push({ ...r, hot: hotByRun.get(r.id) ?? [] });
  }
  const result = [...byModel].map(([model, rs]) => ({
    model,
    threshold,
    ...confusion(rs, threshold),
    roc_auc: rocAuc(rs),
    ...footageMetrics(rs),
    hours: rs.reduce((a, r) => a + (r.duration_s ?? 0), 0) / 3600,
    avg_ms_per_segment: rs.reduce((a, r) => a + (r.ms_per_segment ?? 0), 0) / rs.length,
  }));
  res.json(result);
});

// Cheap change check for live pages: the browser polls this and only refetches when
// the stamp moves. (Vercel functions cannot hold a push connection open.)
api.get('/changes', async (_req, res) => {
  const [c] = await sql`
    SELECT
      (SELECT max(GREATEST(created_at, COALESCE(started_at, created_at), COALESCE(finished_at, created_at))) FROM runs) AS runs_at,
      (SELECT count(*) FROM runs)::int AS runs,
      (SELECT count(*) FILTER (WHERE status = 'done') FROM runs)::int AS done,
      (SELECT max(created_at) FROM videos) AS videos_at,
      (SELECT count(*) FROM videos)::int AS videos,
      (SELECT max(last_seen) FROM workers) AS worker_at`;
  const latest = await sql`
    SELECT r.worker_id, count(*)::int AS n FROM runs r
    WHERE r.status = 'done' AND r.finished_at > now() - interval '30 seconds'
    GROUP BY r.worker_id`;
  res.set('Cache-Control', 'no-store');
  res.json({ stamp: `${c.runs_at}|${c.runs}|${c.done}|${c.videos_at}|${c.videos}`, done: c.done, worker_at: c.worker_at, recent: latest });
});

// Compute tab: who is running models (Mac, Kaggle...), the queue, recent jobs.
api.get('/compute', async (_req, res) => {
  const workers = await sql`
    SELECT id, device, models, last_seen,
           last_seen > now() - make_interval(secs => ${WORKER_ONLINE_S})
             OR EXISTS (SELECT 1 FROM runs r WHERE r.worker_id = workers.id AND r.status = 'running'
                        AND r.started_at > now() - make_interval(mins => ${STALE_RUN_MIN})) AS online,
           (SELECT count(*)::int FROM runs r WHERE r.worker_id = workers.id AND r.status = 'done') AS runs_done,
           (SELECT max(finished_at) FROM runs r WHERE r.worker_id = workers.id) AS last_finished
    FROM workers ORDER BY last_seen DESC`;
  // Models come from runs AND from what workers advertise, so a new model gets a row
  // (and a "Queue unscored" button) before its first run exists.
  const queue = await sql`
    WITH names AS (
      SELECT DISTINCT model FROM runs
      UNION
      SELECT DISTINCT m->>'name' FROM workers, jsonb_array_elements(workers.models) m
    )
    SELECT n.model,
           count(r.id) FILTER (WHERE r.status = 'queued')::int AS queued,
           count(r.id) FILTER (WHERE r.status = 'running')::int AS running,
           count(r.id) FILTER (WHERE r.status = 'done')::int AS done,
           count(DISTINCT r.video_id) FILTER (WHERE r.status = 'done')::int AS videos_done,
           count(r.id) FILTER (WHERE r.status = 'error')::int AS error,
           round(avg((r.timing->>'ms_per_segment')::real) FILTER (WHERE r.status = 'done'))::int AS ms_per_segment
    FROM names n LEFT JOIN runs r ON r.model = n.model
    WHERE n.model IS NOT NULL
    GROUP BY n.model ORDER BY n.model`;
  const [{ videos }] = await sql`SELECT count(*)::int AS videos FROM videos`;
  const recent = await sql`
    SELECT r.id, r.model, r.status, r.error, r.worker_id, r.device, r.created_at, r.started_at, r.finished_at,
           (r.timing->>'segments')::int AS segments, (r.timing->>'ms_per_segment')::real AS ms_per_segment,
           v.name AS video, v.duration_s
    FROM runs r JOIN videos v ON v.id = r.video_id
    WHERE r.worker_id IS NOT NULL OR r.status <> 'done'
    ORDER BY COALESCE(r.finished_at, r.started_at, r.created_at) DESC
    LIMIT 40`;
  res.json({ workers, queue, videos, recent });
});

// Curves for the Evaluation charts. Only videos every listed model has scored,
// so lines are compared on the same footage.
api.get('/curves', async (_req, res) => {
  const runs = await sql`
    SELECT DISTINCT ON (r.video_id, r.model) r.id, r.video_id, r.model, v.label, v.duration_s, v.gt_segments
    FROM runs r JOIN videos v ON v.id = r.video_id
    WHERE r.status = 'done' AND v.label <> 'unknown'
    ORDER BY r.video_id, r.model, r.created_at DESC`;
  const byModel = new Map();
  for (const r of runs) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model).push(r);
  }
  // Models covering at least half the footage take part; compare on their common videos.
  const total = new Set(runs.map((r) => r.video_id)).size;
  const models = [...byModel].filter(([, rs]) => rs.length >= total / 2).map(([m]) => m);
  const common = [...new Set(runs.map((r) => r.video_id))]
    .filter((id) => models.every((m) => byModel.get(m).some((r) => r.video_id === id)));
  const keep = runs.filter((r) => models.includes(r.model) && common.includes(r.video_id));
  const segs = keep.length
    ? await sql`SELECT run_id, start_s, end_s, fight_score FROM segments WHERE run_id = ANY(${keep.map((r) => r.id)})`
    : [];
  const segByRun = new Map();
  for (const s of segs) {
    if (!segByRun.has(s.run_id)) segByRun.set(s.run_id, []);
    segByRun.get(s.run_id).push(s);
  }
  const thresholds = Array.from({ length: 99 }, (_, i) => Math.round((0.01 + i * 0.01) * 100) / 100);
  res.json({
    videos: common.length,
    models: models.map((m) => {
      const rs = keep.filter((r) => r.model === m).map((r) => ({ ...r, segments: segByRun.get(r.id) ?? [] }));
      const pts = sweep(rs, thresholds);
      // Segment AUC by trapezoid over the sweep (plus the (0,0) and (1,1) ends).
      const roc = [{ fpr: 1, tpr: 1 }, ...pts, { fpr: 0, tpr: 0 }];
      let auc = 0;
      for (let i = 1; i < roc.length; i++) auc += (roc[i - 1].fpr - roc[i].fpr) * (roc[i - 1].tpr + roc[i].tpr) / 2;
      return { model: m, points: pts, segment_auc: auc };
    }),
  });
});

app.use('/api', api);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Server error' });
});
