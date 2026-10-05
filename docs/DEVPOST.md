# Trial of One — Devpost draft

**Tagline:** Is your skincare actually working? A fair, personal trial for one product at a time, with YouCam Skin AI as the measuring tape.

**Track:** Skin AI

## Inspiration

The YouCam brief describes the moment exactly: someone standing in front of a mirror, deciding whether a product is working. We kept running into the same problem from the other side: the mirror is a terrible instrument. Light from a different window, a bad night's sleep, a phone held a bit lower, last week's breakout: each moves what you see more than most actives move skin in a month. So people quit products that needed eight more weeks, keep paying for ones that do nothing, or start three new things at once and never learn which one helped.

An AI skin score fixes the eye, not the photo. Before building anything we measured how much YouCam's scores move when only the photo changes (the noise study below). That number became the core of the app.

## What it does

- **Plans the trial.** Paste a product's ingredient list. Trial of One finds the actives, picks the YouCam concerns they are meant to move, and sets how long a fair test takes, from four weeks for a hydrator to 24 for a retinoid, citing the trials behind the numbers. It knows the expected early effects (retinoid redness and dryness in weeks 1–6) so they are not mistaken for failure.
- **Measures your noise.** Two photos on each of three days before the first use give the person's own capture noise and day-to-day noise.
- **Guards every photo.** Before upload, each photo is checked on the device for exposure, colour cast and focus against the first baseline photo. A photo taken in different light is retaken, not scored.
- **Calls a change only when it is real.** For each target concern, the change from baseline is compared with the 95% minimal detectable change for exactly the photos taken. Verdicts: *working*, *too early (fair from a date)*, *not working for you*, *expected early dip*, or *stop and check*.
- **Writes the weekly note.** An agent turns the numbers into a short, plain note: what changed, how sure, what to do next. It cannot change a verdict or invent a number (see below).
- **Untangles routines.** List everything you want to start; the planner flags clashes (retinoid with acids, benzoyl peroxide with vitamin C), duplicate actives, and orders the products into back-to-back trials by your priorities.

## How we built it

- **YouCam AI Skin Analysis (HD)**, twelve concerns per photo, called server-side from a Cloudflare Worker (file registration → pre-signed upload → task → polling) so the key never reaches the browser. Results are cached by photo hash so a photo never costs a second unit, with a daily budget guard.
- **Statistics** in TypeScript, shared by the app and the tests: pooled within-session variance for capture noise, between-session variance for day noise, both shrunk towards the study's population values when a person has few baseline photos; minimal detectable change from the exact numbers of sessions and photos; Theil–Sen trends that one bad photo cannot drag.
- **Agent**: a language model writes the weekly note from the structured results. A checker rejects any note containing a number not in the input, or contradicting the verdict, and falls back to a deterministic template. The model can explain; it cannot decide.
- **Privacy**: photos are analysed and dropped; trials live in the browser's IndexedDB. No accounts.
- **No real faces**: the study and the example trial use synthetic faces generated locally with FLUX.1 [schnell] (Apache-2.0).

## The noise study

*(numbers to fill in from scripts/noise_study.py)*

## Challenges

- A trial only works if the photos compare, so most of the engineering went into the photo, not the model: the on-device light and focus checks, the session design, and the noise model.
- Deciding when *not* to give an answer. "Too early, fair from 28 November" is the most common verdict in the first weeks, and the most useful one.

## What's next

- Use the YouCam Camera Kit's live quality checks during capture.
- Let brands run the same protocol for product sampling: a 30-day trial kit with a sample size, ending in an honest verdict instead of a coupon.
- Pool anonymous, opt-in trial outcomes by active and skin type to show real-world effect sizes.

## Built with

YouCam AI Skin Analysis API · TypeScript · React · Vite · Cloudflare Workers · KV · Python (study) · FLUX.1 [schnell] via mflux (synthetic faces)
