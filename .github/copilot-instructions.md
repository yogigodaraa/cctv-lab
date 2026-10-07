# Copilot instructions for CCTV Lab

- **Purpose:** research test bench for privacy-preserving fight detection. Read `ETHICS.md` first.
- **web/:** Node ESM, Express API (`lib/app.js`), Neon Postgres (`lib/db.js`), Vercel Blob, passcode auth (`lib/auth.js`). `npm ci`, `npm run migrate`, `npm run dev`.
- **worker/:** Python 3.10+, Transformers models (`models/xclip.py`, `models/smolvlm.py`), frame windows in `video.py`, job loop in `worker.py`. Torch/OpenCV come from system site-packages. `ruff check .`; `python smoke_test.py <clip>` locally.
- **Hard rules (privacy by design):**
  - No face recognition, re-identification or biometric features. Don't suggest adding them.
  - The worker must delete clips after scoring and must never upload frames, only scores, labels and captions.
  - Never commit video files, `.env*`, or dataset contents.
- **When reviewing PRs:** flag any new storage of raw video or frames, any identity-related feature, and any automatic action taken on a score.
