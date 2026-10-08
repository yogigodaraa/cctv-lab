"""Train a light fight classifier on frozen X-CLIP video features (a "linear probe").

Research note: X-CLIP stays frozen; only a logistic-regression head is trained,
on 2 s segments labelled from UBI-Fights' frame-level annotations (a segment is
"fight" if at least half its frames are). Evaluation is 5-fold cross-validation
grouped by video: every video's scores come from a model that never saw that
video, so per-video results are honest held-out results.

Usage:
    python train_probe.py <UBI_FIGHTS dir> <out.json>

Writes per-video out-of-fold segment scores plus a training summary; the web
side loads them with `npm run load-probe -- <out.json>`.
"""

from __future__ import annotations

import json
import os
import sys
import time

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from transformers import AutoProcessor, XCLIPModel

from models.base import pick_device
from models.xclip import MODEL_ID
from video import iter_windows, probe

WINDOW_S = STRIDE_S = 2.0
FRAMES = 8
BATCH = 8
FOLDS = 5


def frame_labels(csv_path: str) -> np.ndarray:
    with open(csv_path) as f:
        return np.array([int(float(x)) for x in f.read().split()], dtype=np.int8)


@torch.inference_mode()
def embed_video(path: str, model, processor, device) -> tuple[np.ndarray, list[tuple[float, float]]]:
    feats, spans, batch = [], [], []

    def flush():
        inputs = processor(videos=[w.frames for w in batch], return_tensors="pt").to(device)
        f = model.get_video_features(pixel_values=inputs["pixel_values"])
        f = getattr(f, "pooler_output", f)  # newer transformers return an output object
        feats.append(torch.nn.functional.normalize(f.float(), dim=-1).cpu().numpy())
        spans.extend((w.start_s, w.end_s) for w in batch)
        batch.clear()

    for w in iter_windows(path, WINDOW_S, STRIDE_S, FRAMES):
        batch.append(w)
        if len(batch) == BATCH:
            flush()
    if batch:
        flush()
    return np.concatenate(feats), spans


def main() -> None:
    root, out_path = sys.argv[1], sys.argv[2]
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(out_path)), "probe-cache")
    os.makedirs(cache_dir, exist_ok=True)
    device = pick_device()
    model = processor = None

    videos = []
    for cls in ("fight", "normal"):
        vdir = os.path.join(root, "videos", cls)
        for name in sorted(os.listdir(vdir)):
            if name.endswith(".mp4"):
                videos.append((name, os.path.join(vdir, name), "fight" if cls == "fight" else "nonfight"))

    X, y, groups, meta = [], [], [], []
    t0 = time.perf_counter()
    for i, (name, path, label) in enumerate(videos):
        cache = os.path.join(cache_dir, name + ".npz")
        if os.path.exists(cache):
            d = np.load(cache)
            feats, spans = d["feats"], [tuple(s) for s in d["spans"]]
        else:
            if model is None:
                processor = AutoProcessor.from_pretrained(MODEL_ID)
                model = XCLIPModel.from_pretrained(MODEL_ID).to(device).eval()
            feats, spans = embed_video(path, model, processor, device)
            np.savez(cache, feats=feats, spans=np.array(spans))
        fps = probe(path).fps
        flags = frame_labels(os.path.join(root, "annotation", name.replace(".mp4", ".csv")))
        seg_y = []
        for s, e in spans:
            a, b = int(s * fps), max(int(e * fps), int(s * fps) + 1)
            seg_y.append(int(flags[a:b].mean() >= 0.5) if a < len(flags) else 0)
        X.append(feats)
        y.extend(seg_y)
        groups.extend([i] * len(spans))
        meta.append({"name": name, "label": label, "spans": spans, "n": len(spans)})
        print(f"[{i + 1}/{len(videos)}] {name}: {len(spans)} segments, {sum(seg_y)} fight", flush=True)
    embed_s = time.perf_counter() - t0

    X = np.concatenate(X)
    y = np.array(y)
    groups = np.array(groups)
    video_label = np.array([1 if meta[g]["label"] == "fight" else 0 for g in groups])

    oof = np.zeros(len(y))
    fold_of_video = {}
    cv = StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=0)
    for k, (tr, te) in enumerate(cv.split(X, video_label, groups)):
        clf = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, class_weight="balanced", max_iter=2000))
        clf.fit(X[tr], y[tr])
        oof[te] = clf.predict_proba(X[te])[:, 1]
        for g in np.unique(groups[te]):
            fold_of_video[int(g)] = {
                "fold": k + 1,
                "train_videos": int(len(np.unique(groups[tr]))),
                "train_segments": int(len(tr)),
                "train_fight_segments": int(y[tr].sum()),
            }

    summary = {
        "model": "xclip-probe",
        "backbone": MODEL_ID + " (frozen)",
        "head": "standardise + logistic regression (C=0.5, class-balanced)",
        "data": "UBI-Fights subset, segment labels from frame-level annotations (>= 50% fight frames)",
        "videos": len(videos),
        "segments": int(len(y)),
        "fight_segments": int(y.sum()),
        "folds": FOLDS,
        "split": "StratifiedGroupKFold by video (no video in both train and test)",
        "segment_roc_auc": round(float(roc_auc_score(y, oof)), 4),
        "segment_avg_precision": round(float(average_precision_score(y, oof)), 4),
        "embed_seconds": round(embed_s, 1),
        "trained_at": time.strftime("%Y-%m-%d %H:%M"),
    }
    out = {"summary": summary, "videos": []}
    offset = 0
    for i, m in enumerate(meta):
        scores = oof[offset : offset + m["n"]]
        out["videos"].append({
            "name": m["name"],
            **fold_of_video[i],
            "segments": [
                {"start_s": round(s, 3), "end_s": round(e, 3), "fight_score": round(float(p), 4)}
                for (s, e), p in zip(m["spans"], scores)
            ],
        })
        offset += m["n"]
    with open(out_path, "w") as f:
        json.dump(out, f)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
