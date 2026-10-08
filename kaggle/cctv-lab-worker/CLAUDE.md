# CLAUDE.md — CCTV Lab GPU worker on Kaggle

## What this is
A private Kaggle notebook that runs the CCTV Lab model worker
(`github.com/yogigodaraa/cctv-lab`, folder `worker/`) on Kaggle's free GPU instead of
the MacBook. The worker polls the live site's queue (`https://cctv-lab.vercel.app/api/worker/*`),
scores clips on the GPU and posts scores back. Results appear on the site as soon as each
job finishes: there is nothing to download or sync.

Research project context: `~/Downloads/Projects/Research` (README, docs/scope.md).

Location: the source lives in the cctv-lab repo at `kaggle/cctv-lab-worker/` (so it is
versioned and reviewable); `~/Downloads/Projects/kaggle/cctv-lab-worker` is a symlink to it.

## Conventions (same as the other Kaggle projects here)
- Source of truth is `build_nb.py`. Edit it, run `python3 build_nb.py` to regenerate
  `notebook.ipynb`. **Never hand-edit the notebook.**
- Kernel id: `yogigodara/cctv-lab-worker` (private, GPU on, internet on).
- The notebook clones `main` of the public repo at run time, so worker code changes go
  through a cctv-lab PR, not here.

## Token
Default: private dataset `yogigodara/cctv-lab-worker-token` (file `worker_token.txt`), attached in
`kernel-metadata.json`; verified not publicly accessible. Optional override: a Kaggle Secret
`WORKER_TOKEN` (notebook > Add-ons > Secrets), used first when present (secrets cannot be set from
the CLI). Same value as `WORKER_TOKEN` in the cctv-lab Vercel env (`app/web/.env.local`). Never
put it in the notebook or in git.

## Commands
```bash
export KAGGLE_API_TOKEN="$(grep '^KAGGLE_API_TOKEN=' ~/Downloads/Projects/kaggle/agent_security/.env | cut -d= -f2- | tr -d '\"'"'"'[:space:]')"
python3 build_nb.py
python3 -m kaggle kernels push -p .                        # new version (also starts a run)
python3 -m kaggle kernels status yogigodara/cctv-lab-worker
python3 -m kaggle kernels output yogigodara/cctv-lab-worker -p /tmp/cctv-worker-out   # logs
```

## Behaviour
- Data minimisation: code and clips under /tmp (not saved as notebook output), at most one
  clip on disk (`CACHE_MAX=1`), cache deleted when the session ends.
- Stops after `IDLE_MIN` (20) minutes with no new job, or `MAX_HOURS` (11.5).
- Queue jobs from the site (Upload, "Run" buttons, "Run all videos"), then start this notebook.
- A run without the secret stops at cell 1 with instructions (costs seconds of GPU).
