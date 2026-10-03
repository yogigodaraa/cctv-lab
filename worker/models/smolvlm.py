"""Small vision-language model (SmolVLM-256M) as a fight detector.

Research note: instead of parsing free text, we read the model's probability of
answering "Yes" vs "No" to a yes/no question. That gives a continuous score we
can threshold and compare against other models. An optional short caption makes
alerts explainable to an operator. Zero-shot; not trained on violence data.
"""

from __future__ import annotations

import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

from models.base import SegmentResult, pick_device
from video import Window

MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct"

QUESTION = (
    "Look at this CCTV frame. Is anyone fighting, hitting, kicking or physically "
    "attacking another person? Hugging, dancing and sport are not fighting. "
    "Answer only Yes or No."
)
CAPTION_PROMPT = "In one short sentence, describe what the people are doing. Do not describe faces."


class SmolVLMDetector:
    name = "smolvlm"
    description = "SmolVLM-256M yes/no probability + short caption"
    window_s = 2.0
    stride_s = 2.0
    frames_per_window = 2  # score the frames at 0% and 50% of each window, keep the max

    def __init__(self, caption: bool = True) -> None:
        self._model = None
        self._processor = None
        self._device = pick_device()
        self._caption = caption
        self._yes_ids: list[int] = []
        self._no_ids: list[int] = []

    def load(self) -> None:
        if self._model is not None:
            return
        # One 512px tile per frame instead of the default multi-tile split: much faster,
        # and CCTV frames are low resolution anyway.
        self._processor = AutoProcessor.from_pretrained(
            MODEL_ID, do_image_splitting=False, size={"longest_edge": 512}
        )
        self._model = (
            AutoModelForImageTextToText.from_pretrained(MODEL_ID, dtype=torch.float32)
            .to(self._device)
            .eval()
        )
        tok = self._processor.tokenizer
        self._yes_ids = sorted({tok.encode(w, add_special_tokens=False)[0] for w in ("Yes", " Yes")})
        self._no_ids = sorted({tok.encode(w, add_special_tokens=False)[0] for w in ("No", " No")})

    def _inputs(self, image: Image.Image, prompt: str):
        messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}]
        text = self._processor.apply_chat_template(messages, add_generation_prompt=True)
        return self._processor(text=text, images=[image], return_tensors="pt").to(self._device)

    @torch.inference_mode()
    def _p_yes(self, image: Image.Image) -> float:
        logits = self._model(**self._inputs(image, QUESTION)).logits[0, -1].float()
        probs = logits.softmax(dim=-1)
        yes = float(probs[self._yes_ids].sum())
        no = float(probs[self._no_ids].sum())
        return yes / (yes + no) if yes + no > 0 else 0.0

    @torch.inference_mode()
    def _describe(self, image: Image.Image) -> str:
        inputs = self._inputs(image, CAPTION_PROMPT)
        out = self._model.generate(**inputs, max_new_tokens=32, do_sample=False)
        new_tokens = out[0, inputs["input_ids"].shape[1] :]
        return self._processor.decode(new_tokens, skip_special_tokens=True).strip()

    def score(self, window: Window) -> SegmentResult:
        self.load()
        images = [Image.fromarray(f) for f in window.frames]
        scores = [self._p_yes(img) for img in images]
        best = max(range(len(scores)), key=scores.__getitem__)
        fight = scores[best]
        caption = self._describe(images[best]) if self._caption else None
        return SegmentResult(
            start_s=window.start_s,
            end_s=window.end_s,
            fight_score=round(fight, 4),
            top_label="fighting" if fight >= 0.5 else "not fighting",
            details={f"frame_{i}_p_yes": round(s, 4) for i, s in enumerate(scores)},
            caption=caption,
        )
