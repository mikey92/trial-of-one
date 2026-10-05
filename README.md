# Trial of One

**Is your skincare actually working?** Trial of One runs a small, fair experiment on one
product at a time, with YouCam AI Skin Analysis as the measuring tape, and only calls a
change real when it is bigger than the noise in your own photos.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

**Try it:** https://trial-of-one.mikey9220.workers.dev (the finished example trial is at
`#/demo`, the noise study at `#/study`) · **Demo video (2:32):** https://youtu.be/FxMY1DHc4Ms

## The problem

People start a serum and, weeks later, stand in front of the mirror trying to decide whether
it works. The mirror is a bad instrument. Light, angle, distance, sleep and last week's
breakout move what you see more than most actives do in a month. So people quit products
that needed eight more weeks, keep paying for ones that do nothing, and start three things at
once so that nobody can tell which one helped.

A skin-analysis score has the same problem: it measures a photo, not skin. Our study below
shows how far YouCam's scores move when only the photo changes.

## What it does

1. **Plan.** Paste the ingredient list. The app finds the actives (retinoids, vitamin C,
   niacinamide, azelaic acid, acids, brighteners, peptides, hydrators and more), picks the
   skin concerns those actives are meant to move, and sets how long a fair test takes: from
   four weeks for a hydrator to 24 for a retinoid, with the trials behind the numbers cited.
   It also knows the expected early effects (retinoid redness and dryness in the first
   weeks) so they are not mistaken for failure.
2. **Baseline.** One photo on each of three days before the first use. That measures how
   much your scores wobble between days when nothing changes (day noise); how much they
   wobble between photos of the same skin (capture noise) comes from the study below.
3. **Check in weekly.** Each photo is checked on the device for light, colour cast and focus
   against your first baseline photo before it is uploaded; a photo that would not compare
   is retaken, not scored.
4. **Verdict.** For each target concern, the change from baseline is compared with the 95%
   minimal detectable change for exactly the photos taken. Verdicts: *working*, *too early
   (fair from <date>)*, *not working for you*, *expected early dip*, or *stop and check*.
   A weekly note explains it in plain words.

## How YouCam is used

- **AI Skin Analysis (HD)** scores twelve concerns per photo: wrinkles, texture, pores,
  breakouts, redness, oiliness, hydration, radiance, dark spots, dark circles, under-eye
  puffiness and firmness. The product's target concerns are judged; the rest are watched
  for side effects, with a stricter bar (1.5 times the detectable change) because eleven
  concerns checked every week would otherwise cross the plain 95% line about one week in
  four. Known early effects, such as retinoid redness, are named instead of alarmed.
- The server-to-server flow (file registration, pre-signed upload, task, polling) runs in a
  Cloudflare Worker so the API key never reaches the browser. Results are cached by photo
  hash, so the same photo never spends a second unit.
- YouCam prices an analysis by tier and number of concerns (HD with 9-12 concerns: 20
  units). Before each new analysis the Worker reads the account's balance and stops before
  it would fall below a floor, and a daily cap spreads what is left.

## The noise study

Before building the verdicts we measured how far YouCam's scores move when only the photo
changes.

- **Faces.** Six synthetic portraits, no real person: three from FLUX.1 [schnell]
  (Apache-2.0) and three from an OpenAI image model, adults from 27 to 61 with different skin
  tones and concerns (`scripts/faces.txt`). All are 1088 px on the short side, so the HD
  concerns apply.
- **Edits.** Each face was scored as generated and after three edits a phone photo can have
  from one week to the next: one to the light (15% darker or brighter, warmer or cooler
  white balance), one to the framing (3° tilt, 8% closer) and one to the camera (JPEG
  quality 70, a slight blur). The edits rotate across faces: 24 HD analyses, 460 units.
- **The app's photo check** ran on every edited photo, with the app's own limits.

Score spread with no change in the skin (standard deviation, points on the 0-100 scale):

| Concern | All edits | Photos that pass the check | Smallest change one photo can show* |
|---|---|---|---|
| Texture | 3.5 | 0.9 | 2.6 |
| Pores | 2.3 | 1.8 | 4.9 |
| Breakouts | 1.7 | 1.7 | 4.7 |
| Oiliness | 1.1 | 1.2 | 3.4 |
| Hydration | 0.8 | 0.4 | 1.2 |
| Fine lines & wrinkles | 0.8 | 0.5 | 1.5 |
| Dark spots | 0.8 | 0.4 | 1.1 |
| Redness | 0.7 | 0.8 | 2.1 |
| Radiance | 0.4 | 0.4 | 1.2 |
| Firmness | 0.4 | 0.4 | 1.1 |
| Dark circles | 0.4 | 0.3 | 0.9 |
| Under-eye puffiness | 0.3 | 0.3 | 0.9 |

\* 95% minimal detectable change between two single photos that pass the check (1.96 × √2 × SD).

What it changed in the app:

1. **Focus matters most.** A blur too slight to notice on a phone screen (Gaussian, 1.2 px
   on a 1088 px wide photo) raised texture by 8.7 points on average, and by 14 on one face
   (67 to 81). A before-and-after comparison would have called that a result.
2. **Our first focus check missed it.** It measured sharpness on a 256 px copy, where the
   blurred photos kept 85% of their sharpness. Measured at up to 1024 px inside the face
   oval, they keep 9-20% while every other edit keeps 87-112%, so the check now sends them
   back. With it, texture noise falls from 3.5 to 0.9 points.
3. **Light and framing within the check's limits barely matter** for most concerns, a point
   or less. Pores and breakouts move most (heavier JPEG +3.3 on breakouts, a 3° tilt -2.7 on
   pores), so a trial needs the largest change on those before it calls one.
4. **One photo per sitting.** Next to day-to-day changes in skin (every trial starts at 3
   points and learns the person's own value from the baseline days), a second photo per
   sitting would shrink the smallest detectable change by at most 7% and double the units a
   trial spends. The app takes one.
5. **The scores do follow the skin.** Fading only the cheek flush on one face (the a*
   channel, cheeks only) moved redness from 66 to 82 while the other eleven scores stayed
   within a point. The example trial uses that edit.

The spreads become the population prior every trial starts from (`src/study.json`). The
study reruns from the repo without spending a unit: `python scripts/noise_study.py` reads
the cached scores in `study/cache/`.

## The example trial

`#/demo` is a 12-week trial of a 15% azelaic acid serum on face 1, a synthetic woman with
flushed cheeks. Her photos were edited so the flush fades from week 4 (the shape azelaic
acid trials report), every photo got realistic week-to-week variation (exposure, white
balance, a slight tilt, JPEG quality), she skipped weeks 5 and 9, and YouCam scored all 13
photos. Replayed one check-in at a time (`test/demo.test.ts`), the app said:

| Week | Redness change | Change needed | Verdict |
|---|---|---|---|
| 1-3 | 0 | 4.6-5.8 | too early |
| 4 | +1 | 4.6 | too early |
| 6 | +4 | 4.6 | too early: a mirror would already say it works |
| 7 | +8 | 4.6 | working |
| 12 | +11.5 | 4.6 | working |

The other eleven scores stayed within their noise (largest: oiliness +3, breakouts -2), so
no side effect was raised.

## The agent

The weekly note is written by a language model from the numbers the statistics produced.
It cannot change a verdict: every number in its note must appear in the input, and a note
that calls a working product "not working" (or the reverse) is rejected and replaced by a
plain template. If the model is unavailable, the template writes the note.

## Privacy

Photos go to the analysis and back; the app keeps no photos on a server. The trial (scores,
dates and small thumbnails) is stored in your browser only. Export or delete it any time.

## Running it

```
npm install
npm test            # statistics and plan unit tests
npm run dev         # local app + worker (needs .dev.vars with YOUCAM_API_KEY)
npm run deploy      # Cloudflare Workers
```

Secrets: `YOUCAM_API_KEY` (required); `LLM_RELAY_URL`, `LLM_RELAY_KEY` (optional, for the
written notes).

Study scripts (Python 3.12, `numpy`, `pillow`): `scripts/make_faces_hf.py` (FLUX.1
[schnell] on a Hugging Face Space), `scripts/make_faces.sh` (the same prompts locally through
mflux) and `scripts/make_faces_gpt.py` (an OpenAI image model) generate the synthetic faces
in `faces/`; `scripts/noise_study.py` and `scripts/demo_trial.py` score them. Both take
`--dry-run` to print how many units a run would spend.

## Not medical advice

Trial of One measures cosmetic change in photos. It does not diagnose anything. For a rash,
pain, or anything that worries you, see a dermatologist or pharmacist.

## License

MIT
