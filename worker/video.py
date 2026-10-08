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


def iter_windows(
    path: str, window_s: float, stride_s: float, frames_per_window: int
) -> Iterator[Window]:
    """Yield fixed-length windows with `frames_per_window` uniformly sampled frames.

    Decodes in a single forward pass and keeps only the sampled frames. Seeking to
    each sampled frame instead re-decodes from the previous keyframe every time,
    which was ~20x slower on long CCTV videos.
    """
    info = probe(path)
    duration = info.duration_s
    if duration <= 0:
        return
    window_s = min(window_s, duration)
    spans: list[tuple[float, float]] = []
    start = 0.0
    while start < duration - 1e-6:
        end = min(start + window_s, duration)
        spans.append((round(start, 3), round(end, 3)))
        if end >= duration:
            break
        start += stride_s
    wanted: dict[int, list[int]] = {}  # frame index -> windows that sample it
    last_frame: list[int] = []  # per window, its last sampled frame index
    for w, (s, e) in enumerate(spans):
        idxs = [min(int(t * info.fps), info.frame_count - 1) for t in np.linspace(s, e, frames_per_window, endpoint=False)]
        for i in idxs:
            wanted.setdefault(i, []).append(w)
        last_frame.append(max(idxs))

    frames: list[list[np.ndarray]] = [[] for _ in spans]
    next_w = 0

    def emit(w: int) -> Window | None:
        fs = frames[w]
        frames[w] = []
        if not fs:
            return None
        # Pad by repeating the last frame if decoding dropped any.
        fs += [fs[-1]] * (frames_per_window - len(fs))
        return Window(start_s=spans[w][0], end_s=spans[w][1], frames=fs[:frames_per_window])

    cap = cv2.VideoCapture(path)
    try:
        idx, last = 0, max(wanted, default=-1)
        while idx <= last and cap.grab():
            if idx in wanted:
                ok, bgr = cap.retrieve()
                if ok:
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    for w in wanted[idx]:
                        frames[w].append(rgb)
            # A window is complete once its last sampled frame is behind us.
            while next_w < len(spans) and last_frame[next_w] <= idx:
                if (win := emit(next_w)) is not None:
                    yield win
                next_w += 1
            idx += 1
    finally:
        cap.release()
    for w in range(next_w, len(spans)):
        if (win := emit(w)) is not None:
            yield win
