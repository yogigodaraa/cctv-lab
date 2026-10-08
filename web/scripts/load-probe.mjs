// Load out-of-fold scores from worker/train_probe.py as runs of a trained model,
// so they show up on the timelines and in Evaluation next to the zero-shot models.
//
//   npm run load-probe -- <xclip-probe.json>
//
// Each video's scores come from the fold that held that video out.

import { readFile } from 'node:fs/promises';
import { sql } from '../lib/db.js';

const [path] = process.argv.slice(2);
if (!path) {
  console.error('Usage: npm run load-probe -- <xclip-probe.json>');
  process.exit(1);
}
const { summary, videos } = JSON.parse(await readFile(path, 'utf8'));
const model = summary.model;

await sql`
  INSERT INTO model_cards (name, info, updated_at) VALUES (${model}, ${JSON.stringify(summary)}, now())
  ON CONFLICT (name) DO UPDATE SET info = EXCLUDED.info, updated_at = now()`;

let loaded = 0;
for (const v of videos) {
  const [video] = await sql`SELECT id FROM videos WHERE name = ${v.name} ORDER BY id DESC LIMIT 1`;
  if (!video) continue;
  await sql`DELETE FROM runs WHERE video_id = ${video.id} AND model = ${model}`;
  const timing = {
    ms_per_segment: summary.embed_seconds && summary.segments ? Math.round((summary.embed_seconds * 1000) / summary.segments) : null,
    segments: v.segments.length,
    training: { fold: v.fold, folds: summary.folds, train_videos: v.train_videos, train_segments: v.train_segments, train_fight_segments: v.train_fight_segments },
  };
  const [run] = await sql`
    INSERT INTO runs (video_id, model, status, device, timing, started_at, finished_at)
    VALUES (${video.id}, ${model}, 'done', 'offline (cross-validated)', ${JSON.stringify(timing)}, now(), now())
    RETURNING id`;
  await sql`
    INSERT INTO segments (run_id, start_s, end_s, fight_score, top_label)
    SELECT ${run.id}, s.start_s, s.end_s, s.fight_score, CASE WHEN s.fight_score >= 0.5 THEN 'fight' ELSE 'no fight' END
    FROM jsonb_to_recordset(${JSON.stringify(v.segments)}::jsonb) AS s(start_s real, end_s real, fight_score real)`;
  loaded++;
}
console.log(`Loaded ${model} for ${loaded}/${videos.length} videos. Segment ROC-AUC ${summary.segment_roc_auc}.`);
