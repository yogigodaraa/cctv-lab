"""Mac-side worker: pulls queued analysis jobs from the CCTV Lab API, runs the
models locally (Apple GPU via MPS), and posts scores back.

Video is downloaded to a temp file, analysed in memory, and deleted straight
after. No frames are ever uploaded or stored.

Usage:
    API_BASE=https://<your-app-url> WORKER_TOKEN=... python worker.py
"""

from __future__ import annotations

import json
import logging
import os
import platform
import socket
import ssl
import tempfile
import time
import traceback
import urllib.error
import urllib.request
from dataclasses import asdict

import certifi

from models.base import Detector, pick_device
from models.smolvlm import SmolVLMDetector
from models.xclip import XClipDetector
from video import iter_windows

log = logging.getLogger("worker")

API_BASE = os.environ.get("API_BASE", "http://localhost:3000").rstrip("/")
WORKER_TOKEN = os.environ["WORKER_TOKEN"]
WORKER_ID = os.environ.get("WORKER_ID", f"{socket.gethostname()}-{platform.machine()}")
POLL_S = float(os.environ.get("POLL_S", "3"))
HEARTBEAT_S = 15.0
# python.org builds of Python on macOS ship without system CA certificates.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

DETECTORS: dict[str, Detector] = {d.name: d for d in (XClipDetector(), SmolVLMDetector())}


def call(path: str, body: dict | None = None) -> dict | None:
    req = urllib.request.Request(
        f"{API_BASE}/api/worker{path}",
        data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {WORKER_TOKEN}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as res:
        if res.status == 204:
            return None
        return json.loads(res.read() or b"null")


def heartbeat() -> None:
    call(
        "/heartbeat",
        {
            "worker_id": WORKER_ID,
            "device": f"{platform.node()} · {pick_device()}",
            "models": [{"name": d.name, "description": d.description} for d in DETECTORS.values()],
        },
    )


def download(url: str) -> str:
    fd, path = tempfile.mkstemp(suffix=os.path.splitext(url.split("?")[0])[1] or ".mp4")
    with os.fdopen(fd, "wb") as out, urllib.request.urlopen(url, timeout=120, context=SSL_CONTEXT) as res:
        while chunk := res.read(1 << 20):
            out.write(chunk)
    return path


def process(job: dict) -> None:
    run, video = job["run"], job["video"]
    detector = DETECTORS[run["model"]]
    log.info("Run %s: %s on '%s'", run["id"], detector.name, video["name"])
    path = download(video["url"])
    try:
        t0 = time.perf_counter()
        detector.load()
        load_ms = (time.perf_counter() - t0) * 1000

        segments, infer_ms = [], 0.0
        for window in iter_windows(path, detector.window_s, detector.stride_s, detector.frames_per_window):
            t = time.perf_counter()
            segments.append(asdict(detector.score(window)))
            infer_ms += (time.perf_counter() - t) * 1000

        timing = {
            "load_ms": round(load_ms, 1),
            "inference_ms": round(infer_ms, 1),
            "ms_per_segment": round(infer_ms / max(len(segments), 1), 1),
            "segments": len(segments),
        }
        call(f"/runs/{run['id']}/complete", {"segments": segments, "timing": timing, "device": str(pick_device())})
        top = max((s["fight_score"] for s in segments), default=0.0)
        log.info("Run %s done: %d segments, max score %.2f, %.0f ms/segment", run["id"], len(segments), top, timing["ms_per_segment"])
    finally:
        os.remove(path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("Worker %s → %s (device: %s)", WORKER_ID, API_BASE, pick_device())
    last_beat = 0.0
    while True:
        try:
            if time.monotonic() - last_beat > HEARTBEAT_S:
                heartbeat()
                last_beat = time.monotonic()
            job = call("/claim", {"worker_id": WORKER_ID, "models": list(DETECTORS)})
            if job is None:
                time.sleep(POLL_S)
                continue
            try:
                process(job)
            except Exception as exc:  # report and keep serving other jobs
                log.error("Run %s failed: %s", job["run"]["id"], exc)
                call(f"/runs/{job['run']['id']}/fail", {"error": f"{type(exc).__name__}: {exc}"})
                traceback.print_exc()
        except (urllib.error.URLError, TimeoutError) as exc:
            log.warning("API unreachable (%s); retrying in 10 s", exc)
            time.sleep(10)
        except KeyboardInterrupt:
            log.info("Stopped.")
            return


if __name__ == "__main__":
    main()
