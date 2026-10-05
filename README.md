# Trial of One

**Is your skincare actually working?** Trial of One runs a small, fair experiment on one
product at a time, with YouCam AI Skin Analysis as the measuring tape, and only calls a
change real when it is bigger than the noise in your own photos.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

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
2. **Baseline.** Two photos on each of three days before the first use. That measures your
   personal noise: how much your scores wobble between photos taken a minute apart
   (capture noise) and between days (day noise).
3. **Check in weekly.** Each photo is checked on the device for light, colour cast and focus
   against your first baseline photo before it is uploaded; a photo taken in different light
   is retaken, not scored.
4. **Verdict.** For each target concern, the change from baseline is compared with the 95%
   minimal detectable change for exactly the photos taken. Verdicts: *working*, *too early
   (fair from <date>)*, *not working for you*, *expected early dip*, or *stop and check*.
   A weekly note explains it in plain words.

## How YouCam is used

- **AI Skin Analysis (HD)** scores twelve concerns per photo: wrinkles, texture, pores,
  breakouts, redness, oiliness, hydration, radiance, dark spots, dark circles, under-eye
  puffiness and firmness. The product's target concerns are judged; the rest are watched
  for side effects.
- The server-to-server flow (file registration, pre-signed upload, task, polling) runs in a
  Cloudflare Worker so the API key never reaches the browser. Results are cached by photo
  hash, so the same photo never spends a second unit.

## The noise study

*(numbers filled in by `scripts/noise_study.py`)*

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

Study scripts (Python 3.12, `numpy`, `pillow`): `scripts/make_faces.sh` generates the
synthetic faces with FLUX.1 [schnell] through mflux; `scripts/noise_study.py` and
`scripts/demo_trial.py` score them.

## Not medical advice

Trial of One measures cosmetic change in photos. It does not diagnose anything. For a rash,
pain, or anything that worries you, see a dermatologist or pharmacist.

## License

MIT
