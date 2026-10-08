// Video-level evaluation: a video is flagged if any segment's score >= threshold.
// FPR is reported explicitly because false alarms are what operators care about most.

const safeDiv = (a, b) => (b === 0 ? null : a / b);

export function confusion(rows, threshold) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const { label, max_score } of rows) {
    const flagged = max_score >= threshold;
    if (label === 'fight') flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  return {
    n: rows.length,
    tp, fp, tn, fn,
    accuracy: safeDiv(tp + tn, rows.length),
    precision,
    recall,
    f1: precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null,
    fpr: safeDiv(fp, fp + tn),
  };
}

// ROC-AUC via the rank-sum formulation (ties count half).
export function rocAuc(rows) {
  const pos = rows.filter((r) => r.label === 'fight').map((r) => r.max_score);
  const neg = rows.filter((r) => r.label !== 'fight').map((r) => r.max_score);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// Merge consecutive above-threshold segments into alert events (what an operator would see).
export function alertEvents(segments) {
  const events = [];
  for (const s of [...segments].sort((a, b) => a.start_s - b.start_s)) {
    const last = events.at(-1);
    if (last && s.start_s <= last.end_s + 0.05) last.end_s = Math.max(last.end_s, s.end_s);
    else events.push({ start_s: s.start_s, end_s: s.end_s });
  }
  return events;
}

const overlaps = (a, b) => a.start_s < b.end_s && b.start_s < a.end_s;

// Long-footage metrics: false alarms per hour of normal footage, and how many
// ground-truth fight intervals got at least one overlapping alert.
export function footageMetrics(runs) {
  let normalHours = 0, falseAlarms = 0, gtTotal = 0, gtCaught = 0;
  for (const r of runs) {
    const events = alertEvents(r.hot);
    if (r.label === 'nonfight') {
      normalHours += (r.duration_s ?? 0) / 3600;
      falseAlarms += events.length;
    } else if (r.label === 'fight' && Array.isArray(r.gt_segments)) {
      for (const gt of r.gt_segments) {
        gtTotal++;
        if (events.some((e) => overlaps(e, gt))) gtCaught++;
      }
    }
  }
  return {
    normal_hours: normalHours,
    false_alarms: falseAlarms,
    fa_per_hour: normalHours > 0 ? falseAlarms / normalHours : null,
    gt_total: gtTotal,
    gt_caught: gtCaught,
  };
}

// Threshold sweep for the Evaluation charts: per threshold, operator-level
// false alarms/h and fights caught, plus segment-level TPR/FPR (ROC).
export function sweep(runs, thresholds) {
  const ov = (a, b) => Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
  const labelled = runs.map((r) => ({
    ...r,
    segs: r.segments.map((s) => ({
      ...s,
      y: Array.isArray(r.gt_segments) && r.gt_segments.reduce((a, g) => a + ov(s, g), 0) >= 0.5 * (s.end_s - s.start_s),
    })),
  }));
  let pos = 0, neg = 0;
  for (const r of labelled) for (const s of r.segs) s.y ? pos++ : neg++;
  return thresholds.map((t) => {
    let tp = 0, fp = 0;
    for (const r of labelled) for (const s of r.segs) if (s.fight_score >= t) s.y ? tp++ : fp++;
    const f = footageMetrics(labelled.map((r) => ({ ...r, hot: r.segs.filter((s) => s.fight_score >= t) })));
    return {
      threshold: t,
      fa_per_hour: f.fa_per_hour,
      event_recall: f.gt_total ? f.gt_caught / f.gt_total : null,
      tpr: pos ? tp / pos : null,
      fpr: neg ? fp / neg : null,
    };
  });
}
