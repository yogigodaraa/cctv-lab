// Honest operating points: thresholds chosen on training folds, judged on held-out videos.
//
//   npm run operating-points -- <xclip-probe.json> [out.json]
//
// Uses the probe's video folds for every model. Per outer fold, on the TRAINING videos
// only: pick a causal smoothing window (zero-shot models; the probe already chose one
// in its own nested CV) and the highest threshold reaching a target event recall.
// That threshold is applied to the fold's TEST videos. Results are pooled over folds,
// with 95% bootstrap intervals from resampling videos (fight and normal separately).

import { readFile, writeFile } from 'node:fs/promises';
import { sql } from '../lib/db.js';
import { alertEvents } from '../lib/metrics.js';

const [probePath, outPath] = process.argv.slice(2);
if (!probePath) {
  console.error('Usage: npm run operating-points -- <xclip-probe.json> [out.json]');
  process.exit(1);
}
const probe = JSON.parse(await readFile(probePath, 'utf8'));
const foldOf = new Map(probe.videos.map((v) => [v.name, v.fold]));
const MODELS = ['xclip', 'xclip-probe'];
const TARGETS = [0.5, 0.66, 0.8];
const THRESHOLDS = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
const WINDOWS = [1, 3, 5];
const B = 2000;

const runs = await sql`
  SELECT DISTINCT ON (r.video_id, r.model) r.id, r.model, v.name, v.label, v.duration_s, v.gt_segments
  FROM runs r JOIN videos v ON v.id = r.video_id
  WHERE r.status = 'done' AND r.model = ANY(${MODELS}) AND v.label <> 'unknown'
  ORDER BY r.video_id, r.model, r.created_at DESC`;
const segs = await sql`SELECT run_id, start_s, end_s, fight_score FROM segments WHERE run_id = ANY(${runs.map((r) => r.id)}) ORDER BY run_id, start_s`;
const segByRun = new Map();
for (const s of segs) {
  if (!segByRun.has(s.run_id)) segByRun.set(s.run_id, []);
  segByRun.get(s.run_id).push(s);
}

const ov = (a, b) => Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
const causal = (scores, w) => scores.map((_, i) => {
  const lo = Math.max(0, i - w + 1);
  let s = 0;
  for (let j = lo; j <= i; j++) s += scores[j];
  return s / (i - lo + 1);
});

// Per-video outcome at a threshold: alerts (normal videos) or fights caught (fight videos).
function outcome(v, scores, t) {
  const hot = v.segs.filter((_, i) => scores[i] >= t);
  const events = alertEvents(hot);
  if (v.label === 'nonfight') return { hours: v.duration_s / 3600, alarms: events.length, caught: 0, total: 0 };
  const gt = v.gt ?? [];
  return { hours: 0, alarms: 0, caught: gt.filter((g) => events.some((e) => ov(e, g) > 0)).length, total: gt.length };
}
const pool = (os) => os.reduce((a, o) => ({ hours: a.hours + o.hours, alarms: a.alarms + o.alarms, caught: a.caught + o.caught, total: a.total + o.total }), { hours: 0, alarms: 0, caught: 0, total: 0 });

function segAuc(vs, scoresOf) {
  const pos = [], neg = [];
  for (const v of vs) {
    const sc = scoresOf(v);
    v.segs.forEach((s, i) => ((v.gt ?? []).reduce((a, g) => a + ov(s, g), 0) >= 0.5 * (s.end_s - s.start_s) ? pos : neg).push(sc[i]));
  }
  pos.sort((a, b) => a - b); neg.sort((a, b) => a - b);
  let w = 0, j = 0;
  for (const p of pos) {
    while (j < neg.length && neg[j] < p) j++;
    let k = j;
    while (k < neg.length && neg[k] === p) k++;
    w += j + (k - j) / 2;
  }
  return w / (pos.length * neg.length);
}

// Deterministic PRNG so the intervals are reproducible.
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const results = [];
const perVideo = {}; // model -> target -> [outcome per video] (held-out)
for (const model of MODELS) {
  const vs = runs.filter((r) => r.model === model).map((r) => ({
    name: r.name, label: r.label, duration_s: r.duration_s, gt: r.gt_segments,
    fold: foldOf.get(r.name), segs: segByRun.get(r.id) ?? [],
  })).filter((v) => v.fold);
  for (const v of vs) v.raw = v.segs.map((s) => s.fight_score);
  perVideo[model] = {};
  for (const target of TARGETS) {
    const held = [];
    const chosen = [];
    for (const fold of [...new Set(vs.map((v) => v.fold))].sort()) {
      const train = vs.filter((v) => v.fold !== fold), test = vs.filter((v) => v.fold === fold);
      // The probe's stored scores are already causally smoothed (window chosen in its nested CV).
      const w = model === 'xclip-probe' ? 1 : WINDOWS.reduce((best, w2) =>
        segAuc(train, (v) => causal(v.raw, w2)) > segAuc(train, (v) => causal(v.raw, best)) ? w2 : best, 1);
      const sc = (v) => causal(v.raw, w);
      let t = THRESHOLDS[0];
      for (const th of THRESHOLDS) {
        const p = pool(train.map((v) => outcome(v, sc(v), th)));
        if (p.total && p.caught / p.total >= target) t = th;
      }
      chosen.push({ fold, window: w, threshold: t });
      for (const v of test) held.push({ ...outcome(v, sc(v), t), label: v.label });
    }
    perVideo[model][target] = held;
    const p = pool(held);
    results.push({ model, target, chosen, fa_per_hour: p.alarms / p.hours, event_recall: p.caught / p.total, caught: p.caught, total: p.total, alarms: p.alarms, normal_hours: p.hours });
  }
}

// Bootstrap: resample fight and normal videos with replacement (same draw for both models).
const names = (label) => [...new Set(runs.filter((r) => r.label === label).map((r) => r.name))].filter((n) => foldOf.has(n));
const fights = names('fight'), normals = names('nonfight');
for (const target of TARGETS) {
  const idx = Object.fromEntries(MODELS.map((m) => [m, new Map(runs.filter((r) => r.model === m && foldOf.has(r.name)).map((r, i) => [r.name, i]))]));
  const fa = Object.fromEntries(MODELS.map((m) => [m, []])), rec = Object.fromEntries(MODELS.map((m) => [m, []])), ratio = [];
  for (let b = 0; b < B; b++) {
    const draw = [...fights.map(() => fights[Math.floor(rand() * fights.length)]), ...normals.map(() => normals[Math.floor(rand() * normals.length)])];
    const per = {};
    for (const m of MODELS) {
      const held = perVideo[m][target];
      const p = pool(draw.map((n) => held[idx[m].get(n)]).filter(Boolean));
      per[m] = p;
      fa[m].push(p.alarms / p.hours);
      rec[m].push(p.caught / p.total);
    }
    if (per['xclip-probe'].alarms > 0) ratio.push((per.xclip.alarms / per.xclip.hours) / (per['xclip-probe'].alarms / per['xclip-probe'].hours));
  }
  for (const m of MODELS) {
    const r = results.find((x) => x.model === m && x.target === target);
    r.fa_ci = [pct(fa[m], 0.025), pct(fa[m], 0.975)];
    r.recall_ci = [pct(rec[m], 0.025), pct(rec[m], 0.975)];
  }
  results.find((x) => x.model === 'xclip-probe' && x.target === target).fa_ratio_ci = ratio.length ? [pct(ratio, 0.025), pct(ratio, 0.5), pct(ratio, 0.975)] : null;
}

console.log('target  model         recall (95% CI)        false alarms/h (95% CI)');
for (const r of results) {
  console.log(`${String(Math.round(r.target * 100)).padStart(4)}%   ${r.model.padEnd(12)}  ${(r.event_recall * 100).toFixed(0).padStart(3)}% [${(r.recall_ci[0] * 100).toFixed(0)}–${(r.recall_ci[1] * 100).toFixed(0)}]   ${r.fa_per_hour.toFixed(1).padStart(5)} [${r.fa_ci[0].toFixed(1)}–${r.fa_ci[1].toFixed(1)}]${r.fa_ratio_ci ? `   ratio ${r.fa_ratio_ci[1].toFixed(1)}× [${r.fa_ratio_ci[0].toFixed(1)}–${r.fa_ratio_ci[2].toFixed(1)}]` : ''}`);
}
if (outPath) {
  await writeFile(outPath, JSON.stringify({ created: new Date().toISOString(), protocol: 'thresholds and zero-shot smoothing windows chosen on training folds (probe folds); pooled held-out results; 95% bootstrap over videos', B, results }, null, 2));
  console.log(`Wrote ${outPath}`);
}
