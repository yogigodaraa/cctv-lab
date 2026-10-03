"""Run every detector once on a local clip: python smoke_test.py <video>"""

import sys
import time
from dataclasses import asdict

from worker import DETECTORS
from video import iter_windows

path = sys.argv[1]
for name, det in DETECTORS.items():
    t0 = time.perf_counter()
    det.load()
    print(f"[{name}] loaded in {time.perf_counter() - t0:.1f}s")
    for w in iter_windows(path, det.window_s, det.stride_s, det.frames_per_window):
        t = time.perf_counter()
        r = asdict(det.score(w))
        print(f"  {r['start_s']:.1f}-{r['end_s']:.1f}s score={r['fight_score']:.3f} top={r['top_label']!r} "
              f"caption={r['caption']!r} ({(time.perf_counter() - t) * 1000:.0f} ms)")
