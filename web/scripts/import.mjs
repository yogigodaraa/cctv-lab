// Bulk-import local videos (e.g. an RWF-2000 subset) into CCTV Lab.
// Each file is transcoded to browser-friendly H.264 MP4 (max 640px wide), uploaded
// to Blob storage and registered in the database with an optional ground-truth label.
//
//   npm run import -- <dir> [--label fight|nonfight|unknown] [--limit N] [--source name]
//                          [--annotations <dir>]
//
// --annotations points at per-frame 0/1 CSVs named like the videos (UBI-Fights format);
// they become ground-truth fight intervals shown under the model timelines.
//
// Check the dataset licence before importing: most violence datasets are
// research-only and must not be shared publicly.

import { execFile } from 'node:child_process';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { put } from '@vercel/blob';
import { sql } from '../lib/db.js';

const run = promisify(execFile);
const VIDEO_EXT = new Set(['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v']);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string', default: 'unknown' },
    limit: { type: 'string' },
    source: { type: 'string', default: 'import' },
    annotations: { type: 'string' },
  },
});
const [dir] = positionals;
if (!dir || !['fight', 'nonfight', 'unknown'].includes(values.label)) {
  console.error('Usage: npm run import -- <dir> [--label fight|nonfight|unknown] [--limit N]');
  process.exit(1);
}

async function probe(path) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', path,
  ]);
  const info = JSON.parse(stdout);
  return {
    duration_s: Number(info.format?.duration) || null,
    width: info.streams?.[0]?.width ?? null,
    height: info.streams?.[0]?.height ?? null,
  };
}

async function sourceFps(path) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', path,
  ]);
  const [num, den] = stdout.trim().split('/').map(Number);
  return den ? num / den : num || 25;
}

// Per-frame 0/1 labels -> merged [{start_s, end_s}] intervals.
async function groundTruth(videoPath, csvPath) {
  const flags = (await readFile(csvPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((l) => Number(l.trim()));
  const fps = await sourceFps(videoPath);
  const out = [];
  let start = null;
  flags.forEach((f, i) => {
    if (f && start === null) start = i;
    if (!f && start !== null) { out.push({ start_s: start / fps, end_s: i / fps }); start = null; }
  });
  if (start !== null) out.push({ start_s: start / fps, end_s: flags.length / fps });
  return out.map((s) => ({ start_s: +s.start_s.toFixed(2), end_s: +s.end_s.toFixed(2) }));
}

const files = (await readdir(dir))
  .filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()))
  .sort()
  .slice(0, values.limit ? Number(values.limit) : undefined);

console.log(`Importing ${files.length} file(s) from ${dir} as "${values.label}"`);
for (const [i, file] of files.entries()) {
  const src = join(dir, file);
  const name = `${basename(file, extname(file))}.mp4`;
  const out = join(tmpdir(), `cctvlab-${Date.now()}-${name}`);
  const [existing] = await sql`SELECT id FROM videos WHERE name = ${name} AND source = ${values.source}`;
  if (existing) {
    console.log(`[${i + 1}/${files.length}] ${file} already imported, skipping`);
    continue;
  }
  try {
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', src,
      '-vf', "scale='min(640,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out,
    ]);
    const meta = await probe(out);
    const gt = values.annotations
      ? await groundTruth(src, join(values.annotations, `${basename(file, extname(file))}.csv`)).catch(() => null)
      : null;
    const { size } = await stat(out);
    const blob = await put(`videos/${name}`, await readFile(out), {
      access: 'public', contentType: 'video/mp4', addRandomSuffix: true,
    });
    await sql`
      INSERT INTO videos (name, url, content_type, size_bytes, duration_s, width, height, label, source, gt_segments)
      VALUES (${name}, ${blob.url}, 'video/mp4', ${size}, ${meta.duration_s}, ${meta.width}, ${meta.height},
              ${values.label}, ${values.source}, ${gt ? JSON.stringify(gt) : null})`;
    console.log(`[${i + 1}/${files.length}] ${file} → ${(size / 1e6).toFixed(1)} MB, ${Math.round(meta.duration_s)} s${gt ? `, ${gt.length} GT fight interval(s)` : ''}`);
  } catch (err) {
    console.error(`[${i + 1}/${files.length}] ${file} failed: ${err.message}`);
  } finally {
    await rm(out, { force: true });
  }
}
console.log('Done.');
