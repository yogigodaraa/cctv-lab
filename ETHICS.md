# Ethics and privacy statement

CCTV Lab is a **research test bench** for detecting physical fights in CCTV-style video. Detecting
violence is useful for safety, but the same technology can be used for intrusive surveillance. This
document sets out how the project is meant to be used, and how it isn't.

## Intended use

- Comparing detection models on **labelled research datasets** or footage you are legally allowed
  to store and process.
- Measuring **false positives** as carefully as true positives. A false alarm can send security staff
  or police towards people who did nothing wrong.
- Studying **privacy-preserving** designs: no identity, minimal retention, human review.

## Design commitments (what the code does today)

| Commitment | How |
|---|---|
| No identification | No face recognition, re-identification or biometric matching anywhere in the code |
| Human in the loop | Models only produce scores, labels and short captions for an operator to review. Nothing acts automatically. |
| Data minimisation | The worker downloads a clip to a temp file, scores it, posts scores back and **deletes the clip** |
| Access control | The web app is behind a passcode (constant-time comparison in `web/lib/auth.js`) |
| Operator privacy aid | A "Privacy blur" toggle blurs the operator view (the models still see full frames) |

Known gaps are listed in the README: Blob video URLs are public-but-unguessable, there are no
automatic retention limits yet, and a pose-only view is planned.

## Out of scope: please don't use it for

- Identifying, tracking or profiling individuals.
- Monitoring people who haven't been told about the cameras, or where you have no legal basis to record.
- Any automated action (alerts to police, access control, disciplinary decisions) without trained human review.
- Production deployment. The models are **zero-shot baselines** that haven't been trained or validated on violence data.

## Data and datasets

- Most violence datasets (e.g. RWF-2000) are **research-only**. Check each dataset's licence and terms before importing.
- Never commit video to this repository (`.gitignore` excludes `*.mp4`, `*.avi`, `*.mov`).
- Treat uploaded footage as personal information. Follow the privacy and surveillance laws that apply
  where it was recorded and where it's processed.
  <!-- TODO(yogi): name the specific laws/ethics approval relevant to your institution, if any -->

## Bias and limitations

Zero-shot vision-language models can confuse play, sport, dancing or hugging with fighting. They may also
perform differently across lighting, camera angles, clothing and skin tones. Report results per condition
where possible, and never present a score as proof that a fight happened.

## Reporting concerns

Raise an issue, or report privately via **Security → Report a vulnerability** on this repository.
