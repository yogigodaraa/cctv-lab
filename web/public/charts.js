// Small SVG charts for CCTV Lab (no library). Colours follow the model, never its
// rank, and were checked with the dataviz palette validator on the dark surface
// (#121821): lightness, chroma, CVD separation and contrast all pass.

export const MODEL_COLORS = { 'xclip-probe': '#3987e5', xclip: '#d95926', smolvlm: '#199e70' };
const FALLBACK = ['#c98500', '#d55181', '#008300'];
export const colorFor = (model, i = 0) => MODEL_COLORS[model] ?? FALLBACK[i % FALLBACK.length];

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, children = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) n.append(c);
  return n;
};
// Tooltips are built as HTML; model names come from the database, so escape them.
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = (x, y, str, attrs = {}) => {
  const t = svgEl('text', { x, y, fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--mono)', ...attrs });
  t.textContent = str;
  return t;
};

function tooltipFor(container) {
  let tip = container.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip hidden';
    container.append(tip);
  }
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.classList.remove('hidden');
      const w = container.clientWidth;
      tip.style.left = `${Math.min(Math.max(x + 12, 0), w - tip.offsetWidth - 4)}px`;
      tip.style.top = `${Math.max(y - tip.offsetHeight - 10, 0)}px`;
    },
    hide() { tip.classList.add('hidden'); },
  };
}

function legend(series) {
  const box = document.createElement('div');
  box.className = 'chart-legend';
  for (const s of series) {
    const item = document.createElement('span');
    item.innerHTML = `<i style="background:${s.color}"></i>${esc(s.label ?? s.name)}`;
    box.append(item);
  }
  return box;
}

// Generic x/y line chart with markers at the highlighted point of each series.
// series: [{ name, label?, color, points: [{ x, y, ... }], highlight?: index }]
function lineChart(container, { series, x, y, xTicks, yTicks, xTitle, yTitle, tip, diagonal = false, height = 260 }) {
  container.replaceChildren();
  container.classList.add('chart');
  container.append(legend(series));
  const W = Math.max(container.clientWidth, 280), H = height;
  const m = { l: 46, r: 16, t: 10, b: 38 };
  const px = (v) => m.l + x.scale(v) * (W - m.l - m.r);
  const py = (v) => H - m.b - y.scale(v) * (H - m.t - m.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });

  for (const t of yTicks) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(text(m.l - 6, py(t) + 4, y.fmt(t), { 'text-anchor': 'end' }));
  }
  for (const t of xTicks) svg.append(text(px(t), H - m.b + 16, x.fmt(t), { 'text-anchor': 'middle' }));
  svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--muted)', 'stroke-width': 1 }));
  svg.append(text((m.l + W - m.r) / 2, H - 4, xTitle, { 'text-anchor': 'middle' }));
  const yt = text(12, (m.t + H - m.b) / 2, yTitle, { 'text-anchor': 'middle' });
  yt.setAttribute('transform', `rotate(-90 12 ${(m.t + H - m.b) / 2})`);
  svg.append(yt);
  if (diagonal) {
    svg.append(svgEl('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1), stroke: 'var(--muted)', 'stroke-dasharray': '4 4', 'stroke-width': 1 }));
  }

  for (const s of series) {
    const pts = s.points.filter((p) => p.x !== null && p.y !== null);
    if (!pts.length) continue;
    svg.append(svgEl('path', {
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(''),
      fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    const h = s.points[s.highlight];
    if (h && h.x !== null && h.y !== null) {
      svg.append(svgEl('circle', { cx: px(h.x), cy: py(h.y), r: 5, fill: s.color, stroke: 'var(--panel)', 'stroke-width': 2 }));
    }
  }

  // Hover: nearest point across all series.
  const hover = svgEl('circle', { r: 6, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.5, visibility: 'hidden' });
  svg.append(hover);
  const t = tooltipFor(container);
  const flat = series.flatMap((s) => s.points.filter((p) => p.x !== null && p.y !== null).map((p) => ({ s, p })));
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H;
    let best = null, bd = Infinity;
    for (const f of flat) {
      const d = (px(f.p.x) - mx) ** 2 + (py(f.p.y) - my) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    if (!best || bd > 40 ** 2) { hover.setAttribute('visibility', 'hidden'); t.hide(); return; }
    hover.setAttribute('cx', px(best.p.x));
    hover.setAttribute('cy', py(best.p.y));
    hover.setAttribute('visibility', 'visible');
    t.show(tip(best.s, best.p), (px(best.p.x) / W) * r.width, (py(best.p.y) / H) * r.height);
  });
  svg.addEventListener('pointerleave', () => { hover.setAttribute('visibility', 'hidden'); t.hide(); });
  container.append(svg);
}

// False alarms per hour (x, log-like) vs share of annotated fights caught (y).
export function tradeoffChart(container, curves, threshold) {
  const maxFa = Math.max(1, ...curves.flatMap((c) => c.points.map((p) => p.fa_per_hour ?? 0)));
  const lx = (v) => Math.log10(1 + v);
  const ticks = [0, 1, 3, 10, 30, 100, 300, 1000].filter((v) => v <= maxFa * 1.05);
  const idx = (c) => c.points.findIndex((p) => Math.abs(p.threshold - threshold) < 1e-6);
  lineChart(container, {
    series: curves.map((c, i) => ({
      name: c.model, color: colorFor(c.model, i), highlight: idx(c),
      points: c.points.map((p) => ({ ...p, x: p.fa_per_hour, y: p.event_recall })),
    })),
    x: { scale: (v) => lx(v) / lx(maxFa), fmt: (v) => String(v) },
    y: { scale: (v) => v, fmt: (v) => `${Math.round(v * 100)}%` },
    xTicks: ticks, yTicks: [0, 0.25, 0.5, 0.75, 1],
    xTitle: 'False alarms per hour of normal footage (log scale)', yTitle: 'Fights caught',
    tip: (s, p) => `<b>${esc(s.name)}</b> · threshold ${p.threshold.toFixed(2)}<br>${p.fa_per_hour.toFixed(1)} false alarms/h<br>${Math.round(p.event_recall * 100)}% of fights caught`,
  });
}

// Segment-level ROC curve.
export function rocChart(container, curves, threshold) {
  const idx = (c) => c.points.findIndex((p) => Math.abs(p.threshold - threshold) < 1e-6);
  lineChart(container, {
    series: curves.map((c, i) => ({
      name: c.model, label: `${c.model} · AUC ${c.segment_auc.toFixed(2)}`, color: colorFor(c.model, i), highlight: idx(c) + 1,
      points: [{ x: 1, y: 1, threshold: 0 }, ...c.points.map((p) => ({ ...p, x: p.fpr, y: p.tpr })), { x: 0, y: 0, threshold: 1 }],
    })),
    x: { scale: (v) => v, fmt: (v) => `${Math.round(v * 100)}%` },
    y: { scale: (v) => v, fmt: (v) => `${Math.round(v * 100)}%` },
    xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], diagonal: true,
    xTitle: 'False positive rate (2 s segments)', yTitle: 'True positive rate',
    tip: (s, p) => `<b>${esc(s.name)}</b> · threshold ${p.threshold.toFixed(2)}<br>TPR ${Math.round(p.y * 100)}% · FPR ${Math.round(p.x * 100)}%`,
  });
}

// Score over time for one clip: a line per model, annotated fights as hatched
// bands, the threshold as a dashed rule, a playhead, hover readout, click to seek.
export function clipChart(container, { runs, gt, duration, threshold, onSeek }) {
  container.replaceChildren();
  container.classList.add('chart');
  const series = runs.map((r, i) => ({ name: r.model, color: colorFor(r.model, i), segs: r.segments }));
  container.append(legend([...series, ...(gt?.length ? [{ name: 'annotated fight', color: 'repeating-linear-gradient(45deg, var(--muted) 0 2px, transparent 2px 5px)' }] : [])]));
  const W = Math.max(container.clientWidth, 280), H = 170;
  const m = { l: 34, r: 10, t: 8, b: 24 };
  const px = (v) => m.l + (v / duration) * (W - m.l - m.r);
  const py = (v) => H - m.b - v * (H - m.t - m.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });
  const defs = svgEl('defs');
  const pat = svgEl('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(svgEl('rect', { width: 6, height: 6, fill: 'rgba(129,147,168,.10)' }), svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'rgba(129,147,168,.45)', 'stroke-width': 2 }));
  defs.append(pat);
  svg.append(defs);
  for (const g of gt ?? []) {
    svg.append(svgEl('rect', { x: px(g.start_s), y: m.t, width: Math.max(1, px(g.end_s) - px(g.start_s)), height: H - m.t - m.b, fill: 'url(#hatch)' }));
  }
  for (const t of [0, 0.5, 1]) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(text(m.l - 6, py(t) + 4, t.toFixed(1), { 'text-anchor': 'end' }));
  }
  const step = duration > 600 ? 120 : duration > 180 ? 60 : duration > 60 ? 15 : 5;
  for (let s = 0; s <= duration; s += step) {
    svg.append(text(px(s), H - 6, `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`, { 'text-anchor': 'middle' }));
  }
  svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: py(threshold), y2: py(threshold), stroke: 'var(--text)', 'stroke-dasharray': '4 3', 'stroke-width': 1, opacity: 0.7 }));
  svg.append(text(W - m.r, py(threshold) - 4, `threshold ${threshold.toFixed(2)}`, { 'text-anchor': 'end', fill: 'var(--text)' }));
  for (const s of series) {
    const mid = s.segs.map((g) => [px((g.start_s + g.end_s) / 2), py(g.fight_score)]);
    if (!mid.length) continue;
    svg.append(svgEl('path', { d: mid.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(''), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  const head = svgEl('line', { y1: m.t, y2: H - m.b, stroke: 'var(--text)', 'stroke-width': 1.5, 'data-chart-playhead': '' });
  const cross = svgEl('line', { y1: m.t, y2: H - m.b, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(head, cross);
  const tip = tooltipFor(container);
  const timeAt = (e) => {
    const r = svg.getBoundingClientRect();
    const xv = ((e.clientX - r.left) / r.width) * W;
    return { t: Math.min(duration, Math.max(0, ((xv - m.l) / (W - m.l - m.r)) * duration)), xv, r };
  };
  svg.addEventListener('pointermove', (e) => {
    const { t, xv, r } = timeAt(e);
    cross.setAttribute('x1', xv); cross.setAttribute('x2', xv); cross.setAttribute('visibility', 'visible');
    const rows = series.map((s) => {
      const g = s.segs.find((q) => t >= q.start_s && t < q.end_s);
      return g ? `<span style="color:var(--text)"><i class="dot" style="background:${s.color}"></i>${esc(s.name)} ${g.fight_score.toFixed(2)}</span>` : '';
    }).filter(Boolean);
    const inGt = (gt ?? []).some((g) => t >= g.start_s && t < g.end_s);
    tip.show(`<b>${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}</b>${inGt ? ' · annotated fight' : ''}<br>${rows.join('<br>')}`, (xv / W) * r.width, 40);
  });
  svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hide(); });
  svg.addEventListener('click', (e) => onSeek?.(timeAt(e).t));
  container.append(svg);
  return {
    setTime(t) {
      const x = px(Math.min(t, duration));
      head.setAttribute('x1', x); head.setAttribute('x2', x);
    },
  };
}

// Radar ("spider") chart. Every axis is 0..1 with higher = better, so a bigger
// shape is a better model. axes: [{ key, label, hint }]; series: [{ name, color, values: {key: 0..1|null} }]
export function radarChart(container, { axes, series, size = 260 }) {
  container.replaceChildren();
  container.classList.add('chart', 'radar');
  container.append(legend(series));
  const W = size + 220, H = size + 40, cx = W / 2, cy = H / 2 + 4, R = size / 2 - 6;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', style: `max-width:${W}px` });
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    svg.append(svgEl('polygon', { points: axes.map((_, i) => pt(i, ring).join(',')).join(' '), fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 }));
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 1);
    svg.append(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }));
    const [lx, ly] = pt(i, 1.13);
    const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end';
    const t = text(lx, ly + 4, a.label, { 'text-anchor': anchor, fill: 'var(--text)' });
    const title = svgEl('title'); title.textContent = a.hint ?? a.label; t.append(title);
    svg.append(t);
  });
  svg.append(text(cx + 3, cy - R * 0.5 - 2, '0.5'), text(cx + 3, cy - R - 2, '1.0'));
  const tip = tooltipFor(container);
  for (const s of series) {
    const vals = axes.map((a) => s.values[a.key]);
    const pts = vals.map((v, i) => pt(i, v ?? 0));
    svg.append(svgEl('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill: s.color, 'fill-opacity': 0.14, stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    pts.forEach(([x, y], i) => {
      if (vals[i] === null || vals[i] === undefined) return;
      const dot = svgEl('circle', { cx: x, cy: y, r: 4, fill: s.color, stroke: 'var(--panel)', 'stroke-width': 2 });
      const hit = svgEl('circle', { cx: x, cy: y, r: 11, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => {
        const r = svg.getBoundingClientRect();
        tip.show(`<b>${esc(s.name)}</b><br>${esc(axes[i].label)}: ${vals[i].toFixed(2)}${axes[i].hint ? `<br><span class="muted">${esc(axes[i].hint)}</span>` : ''}`, (x / W) * r.width, (y / H) * r.height);
      });
      hit.addEventListener('pointerleave', () => tip.hide());
      svg.append(dot, hit);
    });
  }
  container.append(svg);
}
