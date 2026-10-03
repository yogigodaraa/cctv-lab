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
