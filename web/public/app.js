import { upload } from 'https://esm.sh/@vercel/blob@2.8.0/client';

const $ = (id) => document.getElementById(id);

const state = {
  videos: [],
  models: [],
  selectedId: null,
  runs: [], // runs (with segments) for the selected video
  threshold: 0.5,
  pollTimer: null,
  wallLimit: 24, // tiles rendered at once; keeps Blob reads within the free tier
  wallFilter: 'all',
  wallSort: 'longest',
  tab: 'wall',
  live: { page: 0, size: 9, filter: 'all', threshold: 0.5 },
  runsCache: new Map(), // video id -> runs with segments (for the live wall)
};

// Thumbnails only load when a tile scrolls into view (each load is a Blob read).
const thumbObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const v = e.target;
    v.src = v.dataset.src;
    thumbObserver.unobserve(v);
  }
}, { rootMargin: '200px' });

// What each model is and how it was (or was not) trained. Trained models also get a
// live summary from /api/model-cards (cross-validation numbers).
const MODEL_INFO = {
  xclip: {
    kind: 'zero',
    title: 'X-CLIP (zero-shot)',
    type: 'Video–text model (contrastive, multimodal). Not generative.',
    input: '8 frames per 2 s segment',
    how: 'Compares each segment with text prompts: 4 violent ("people fighting", "a person punching…") vs 6 look-alikes (hugging, dancing, sport, walking, talking, empty). Score = probability mass on the violent prompts.',
    training: 'None. Pretrained on Kinetics-400 by Microsoft; never shown fight data.',
    plain: 'Think of it as a search engine that matches a short video against sentences. We ask: does this clip look more like "people fighting" or more like "people hugging / dancing / playing sport"?',
    size: '~200M parameters · ViT-B/32 image encoder + temporal layers + text encoder',
    pros: ['Sees motion (8 frames)', 'Fast: ~0.1 s per 2 s segment on a MacBook', 'No training needed'],
    cons: ['Never saw fights, so it confuses fast motion with violence', 'Many false alarms on long footage', 'Looks at raw pixels, not just pose'],
  },
  smolvlm: {
    kind: 'zero',
    title: 'SmolVLM-256M (zero-shot VLM)',
    type: 'Small generative vision-language model (image + text → text).',
    input: '2 still frames per 2 s segment (no motion)',
    how: 'Asked "Is anyone fighting…? Answer Yes or No." Score = P(Yes). Also writes a one-line caption for each alert.',
    training: 'None. General instruction-tuned VLM; never shown fight data.',
    plain: 'A tiny chatbot that can see pictures. We show it a frame and ask "Is anyone fighting? Yes or No", and read how confident it is in "Yes". It also describes the scene in one sentence.',
    size: '256M parameters · SigLIP image encoder + SmolLM2 language model',
    pros: ['Explains alerts in words', 'Prompt can be changed without retraining'],
    cons: ['Single frames: cannot see motion', 'Very small, so it almost always answers "No"', 'Slowest: ~1 s per segment'],
  },
  'xclip-probe': {
    kind: 'trained',
    title: 'X-CLIP + trained head',
    type: 'Frozen X-CLIP video features + logistic-regression classifier.',
    input: '8 frames per 2 s segment',
    how: 'X-CLIP turns each segment into a 512-d feature vector; a classifier trained on UBI-Fights frame-level labels scores it.',
    training: '5-fold cross-validation grouped by video: each clip is scored by a model trained on the other ~80% of clips, never on itself.',
    plain: 'Same X-CLIP "eyes", but instead of comparing with sentences we trained a small decision layer on real CCTV fights and normal footage, using the frame-by-frame labels that come with UBI-Fights.',
    size: 'X-CLIP backbone (frozen) + 513 trained weights',
    pros: ['Learns what CCTV fights actually look like', 'Trains in seconds on a laptop', 'Honest held-out evaluation'],
    cons: ['Only as good as X-CLIP features', 'Small training set (~78 clips)', 'Still RGB, not pose'],
  },
};
const modelInfo = (name) => MODEL_INFO[name] ?? { kind: 'zero', title: name, type: '', input: '', how: '', training: '', pros: [], cons: [] };

// ---------- helpers ----------

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new Error('Signed out');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${sec}`;
};
const fmtDur = (s) => {
  if (!s) return '–';
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`;
};
const fmtPct = (v) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(1)}%`);
const scoreColor = (s) => `hsl(${Math.round(120 * (1 - s))} 70% 45%)`;
const el = (tag, { dataset, ...props } = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset); // dataset is read-only, so copy into it
  for (const c of [].concat(children)) node.append(c);
  return node;
};

function videoMeta(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ duration_s: v.duration || null, width: v.videoWidth || null, height: v.videoHeight || null });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve({});
    v.src = URL.createObjectURL(file);
  });
}

// ---------- auth ----------

function showLogin() {
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
}

async function showApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  await Promise.all([refreshStatus(), refreshVideos()]);
  setInterval(refreshStatus, 10_000);
  setInterval(() => { if (state.tab !== 'monitor') refreshVideos(); }, 20_000);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await api('/login', { method: 'POST', body: { passcode: $('passcode').value } });
    $('passcode').value = '';
    await showApp();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  location.reload();
});

// ---------- status ----------

async function refreshStatus() {
  const status = await api('/status');
  const online = status.workers.find((w) => w.online);
  const pill = $('worker-pill');
  pill.textContent = online ? `Worker online · ${online.device}` : 'Worker offline (start it on the Mac)';
  pill.className = `pill ${online ? 'online' : 'offline'}`;
  $('queue-pill').textContent = `Queue: ${status.queue.queued} waiting · ${status.queue.running} running`;
  const names = status.models.map((m) => m.name).join();
  if (names !== state.models.map((m) => m.name).join()) {
    state.models = status.models;
    renderRunButtons();
    renderStats();
  }
}

// ---------- videos ----------

async function refreshVideos() {
  const key = (withRuns) => state.videos.map((v) => `${v.id}${withRuns ? JSON.stringify(v.latest) : ''}`).join();
  const [beforeIds, beforeRuns] = [key(false), key(true)];
  state.videos = await api('/videos');
  renderStats();
  renderTiles();
  if (beforeRuns !== key(true)) state.runsCache.clear(); // new scores: refetch on next wall render
  // Only rebuild the wall when the set of feeds changes, so playing videos are not restarted.
  if (beforeIds !== key(false) && state.tab === 'wall') renderWall();
  if (!state.selectedId && state.videos.length) selectVideo(sortedVideos(state.videos)[0].id);
}

const camName = (v) => `CAM-${String(state.videos.length - state.videos.indexOf(v)).padStart(2, '0')}`;

function sortedVideos(list) {
  const maxScore = (v) => Math.max(-1, ...Object.values(v.latest ?? {}).map((r) => r.max_score ?? -1));
  const by = {
    longest: (a, b) => (b.duration_s ?? 0) - (a.duration_s ?? 0),
    score: (a, b) => maxScore(b) - maxScore(a),
    newest: () => 0,
  }[state.wallSort];
  return [...list].sort(by);
}

// ---------- dataset summary ----------

function renderStats() {
  const vids = state.videos;
  const hours = vids.reduce((a, v) => a + (v.duration_s ?? 0), 0) / 3600;
  const fights = vids.filter((v) => v.label === 'fight').length;
  const normal = vids.filter((v) => v.label === 'nonfight').length;
  const gtEvents = vids.reduce((a, v) => a + (Array.isArray(v.gt_segments) ? v.gt_segments.length : 0), 0);
  const avg = vids.length ? vids.reduce((a, v) => a + (v.duration_s ?? 0), 0) / vids.length : 0;
  const models = state.models.length ? state.models.map((m) => m.name) : ['xclip'];
  const analysed = models.map((m) => [m, vids.filter((v) => v.latest?.[m]?.status === 'done').length]);
  const stat = (value, label, cls = '', extra = null) =>
    el('div', { className: 'stat' }, [el('div', { className: `stat-value ${cls}`, textContent: value }), el('div', { className: 'stat-label', textContent: label }), ...(extra ? [extra] : [])]);
  $('stats').replaceChildren(
    stat(String(vids.length), 'Clips'),
    stat(hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(hours * 60)} min`, 'Footage'),
    stat(fmtDur(avg), 'Avg clip length'),
    stat(`${fights} / ${normal}`, 'Fight / normal clips'),
    stat(String(gtEvents), 'Annotated fight events', 'danger'),
    ...analysed.map(([m, n]) => stat(`${n}/${vids.length}`, `Analysed · ${m}`, 'accent',
      el('div', { className: 'progress' }, el('div', { style: `width:${vids.length ? (100 * n) / vids.length : 0}%` })))),
  );
}

function renderTiles() {
  const tiles = $('tiles');
  tiles.replaceChildren();
  $('empty-wall').classList.toggle('hidden', state.videos.length > 0);
  const visible = sortedVideos(state.videos.filter((v) => state.wallFilter === 'all' || v.label === state.wallFilter));
  $('wall-count').textContent = `${visible.length} clip${visible.length === 1 ? '' : 's'}`;
  visible.slice(0, state.wallLimit).forEach((v) => {
    const scores = Object.entries(v.latest ?? {});
    const flagged = scores.some(([, r]) => r.max_score !== null && r.max_score >= state.threshold);
    const chips = el('div', { className: 'chips' }, [
      el('span', { className: `chip ${v.label}`, textContent: v.label === 'nonfight' ? 'normal' : v.label }),
      ...scores.map(([model, r]) =>
        el('span', {
          className: `chip ${r.max_score >= state.threshold ? 'hot' : ''}`,
          textContent: r.status === 'done' ? `${model} ${r.max_score?.toFixed(2) ?? '–'}` : `${model} ${r.status}`,
        })),
    ]);
    const thumb = el('video', { muted: true, preload: 'metadata', playsInline: true });
    thumb.dataset.src = `${v.url}#t=${Math.min(5, (v.duration_s ?? 1) / 2)}`;
    thumbObserver.observe(thumb);
    const gtBar = el('div', { className: 'gt-bar', title: 'Annotated fight intervals' },
      (v.gt_segments ?? []).map((g) => el('div', {
        style: `left:${(g.start_s / (v.duration_s || 1)) * 100}%;width:${Math.max(0.5, ((g.end_s - g.start_s) / (v.duration_s || 1)) * 100)}%`,
      })));
    const tile = el('button', {
      className: `tile ${v.id === state.selectedId ? 'active' : ''} ${flagged ? 'flagged' : ''}`,
      onclick: () => selectVideo(v.id),
    }, [
      el('div', { className: 'tile-thumb' }, [thumb, el('span', { className: 'duration', textContent: fmtDur(v.duration_s) })]),
      gtBar,
      el('div', { className: 'tile-body' }, [
        el('div', { className: 'tile-name', textContent: `${camName(v)} · ${v.name}` }),
        chips,
      ]),
    ]);
    tiles.append(tile);
  });
  if (visible.length > state.wallLimit) {
    tiles.append(el('button', {
      className: 'ghost more',
      textContent: `Show more (${visible.length - state.wallLimit} hidden)`,
      onclick: () => { state.wallLimit += 24; renderTiles(); },
    }));
  }
}

$('wall-sort').addEventListener('change', (e) => {
  state.wallSort = e.target.value;
  renderTiles();
});

// ---------- live camera wall ----------

async function runsFor(id) {
  if (!state.runsCache.has(id)) state.runsCache.set(id, api(`/videos/${id}/runs`).catch(() => []));
  return state.runsCache.get(id);
}

function wallVideos() {
  const f = state.live.filter;
  const list = state.videos.filter((v) => f === 'all' || v.label === f);
  if (f !== 'all') return sortedVideos(list);
  // Interleave fight and normal feeds so every page looks like a realistic mixed wall.
  const fights = list.filter((v) => v.label === 'fight');
  const others = list.filter((v) => v.label !== 'fight');
  const out = [];
  for (let i = 0; i < Math.max(fights.length, others.length); i++) {
    if (others[i]) out.push(others[i]);
    if (fights[i]) out.push(fights[i]);
  }
  return out;
}

function renderWall() {
  const grid = $('wall-grid');
  grid.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
  grid.replaceChildren();
  const { size } = state.live;
  grid.style.setProperty('--cols', Math.sqrt(size));
  const list = wallVideos();
  const pages = Math.max(1, Math.ceil(list.length / size));
  state.live.page = Math.min(state.live.page, pages - 1);
  const pageVids = list.slice(state.live.page * size, (state.live.page + 1) * size);
  $('wall-page-label').textContent = list.length ? `· page ${state.live.page + 1}/${pages} · ${list.length} feeds` : '';
  if (!pageVids.length) {
    grid.append(el('p', { className: 'muted', textContent: 'No footage yet.' }));
    return;
  }
  for (const v of pageVids) {
    const video = el('video', { muted: true, autoplay: true, loop: true, playsInline: true, preload: 'auto', src: v.url });
    const clock = el('span', { textContent: '00:00.0' });
    const alertTag = el('div', { className: 'feed-alert hidden', textContent: '⚠ FIGHT' });
    const scoreTag = el('span', { textContent: '…' });
    const head = el('div', { className: 'head' });
    const dur = v.duration_s || 1;
    const bar = el('div', { className: 'feed-score' }, [
      ...(v.gt_segments ?? []).map((g) => el('div', {
        className: 'gt', style: `left:${(g.start_s / dur) * 100}%;width:${Math.max(0.5, ((g.end_s - g.start_s) / dur) * 100)}%`,
      })),
      head,
    ]);
    const feed = el('div', { className: 'feed', title: v.name, onclick: () => { switchTab('monitor'); selectVideo(v.id); } }, [
      video,
      el('div', { className: 'overlay top-left' }, [el('span', { textContent: `${camName(v)} · ${v.name.replace(/\.mp4$/, '')}` })]),
      el('div', { className: 'overlay top-right' }, [el('span', { className: 'rec-dot' }), clock]),
      el('div', { className: 'overlay bottom-left' }, [el('span', {
        textContent: v.label === 'fight' ? 'GT: fight footage' : v.label === 'nonfight' ? 'GT: normal' : 'unlabelled',
      })]),
      el('div', { className: 'overlay bottom-right' }, [scoreTag]),
      alertTag,
      bar,
    ]);
    grid.append(feed);
    runsFor(v.id).then((runs) => {
      const done = runs.filter((r) => r.status === 'done');
      if (!done.length) scoreTag.textContent = runs.length ? `${runs[0].model} ${runs[0].status}` : 'not analysed';
      video.addEventListener('timeupdate', () => {
        const t = video.currentTime;
        clock.textContent = fmtTime(t);
        head.style.left = `${(t / (video.duration || dur)) * 100}%`;
        let top = null;
        for (const r of done) {
          const seg = r.segments.find((s) => t >= s.start_s && t < s.end_s);
          if (seg && (!top || seg.fight_score > top.score)) top = { model: r.model, score: seg.fight_score };
        }
        const hot = top && top.score >= state.live.threshold;
        feed.classList.toggle('alarm', !!hot);
        alertTag.classList.toggle('hidden', !hot);
        if (top) {
          scoreTag.textContent = `${top.model} ${top.score.toFixed(2)}`;
          scoreTag.style.color = scoreColor(top.score);
        }
      });
    });
  }
}

$('wall-layout').addEventListener('change', (e) => { state.live.size = Number(e.target.value); state.live.page = 0; renderWall(); });
$('wall-filter-live').addEventListener('change', (e) => { state.live.filter = e.target.value; state.live.page = 0; renderWall(); });
$('wall-threshold').addEventListener('input', (e) => {
  state.live.threshold = Number(e.target.value);
  $('wall-threshold-value').textContent = state.live.threshold.toFixed(2);
});
$('wall-prev').addEventListener('click', () => { state.live.page = Math.max(0, state.live.page - 1); renderWall(); });
$('wall-next').addEventListener('click', () => {
  const pages = Math.ceil(wallVideos().length / state.live.size);
  state.live.page = (state.live.page + 1) % Math.max(1, pages);
  renderWall();
});

$('wall-filter').addEventListener('change', (e) => {
  state.wallFilter = e.target.value;
  state.wallLimit = 24;
  renderTiles();
});

const selectedVideo = () => state.videos.find((v) => v.id === state.selectedId);

async function selectVideo(id) {
  state.selectedId = id;
  const v = selectedVideo();
  if (!v) return;
  $('player').src = v.url;
  $('cam-name').textContent = `${camName(v)} · ${v.name}`;
  $('label-select').value = v.label;
  renderTiles();
  await refreshRuns();
}

async function refreshRuns() {
  clearTimeout(state.pollTimer);
  if (!state.selectedId) return;
  state.runs = await api(`/videos/${state.selectedId}/runs`);
  renderTimelines();
  renderEvents();
  if (state.runs.some((r) => r.status === 'queued' || r.status === 'running')) {
    state.pollTimer = setTimeout(async () => {
      await refreshRuns();
      if (!state.runs.some((r) => r.status === 'queued' || r.status === 'running')) refreshVideos();
    }, 3000);
  }
}

// ---------- monitor ----------

function renderRunButtons() {
  const make = (container, handler, prefix) => {
    container.replaceChildren(...state.models.map((m) =>
      el('button', { textContent: `${prefix} ${m.name}`, title: m.description, onclick: () => handler(m.name) })));
    if (!state.models.length) container.append(el('span', { className: 'muted small', textContent: 'No models yet: start the worker on the Mac.' }));
  };
  make($('run-buttons'), runModel, 'Run');
  make($('batch-buttons'), batchRun, 'Run all videos ·');
}

async function runModel(model) {
  if (!state.selectedId) return;
  await api(`/videos/${state.selectedId}/runs`, { method: 'POST', body: { model } });
  await Promise.all([refreshRuns(), refreshStatus()]);
}

async function batchRun(model) {
  const { queued } = await api('/runs/batch', { method: 'POST', body: { model } });
  alert(`Queued ${queued} video(s) for ${model}.`);
  refreshStatus();
}

function renderTimelines() {
  const duration = $('player').duration || selectedVideo()?.duration_s || 1;
  const wrap = $('timelines');
  wrap.replaceChildren();
  const v = selectedVideo();
  if (v && Array.isArray(v.gt_segments)) {
    const track = el('div', { className: 'track gt-track', title: 'Frame-level ground truth (annotated fight intervals)' },
      v.gt_segments.length
        ? v.gt_segments.map((g) => el('div', {
          className: 'seg gt',
          title: `Fight ${fmtTime(g.start_s)}–${fmtTime(g.end_s)}`,
          style: `left:${(g.start_s / duration) * 100}%;width:${Math.max(0.3, ((g.end_s - g.start_s) / duration) * 100)}%`,
        }))
        : [el('div', { className: 'track-status', textContent: 'no fight in this clip' })]);
    track.append(el('div', { className: 'playhead', dataset: { playhead: '' } }));
    track.onclick = (e) => {
      const rect = track.getBoundingClientRect();
      $('player').currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    };
    wrap.append(el('div', { className: 'timeline' }, [el('span', { className: 'timeline-name', textContent: 'ground truth' }), track]));
  }
  for (const run of state.runs) {
    const track = el('div', { className: 'track' });
    if (run.status === 'done') {
      for (const s of run.segments) {
        track.append(el('div', {
          className: `seg ${s.fight_score >= state.threshold ? 'over' : ''}`,
          title: `${fmtTime(s.start_s)}–${fmtTime(s.end_s)} · ${s.fight_score.toFixed(2)} · ${s.top_label ?? ''}`,
          style: `left:${(s.start_s / duration) * 100}%;width:${((s.end_s - s.start_s) / duration) * 100}%;background:${scoreColor(s.fight_score)}`,
        }));
      }
      track.append(el('div', { className: 'playhead', dataset: { playhead: '' } }));
      track.onclick = (e) => {
        const rect = track.getBoundingClientRect();
        $('player').currentTime = ((e.clientX - rect.left) / rect.width) * duration;
      };
    } else {
      track.append(el('div', {
        className: 'track-status',
        textContent: run.status === 'error' ? `error: ${run.error}` : `${run.status}…`,
      }));
    }
    wrap.append(el('div', { className: 'timeline' }, [el('span', { className: 'timeline-name', textContent: run.model }), track]));
  }
  updatePlayhead();
  renderClipResults();
}

// How each model did on this one clip, against the frame-level ground truth.
function renderClipResults() {
  const box = $('clip-results');
  box.replaceChildren();
  const v = selectedVideo();
  const done = state.runs.filter((r) => r.status === 'done' && r.segments.length);
  if (!v || !done.length) return;
  const gt = Array.isArray(v.gt_segments) ? v.gt_segments : (v.label === 'nonfight' ? [] : null);
  const overlap = (a, b) => Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
  const isFightSeg = (s) => gt && gt.reduce((a, g) => a + overlap(s, g), 0) >= 0.5 * (s.end_s - s.start_s);
  const t = state.threshold;
  const order = ['xclip-probe', 'xclip', 'smolvlm'];
  done.sort((a, b) => (order.indexOf(a.model) + 99) % 99 - (order.indexOf(b.model) + 99) % 99);

  const rows = done.map((r) => {
    const info = modelInfo(r.model);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    const pos = [], neg = [];
    for (const s of r.segments) {
      const y = isFightSeg(s), hit = s.fight_score >= t;
      if (gt) (y ? pos : neg).push(s.fight_score);
      if (!gt) continue;
      if (y) hit ? tp++ : fn++; else hit ? fp++ : tn++;
    }
    let auc = null;
    if (pos.length && neg.length) {
      let w = 0;
      for (const p of pos) for (const q of neg) w += p > q ? 1 : p === q ? 0.5 : 0;
      auc = w / (pos.length * neg.length);
    }
    // Alerts as an operator sees them (consecutive hot segments merged).
    const alerts = [];
    for (const s of r.segments) {
      if (s.fight_score < t) continue;
      const last = alerts.at(-1);
      if (last && s.start_s <= last.end_s + 0.05) last.end_s = s.end_s; else alerts.push({ start_s: s.start_s, end_s: s.end_s });
    }
    const matched = gt ? alerts.filter((a) => gt.some((g) => overlap(a, g) > 0)).length : null;
    const caught = gt ? gt.filter((g) => alerts.some((a) => overlap(a, g) > 0)).length : null;
    const tr = r.timing?.training;
    const note = info.kind === 'trained' && tr
      ? `Held out in fold ${tr.fold}/${tr.folds}. Trained on ${tr.train_videos} other clips (${tr.train_segments} segments, ${tr.train_fight_segments} fight); never saw this one.`
      : info.training;
    const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
    return el('tr', {}, [
      el('td', {}, [el('div', { textContent: r.model }), el('span', { className: `badge ${info.kind}`, textContent: info.kind === 'trained' ? 'trained · held-out' : 'zero-shot' })]),
      el('td', { textContent: auc === null ? '–' : auc.toFixed(2) }),
      el('td', { textContent: gt ? pct(tp, tp + fp) : '–' }),
      el('td', { textContent: gt ? pct(tp, tp + fn) : '–' }),
      el('td', { textContent: String(alerts.length) }),
      el('td', { className: gt && alerts.length - matched > 0 ? 'bad' : '', textContent: gt ? String(alerts.length - matched) : '–' }),
      el('td', { className: gt && gt.length && caught === gt.length ? 'good' : '', textContent: gt && gt.length ? `${caught}/${gt.length}` : '–' }),
      el('td', { className: 'training-note', textContent: note }),
    ]);
  });
  box.append(
    el('h3', { textContent: `How each model did on this clip · threshold ${t.toFixed(2)}` }),
    el('div', { className: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Model', 'AUC', 'Precision', 'Recall', 'Alerts', v.label === 'nonfight' ? 'False alarms' : 'Outside fight', 'Fights caught', 'Training'].map((h) => el('th', { textContent: h })))),
      el('tbody', {}, rows),
    ])),
    el('p', { className: 'muted small', textContent: 'Segment-level, against the frame-level annotation: a 2 s segment is "fight" if at least half of it is annotated as fight. Precision/recall at the current threshold; AUC is threshold-free.' }),
  );
}

function renderEvents() {
  const list = $('events');
  list.replaceChildren();
  // Consecutive hot segments merge into one alert, as an operator would see it.
  const events = [];
  for (const r of state.runs.filter((x) => x.status === 'done')) {
    let cur = null;
    for (const s of r.segments) {
      if (s.fight_score < state.threshold) { cur = null; continue; }
      if (cur && s.start_s <= cur.end_s + 0.05) {
        cur.end_s = s.end_s;
        if (s.fight_score > cur.fight_score) Object.assign(cur, { fight_score: s.fight_score, caption: s.caption, top_label: s.top_label });
      } else {
        cur = { ...s, model: r.model };
        events.push(cur);
      }
    }
  }
  events.sort((a, b) => a.start_s - b.start_s);
  const gt = selectedVideo()?.gt_segments;
  $('events-count').textContent = events.length ? `· ${events.length}` : '';

  for (const ev of events) {
    list.append(el('button', { className: 'event', onclick: () => { $('player').currentTime = ev.start_s; $('player').play(); } }, [
      el('div', { className: 'event-head' }, [
        el('span', { textContent: `${fmtTime(ev.start_s)}–${fmtTime(ev.end_s)} · ${ev.model}` }),
        el('b', { textContent: ev.fight_score.toFixed(2), style: `color:${scoreColor(ev.fight_score)}` }),
      ]),
      el('div', { className: 'event-caption', textContent: [
        Array.isArray(gt) ? (gt.some((g) => g.start_s < ev.end_s && ev.start_s < g.end_s) ? '✓ matches annotated fight' : (selectedVideo()?.label === 'nonfight' ? '✗ false alarm' : '✗ outside annotated fight')) : null,
        ev.caption ?? ev.top_label,
      ].filter(Boolean).join(' · ') }),
    ]));
  }
  for (const r of state.runs.filter((x) => x.status === 'done' && x.timing)) {
    list.append(el('div', { className: 'event info' }, [
      el('div', { className: 'event-head' }, [el('span', { textContent: `${r.model} · ${r.device ?? ''}` })]),
      el('div', { className: 'event-caption', textContent: `${r.timing.ms_per_segment} ms / segment · ${r.segments.length} segments` }),
    ]));
  }
  if (!events.length && !list.children.length) {
    list.append(el('p', { className: 'muted', textContent: 'No alerts. Run a model on this video.' }));
  }
}

function updatePlayhead() {
  const player = $('player');
  const t = player.currentTime || 0;
  const duration = player.duration || selectedVideo()?.duration_s || 1;
  document.querySelectorAll('[data-playhead]').forEach((p) => { p.style.left = `${(t / duration) * 100}%`; });
  $('cam-clock').textContent = fmtTime(t);

  const active = state.runs
    .filter((r) => r.status === 'done')
    .flatMap((r) => r.segments.map((s) => ({ ...s, model: r.model })))
    .filter((s) => t >= s.start_s && t < s.end_s && s.fight_score >= state.threshold);
  $('screen').classList.toggle('alarm', active.length > 0);
  $('alert-banner').classList.toggle('hidden', active.length === 0);
  if (active.length) {
    const top = active.reduce((a, b) => (a.fight_score >= b.fight_score ? a : b));
    $('alert-detail').textContent = `${top.model} ${top.fight_score.toFixed(2)}`;
  }
}

$('player').addEventListener('timeupdate', updatePlayhead);
$('player').addEventListener('loadedmetadata', renderTimelines);

$('threshold').addEventListener('input', (e) => {
  state.threshold = Number(e.target.value);
  $('threshold-value').textContent = state.threshold.toFixed(2);
  renderTimelines();
  renderEvents();
  renderTiles();
});

$('label-select').addEventListener('change', async (e) => {
  await api(`/videos/${state.selectedId}`, { method: 'PATCH', body: { label: e.target.value } });
  await refreshVideos();
});

$('delete-video').addEventListener('click', async () => {
  const v = selectedVideo();
  if (!v || !confirm(`Delete "${v.name}" and its results?`)) return;
  await api(`/videos/${v.id}`, { method: 'DELETE' });
  state.selectedId = null;
  $('player').removeAttribute('src');
  state.runs = [];
  renderTimelines();
  renderEvents();
  await refreshVideos();
});

$('privacy').addEventListener('change', (e) => document.body.classList.toggle('privacy', e.target.checked));

// ---------- upload ----------

$('upload-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const bar = $('upload-progress');
  bar.classList.remove('hidden');
  for (const [i, file] of files.entries()) {
    try {
      const meta = await videoMeta(file);
      const blob = await upload(`videos/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload',
        multipart: file.size > 50 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          bar.textContent = `Uploading ${i + 1}/${files.length}: ${file.name} · ${Math.round(percentage)}%`;
        },
      });
      const video = await api('/videos', {
        method: 'POST',
        body: { name: file.name, url: blob.url, content_type: file.type, size_bytes: file.size, ...meta },
      });
      state.selectedId = video.id;
    } catch (err) {
      alert(`Upload failed for ${file.name}: ${err.message}`);
    }
  }
  bar.classList.add('hidden');
  await refreshVideos();
  if (state.selectedId) selectVideo(state.selectedId);
});

// ---------- tabs & evaluation ----------

function switchTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  for (const t of ['wall', 'monitor', 'eval', 'models']) $(`tab-${t}`).classList.toggle('hidden', t !== name);
  if (name === 'models') renderModelCards([]);
  if (name === 'wall') renderWall();
  else $('wall-grid').querySelectorAll('video').forEach((v) => v.pause());
  if (name !== 'monitor') $('player').pause();
  if (name === 'eval') refreshMetrics();
}
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

async function renderModelCards(rows) {
  const cards = await api('/model-cards').catch(() => []);
  const live = Object.fromEntries(cards.map((c) => [c.name, c.info]));
  const names = [...new Set([...Object.keys(MODEL_INFO), ...rows.map((r) => r.model)])];
  $('model-cards').replaceChildren(...names.map((name) => {
    const info = modelInfo(name);
    const extra = live[name];
    const items = [
      ['Type', info.type], ['Size', info.size], ['Input', info.input], ['How it scores', info.how], ['Training', info.training],
      ...(extra ? [
        ['Data', `${extra.videos} clips, ${extra.segments} segments (${extra.fight_segments} fight)`],
        ['Split', extra.split],
        ['Held-out result', `segment ROC-AUC ${extra.segment_roc_auc}, average precision ${extra.segment_avg_precision}`],
        ['Trained', extra.trained_at],
      ] : []),
    ].filter(([, v]) => v);
    return el('div', { className: 'model-card' }, [
      el('h3', {}, [el('span', { textContent: info.title }), el('span', { className: `badge ${info.kind}`, textContent: info.kind === 'trained' ? 'trained' : 'zero-shot' })]),
      ...(info.plain ? [el('p', { className: 'plain', textContent: info.plain })] : []),
      el('dl', {}, items.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])),
      ...(info.pros?.length ? [el('div', { className: 'pros-cons' }, [
        el('div', {}, [el('span', { className: 'good', textContent: 'Strengths' }), el('ul', {}, info.pros.map((x) => el('li', { textContent: x })))]),
        el('div', {}, [el('span', { className: 'bad', textContent: 'Weaknesses' }), el('ul', {}, info.cons.map((x) => el('li', { textContent: x })))]),
      ])] : []),
    ]);
  }));
}

async function refreshMetrics() {
  const t = Number($('eval-threshold').value);
  const rows = await api(`/metrics?threshold=${t}`);
  const body = $('metrics-body');
  body.replaceChildren();
  $('eval-cards').replaceChildren(...rows.map((r) => {
    const kpi = (value, label, cls = '') => el('div', {}, [
      el('div', { className: `stat-value ${cls}`, textContent: value }), el('div', { className: 'stat-label', textContent: label })]);
    return el('div', { className: 'eval-card' }, [
      el('h3', { textContent: `${r.model} @ ${t.toFixed(2)}` }),
      el('div', { className: 'kpis' }, [
        kpi(r.roc_auc === null ? '–' : r.roc_auc.toFixed(2), 'ROC-AUC'),
        kpi(r.fa_per_hour === null ? '–' : r.fa_per_hour.toFixed(1), 'False alarms / h', 'danger'),
        kpi(r.gt_total ? `${r.gt_caught}/${r.gt_total}` : '–', 'Fights caught', 'accent'),
      ]),
      el('div', { className: 'muted small', textContent: `${r.n} clips · ${r.hours.toFixed(1)} h · ${r.normal_hours.toFixed(1)} h normal footage · ${Math.round(r.avg_ms_per_segment)} ms per 2 s segment` }),
    ]);
  }));
  if (!rows.length) {
    body.append(el('tr', {}, el('td', { colSpan: 13, className: 'muted', textContent: 'No labelled videos with finished runs yet.' })));
    return;
  }
  for (const r of rows) {
    body.append(el('tr', {}, [
      r.model, r.n, r.hours.toFixed(1), fmtPct(r.accuracy), fmtPct(r.precision), fmtPct(r.recall), fmtPct(r.f1),
      fmtPct(r.fpr), r.roc_auc === null ? '–' : r.roc_auc.toFixed(3),
      r.fa_per_hour === null ? '–' : r.fa_per_hour.toFixed(1),
      r.gt_total ? `${r.gt_caught}/${r.gt_total} (${fmtPct(r.gt_caught / r.gt_total)})` : '–',
      Math.round(r.avg_ms_per_segment), `${r.tp} / ${r.fp} / ${r.tn} / ${r.fn}`,
    ].map((c) => el('td', { textContent: String(c) }))));
  }
}

$('eval-threshold').addEventListener('input', (e) => {
  $('eval-threshold-value').textContent = Number(e.target.value).toFixed(2);
  refreshMetrics();
});

// ---------- boot ----------

const { signedIn } = await api('/session');
signedIn ? showApp() : showLogin();
