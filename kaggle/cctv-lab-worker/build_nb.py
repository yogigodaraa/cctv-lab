#!/usr/bin/env python3
"""Build notebook.ipynb for the CCTV Lab GPU worker on Kaggle.

The notebook clones the public cctv-lab repo, installs the worker's extra deps
(torch/opencv/Pillow are already on Kaggle) and runs worker/worker.py against the
live site. The worker pulls queued jobs from https://cctv-lab.vercel.app/api/worker,
scores clips on Kaggle's GPU and posts only scores back, so results appear on the
site as each job finishes. Nothing else needs syncing.

A supervisor cell stops the worker when no job has started for IDLE_MIN minutes or
after MAX_HOURS, so a session never burns GPU quota on an empty queue.

Data minimisation: code and clips live under /tmp (Kaggle saves /kaggle/working as
notebook output, /tmp is discarded), the worker keeps at most one clip
(CACHE_MAX=1 evicts the previous clip on each download) and the cache is deleted
when the session ends, whatever the outcome.

Token: Kaggle Secret WORKER_TOKEN if attached; otherwise the private dataset
yogigodara/cctv-lab-worker-token (file worker_token.txt), attached via
kernel-metadata.json. Kaggle has no API for notebook secrets, so the private
dataset lets the notebook be set up and run entirely from the CLI. Same value as
WORKER_TOKEN in cctv-lab's Vercel env / app/web/.env.local.
Never hand-edit notebook.ipynb: edit this file and run `python3 build_nb.py`.
"""
import json

MD = """# CCTV Lab GPU worker

Runs the CCTV Lab model worker on this notebook's GPU. It takes queued jobs from the
live site, scores the clips here and posts the scores back, so results show up on
https://cctv-lab.vercel.app (Compute tab) as each job finishes.

**One-time setup:** Add-ons → Secrets → add `WORKER_TOKEN` and switch it on for this notebook.
Settings: Accelerator = GPU, Internet = On. Then Run All (or Save Version → Save & Run All).

The worker stops by itself after `IDLE_MIN` minutes without a new job, or after `MAX_HOURS`.
Keep this notebook **private**: it downloads research-only footage."""

C1 = r"""
# Settings
API_BASE = "https://cctv-lab.vercel.app"
REPO = "https://github.com/yogigodaraa/cctv-lab.git"
IDLE_MIN = 20     # stop after this many minutes with no new job
MAX_HOURS = 11.5  # Kaggle sessions end at 12 h

import glob, os, subprocess
WORKER_TOKEN, source = None, None
try:
    from kaggle_secrets import UserSecretsClient
    WORKER_TOKEN, source = UserSecretsClient().get_secret("WORKER_TOKEN"), "Kaggle secret"
except Exception:
    pass
if not WORKER_TOKEN:  # fallback: private dataset attached in kernel-metadata.json
    files = glob.glob("/kaggle/input/**/worker_token.txt", recursive=True)
    if files:
        WORKER_TOKEN, source = open(files[0]).read().strip(), "private dataset"
if not WORKER_TOKEN:
    raise RuntimeError("No WORKER_TOKEN: add it under Add-ons > Secrets, or attach the private dataset cctv-lab-worker-token.")
print(f"WORKER_TOKEN loaded from {source} (hidden).")
gpu = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
print("GPU:", gpu or "none (turn on Accelerator = GPU)")
""".strip()

C2 = r"""
# Get the worker code and the extra Python packages
import subprocess, sys
# Code and clips go under /tmp: Kaggle keeps /kaggle/working as notebook output, /tmp is discarded.
CODE, CACHE = "/tmp/cctv-lab", "/tmp/cctv-clip-cache"
subprocess.run(["rm", "-rf", CODE, CACHE], check=True)
subprocess.run(["git", "clone", "--depth", "1", REPO, CODE], check=True)
print(subprocess.run(["git", "-C", CODE, "log", "--oneline", "-1"], capture_output=True, text=True).stdout)
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", f"{CODE}/worker/requirements.txt"], check=True)
import torch
print("torch", torch.__version__, "| CUDA:", torch.cuda.is_available())
""".strip()

C3 = r"""
# Run the worker until the queue stays empty (IDLE_MIN) or MAX_HOURS is reached
import os, subprocess, sys, time, threading, queue
worker_id = "kaggle-" + ((gpu.splitlines()[0].split(",")[0].replace("Tesla ", "").replace(" ", "-")) if gpu else "cpu")
# CACHE_MAX=1: the worker evicts the previous clip on every download, so at most one clip is on disk.
env = {**os.environ, "API_BASE": API_BASE, "WORKER_TOKEN": WORKER_TOKEN, "WORKER_ID": worker_id,
       "CACHE_DIR": CACHE, "CACHE_MAX": "1", "TOKENIZERS_PARALLELISM": "false"}
proc = subprocess.Popen([sys.executable, "-u", "worker.py"], cwd=f"{CODE}/worker",
                        env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
lines = queue.Queue()
threading.Thread(target=lambda: [lines.put(l) for l in proc.stdout], daemon=True).start()

start = last_job = time.time()
done = failed = 0
try:
    while proc.poll() is None:
        try:
            line = lines.get(timeout=30).rstrip()
        except queue.Empty:
            line = None
        if line:
            if "HTTP Request" not in line and "Loading weights" not in line:
                print(line, flush=True)
            if ": " in line and " on '" in line:
                last_job = time.time()          # a job started
            if " done: " in line:
                done += 1; last_job = time.time()
            if " failed: " in line:
                failed += 1; last_job = time.time()
        if (time.time() - last_job) / 60 > IDLE_MIN:
            print(f"No new job for {IDLE_MIN} min: stopping."); break
        if (time.time() - start) / 3600 > MAX_HOURS:
            print(f"Reached {MAX_HOURS} h: stopping."); break
finally:
    if proc.poll() is None:
        proc.terminate()
        try: proc.wait(timeout=30)
        except subprocess.TimeoutExpired: proc.kill()
    subprocess.run(["rm", "-rf", CACHE])   # no footage left behind, whatever happened
    print("Clip cache deleted.")
print(f"Finished: {done} runs done, {failed} failed, {(time.time() - start) / 60:.0f} min. Results are already on the site.")
""".strip()


def cell(src, kind="code"):
    c = {"cell_type": kind, "metadata": {}, "source": src.splitlines(keepends=True)}
    if kind == "code":
        c.update(outputs=[], execution_count=None)
    return c


nb = {
    "cells": [cell(MD, "markdown"), cell(C1), cell(C2), cell(C3)],
    "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                 "language_info": {"name": "python"}},
    "nbformat": 4, "nbformat_minor": 5,
}
with open("notebook.ipynb", "w") as f:
    json.dump(nb, f, indent=1)
print("wrote notebook.ipynb")
