# CCTV Lab

[![CI](https://github.com/yogigodaraa/cctv-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/yogigodaraa/cctv-lab/actions/workflows/ci.yml)

> **Research use only.** Read the [ethics and privacy statement](ETHICS.md) before using this with any footage.

**Live demo (passcode-protected):** <https://cctv-lab.vercel.app>

A CCTV-style test bench for **privacy-preserving fight detection** research. Upload clips from any device (iPad included), queue them for analysis, and compare models on an operator-style monitor with alert timelines and false-positive metrics.

Part of a research project on real-time violence detection for existing CCTV, with privacy by design: **no face recognition, no identification, and a human always in the loop.**

## How it works

```
 iPad / browser ──► web/ (serverless)             worker/ (local GPU machine)
                    ├─ static UI (public/)         ├─ polls /api/worker/claim
                    ├─ Express API (api/, lib/)    ├─ downloads clip → temp file
                    ├─ Postgres: scores            ├─ runs models (Apple MPS / CUDA / CPU)
                    └─ Blob storage: video files   └─ posts scores, deletes clip
```

Serverless functions can't run PyTorch models (no GPU, small size limits), so inference runs on a local machine that pulls jobs from the hosted queue. Only scores, labels and short captions are stored; frames never leave the worker.

## Models (zero-shot baselines)

| Name | What it does |
|------|--------------|
| `xclip` | [X-CLIP](https://huggingface.co/microsoft/xclip-base-patch32) matches 8-frame clips against text prompts. Look-alike prompts (hugging, dancing, sport) are included on purpose, so the score means "fight vs things that look like a fight". |
| `smolvlm` | [SmolVLM-256M](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct) answers a yes/no "is anyone fighting?" question. The **probability** of "Yes" is the score, and a one-line caption explains each alert. |

Neither model has been trained on violence data yet. These are baselines to beat.

## Views

- **Camera wall**: 2×2 / 3×3 / 4×4 grid of looping feeds. Model scores replay in sync and a feed turns red when it is at or above the threshold. Fight and normal feeds are interleaved.
- **Investigate**: one clip with a ground-truth track (frame-level annotations, when available) under each model's score timeline, merged alert events marked ✓ (overlaps an annotated fight) or ✗ (false alarm), and a footage library.
- **Evaluation**: video-level accuracy, precision, recall, F1, FPR and ROC-AUC, plus operator-level **false alarms per hour** on normal footage and **fights caught** (annotated fight intervals with at least one overlapping alert).

## Data

Currently loaded: a UBI-Fights subset (long, frame-annotated CCTV footage; see `../data/ubi-fights/README.md`). The earlier 2 s SCF clips were removed on 2026-10-08; their scores are in `../experiments/2026-10-03-scf-runs-backup.json`.

## Setup

### Web
Needs a Postgres database and a Blob store. Copy `web/.env.example` to `web/.env.local` and fill it in.
```bash
cd web
npm install
npm run migrate   # create tables
npm run dev       # http://localhost:3000
```
Deploy `web/` as the project root on a serverless Node host; `api/index.js` is the function entry point.

### Worker (Mac)
```bash
cd worker
python3 -m venv --system-site-packages .venv && source .venv/bin/activate
pip install -r requirements.txt
API_BASE=https://<your-app-url> WORKER_TOKEN=<token> python worker.py
```
The first run downloads model weights (~0.8 GB for X-CLIP, ~0.5 GB for SmolVLM).

### Bulk import (e.g. a labelled dataset subset)
```bash
cd web
npm run import -- /path/to/RWF-2000/val/Fight --label fight --limit 50
npm run import -- /path/to/RWF-2000/val/NonFight --label nonfight --limit 50
# with frame-level annotations (UBI-Fights CSV format)
npm run import -- ../../data/ubi-fights/UBI_FIGHTS/videos/fight --label fight --source ubi-fights \
  --annotations ../../data/ubi-fights/UBI_FIGHTS/annotation
```
Check dataset licences first. Most violence datasets are research-only.

## Privacy notes

See [ETHICS.md](ETHICS.md) for intended use, out-of-scope uses and dataset guidance.

- The app is behind a passcode. Blob video URLs are unguessable but public, so only upload footage you're allowed to store.
- The "Privacy blur" toggle blurs the operator view; the models still see full frames.
- Planned: pose/skeleton-only view, private Blob storage, data-retention limits.

## License

<!-- TODO(yogi): choose a licence. Consider a responsible-use licence (e.g. OpenRAIL) for a surveillance-adjacent research project. Until then, all rights reserved. -->
No licence has been chosen yet, so all rights are reserved by default.
