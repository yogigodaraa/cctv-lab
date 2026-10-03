import { upload } from 'https://esm.sh/@vercel/blob@2.8.0/client';

const $ = (id) => document.getElementById(id);

const state = {
  videos: [],
  models: [],
  selectedId: null,
  runs: [], // runs (with segments) for the selected video
  threshold: 0.5,
  pollTimer: null,
};

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
const fmtPct = (v) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(1)}%`);
const scoreColor = (s) => `hsl(${Math.round(120 * (1 - s))} 70% 45%)`;
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
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
  }
}

// ---------- videos ----------

async function refreshVideos() {
  state.videos = await api('/videos');
  renderTiles();
  if (!state.selectedId && state.videos.length) selectVideo(state.videos[0].id);
}

function renderTiles() {
  const tiles = $('tiles');
  tiles.replaceChildren();
  $('empty-wall').classList.toggle('hidden', state.videos.length > 0);
  state.videos.forEach((v, i) => {
    const scores = Object.entries(v.latest ?? {});
    const flagged = scores.some(([, r]) => r.max_score !== null && r.max_score >= state.threshold);
    const chips = el('div', { className: 'chips' }, [
      el('span', { className: `chip ${v.label}`, textContent: v.label }),
      ...scores.map(([model, r]) =>
        el('span', {
          className: `chip ${r.max_score >= state.threshold ? 'hot' : ''}`,
          textContent: r.status === 'done' ? `${model} ${r.max_score?.toFixed(2) ?? '–'}` : `${model} ${r.status}`,
        })),
    ]);
    const thumb = el('video', { src: `${v.url}#t=0.5`, muted: true, preload: 'metadata', playsInline: true });
    const tile = el('button', {
      className: `tile ${v.id === state.selectedId ? 'active' : ''} ${flagged ? 'flagged' : ''}`,
      onclick: () => selectVideo(v.id),
    }, [thumb, el('div', { className: 'tile-body' }, [
      el('div', { className: 'tile-name', textContent: `CAM-${String(i + 1).padStart(2, '0')} · ${v.name}` }),
      chips,
    ])]);
    tiles.append(tile);
  });
}

const selectedVideo = () => state.videos.find((v) => v.id === state.selectedId);

async function selectVideo(id) {
  state.selectedId = id;
  const v = selectedVideo();
  const idx = state.videos.indexOf(v);
  $('player').src = v.url;
  $('cam-name').textContent = `CAM-${String(idx + 1).padStart(2, '0')} · ${v.name}`;
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
}

function renderEvents() {
  const list = $('events');
  list.replaceChildren();
  const events = state.runs
    .filter((r) => r.status === 'done')
    .flatMap((r) => r.segments.map((s) => ({ ...s, model: r.model })))
    .filter((s) => s.fight_score >= state.threshold)
    .sort((a, b) => a.start_s - b.start_s);

  for (const ev of events) {
    list.append(el('button', { className: 'event', onclick: () => { $('player').currentTime = ev.start_s; $('player').play(); } }, [
      el('div', { className: 'event-head' }, [
        el('span', { textContent: `${fmtTime(ev.start_s)} · ${ev.model}` }),
        el('b', { textContent: ev.fight_score.toFixed(2), style: `color:${scoreColor(ev.fight_score)}` }),
      ]),
      el('div', { className: 'event-caption', textContent: ev.caption ?? ev.top_label ?? '' }),
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

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  $('tab-monitor').classList.toggle('hidden', tab.dataset.tab !== 'monitor');
  $('tab-eval').classList.toggle('hidden', tab.dataset.tab !== 'eval');
  if (tab.dataset.tab === 'eval') refreshMetrics();
}));

async function refreshMetrics() {
  const t = Number($('eval-threshold').value);
  const rows = await api(`/metrics?threshold=${t}`);
  const body = $('metrics-body');
  body.replaceChildren();
  if (!rows.length) {
    body.append(el('tr', {}, el('td', { colSpan: 10, className: 'muted', textContent: 'No labelled videos with finished runs yet.' })));
    return;
  }
  for (const r of rows) {
    body.append(el('tr', {}, [
      r.model, r.n, fmtPct(r.accuracy), fmtPct(r.precision), fmtPct(r.recall), fmtPct(r.f1),
      fmtPct(r.fpr), r.roc_auc === null ? '–' : r.roc_auc.toFixed(3),
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
