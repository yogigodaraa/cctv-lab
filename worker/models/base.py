from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import torch

from video import Window


@dataclass
class SegmentResult:
    start_s: float
    end_s: float
    fight_score: float  # 0..1, higher = more likely violent
    top_label: str
    details: dict[str, float] = field(default_factory=dict)
    caption: str | None = None


class Detector(Protocol):
    """A model that scores one temporal window of video."""

    name: str
    description: str
    window_s: float
    stride_s: float
    frames_per_window: int

    def load(self) -> None: ...

    def score(self, window: Window) -> SegmentResult: ...


def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")
