"""Video decoding and temporal windowing.

Frames are only held in memory for the duration of one inference call and are
never written to disk (privacy by design).
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class VideoInfo:
    fps: float
    frame_count: int
    width: int
    height: int

    @property
    def duration_s(self) -> float:
        return self.frame_count / self.fps if self.fps > 0 else 0.0


@dataclass(frozen=True)
class Window:
    start_s: float
    end_s: float
    frames: list[np.ndarray]  # RGB uint8, HxWx3


def probe(path: str) -> VideoInfo:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {path}")
    try:
        return VideoInfo(
            fps=float(cap.get(cv2.CAP_PROP_FPS)) or 25.0,
            frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
    finally:
        cap.release()


def _read_frames(cap: cv2.VideoCapture, indices: list[int]) -> list[np.ndarray]:
    frames: list[np.ndarray] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, bgr = cap.read()
        if not ok:
            continue
        frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    return frames


def iter_windows(
    path: str, window_s: float, stride_s: float, frames_per_window: int
) -> Iterator[Window]:
    """Yield fixed-length windows with `frames_per_window` uniformly sampled frames."""
    info = probe(path)
    duration = info.duration_s
    if duration <= 0:
        return
    window_s = min(window_s, duration)
    cap = cv2.VideoCapture(path)
    try:
        start = 0.0
        while start < duration - 1e-6:
            end = min(start + window_s, duration)
            times = np.linspace(start, end, frames_per_window, endpoint=False)
            indices = [min(int(t * info.fps), info.frame_count - 1) for t in times]
            frames = _read_frames(cap, indices)
            if frames:
                # Pad by repeating the last frame if decoding dropped any.
                while len(frames) < frames_per_window:
                    frames.append(frames[-1])
                yield Window(start_s=round(start, 3), end_s=round(end, 3), frames=frames)
            if end >= duration:
                break
            start += stride_s
    finally:
        cap.release()
