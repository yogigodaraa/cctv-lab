"""Zero-shot video classification with X-CLIP.

Research note: X-CLIP matches an 8-frame clip against free-text prompts. We
include look-alike *non-violent* prompts (hugging, dancing, sport) on purpose,
so the score reflects "fight vs things that look like a fight" rather than
"fight vs nothing". This is a zero-shot baseline; it has not been trained on
any violence dataset.
"""

from __future__ import annotations

import torch
from transformers import AutoProcessor, XCLIPModel

from models.base import SegmentResult, pick_device
from video import Window

MODEL_ID = "microsoft/xclip-base-patch32"

VIOLENT_PROMPTS = [
    "people fighting",
    "a person punching another person",
    "a person kicking another person",
    "a violent brawl in the street",
]
NON_VIOLENT_PROMPTS = [
    "people hugging",
    "people dancing",
    "people playing sport",
    "people walking",
    "people talking",
    "an empty scene",
]


class XClipDetector:
    name = "xclip"
    description = "X-CLIP zero-shot (fight vs hugging/dancing/sport prompts)"
    window_s = 2.0
    stride_s = 2.0
    frames_per_window = 8  # fixed by the patch32 checkpoint

    def __init__(self) -> None:
        self._model: XCLIPModel | None = None
        self._processor = None
        self._device = pick_device()
        self._prompts = VIOLENT_PROMPTS + NON_VIOLENT_PROMPTS

    def load(self) -> None:
        if self._model is not None:
            return
        self._processor = AutoProcessor.from_pretrained(MODEL_ID)
        self._model = XCLIPModel.from_pretrained(MODEL_ID).to(self._device).eval()

    @torch.inference_mode()
    def score(self, window: Window) -> SegmentResult:
        self.load()
        assert self._model is not None and self._processor is not None
        inputs = self._processor(
            text=self._prompts, videos=list(window.frames), return_tensors="pt", padding=True
        ).to(self._device)
        probs = self._model(**inputs).logits_per_video.softmax(dim=-1)[0].float().cpu()
        details = {p: round(float(v), 4) for p, v in zip(self._prompts, probs)}
        fight = float(probs[: len(VIOLENT_PROMPTS)].sum())
        top = max(details, key=details.__getitem__)
        return SegmentResult(
            start_s=window.start_s,
            end_s=window.end_s,
            fight_score=round(fight, 4),
            top_label=top,
            details=details,
        )
