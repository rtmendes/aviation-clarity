# Private pilot school selector

An interactive decision tool for choosing a flight school for a Private Pilot
Licence from ZIP 10030 (Harlem, NYC). 18 schools across 12 airports, plus one
relocation option in the Memphis metro.

It started as a static comparison table. This version is an app: every
assumption is an editable input, every researched figure can be overwritten with
what a school actually quotes you, and the schools you are seriously considering
get a shortlist with a call checklist and notes.

## Use it

Open `index.html` in any browser — it is a single self-contained file, no build
step and no server needed.

## What you can change

- **Your scenario** (left rail) — flight hours, share flown with an instructor,
  ground hours, lessons per week, hours per lesson, weather buffer, simulator
  hours, knowledge-test fee, examiner fee, cost of each week of delay, gear and
  medical, the two assumed rates used for schools that publish nothing, deadline,
  mileage cost, road-miles multiplier, and relocation housing. Drag the slider or
  type an exact number.
- **What matters to you** — seven 0–5 weights (cost, speed, deadline margin,
  reviews, distance, examining authority, data confidence) that drive the Match
  column and the "best match" tile.
- **Per school** — open a row and type in the aircraft rate, instructor rate,
  simulator rate, examiner fee, checkride wait, or real drive distance a school
  quotes you. Overridden values are tagged `yours` and the school stops being
  modelled from assumptions.
- **Status and notes** — shortlist, mark called, rule out; free-text notes and a
  per-school call checklist.

Everything is stored in the browser's `localStorage`; nothing is uploaded.
"Copy table (CSV)" and "Copy shortlist summary" put the current state on the
clipboard.

## Fixes over the original static bundle

- The **examiner-fee input was inert**: every school carried a hard-coded
  `dpeFee: 900`, so the slider changed nothing. Those placeholder fees are now
  `null` (`dpeFeeSource: "modeled"`) and the scenario fee drives them. The two
  fees that are real are kept — Richmor's $0 (it holds FAA Part 141 examining
  authority) and Luke Weathers' confirmed $600.
- Knowledge-test cost was hard-coded at $175; it is now an input, alongside a new
  one-off cost for headset, medical and books.
- Checkride wait, distance, and every rate can now be overridden per school —
  which is what makes the unpublished-rate schools decidable at all.
- Number entry next to every slider, persistence, shortlist, weighted match
  score, CSV and summary export.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | the app, standalone — this is the file to open |
| `artifact.html` | the same page without the `<html>/<head>/<body>` wrapper, for publishing as a Claude Artifact |
| `src/shell.html` | source: markup, styles and logic, with a `__SCHOOLS_JSON__` placeholder |
| `schools.json` | the 18 schools, each with source links |
| `build.mjs` | `node build.mjs` regenerates the two HTML files from the two sources |

Edit `src/shell.html` or `schools.json`, then run `node build.mjs`. Never edit
`index.html` or `artifact.html` directly — they are generated.

## Data

Compiled 21 August 2026 from school websites, [AirNav](https://airnav.com/),
[flightschools.fyi](https://flightschools.fyi/),
[checkrides.io](https://checkrides.io/),
[pilotbound](https://pilotbound.app/), [aviator.nyc](https://www.aviator.nyc/),
Google Maps and Yelp. Every value keeps a link to the page it came from, visible
when you open a row. Distances are great-circle from the 10030 centroid
(40.8184, −73.9423), so they understate real driving. Examiner waits are modelled
estimates, not quotes. Aero Safety Training is flagged permanently closed on
Google. Verify by phone before paying anyone.
