# ParlayBOT

Mobile-first betting tracker. It shows the daily card, live legs, results, private stats, and standings. It does not place bets, log in to a sportsbook, or change picks, prices, or grades.

The phone is the main screen. Layout follows the approved round-3 card: last night first, then today's tickets, with Live, Results, Stats, Cappers, and Standings.

## Run

```bash
npm install
npm test
npm run dev
```

Open the URL Vite prints. `npm run build` typechecks and writes `dist/` for any static host. `npm run preview` serves that build.

Screens are laid out for 360px and 390px, including the large-text settings (A / A / A), and a two-column card from 900px up.

## Where the data lives

| Piece | Path | What it is |
| --- | --- | --- |
| Edge-picks adapter | `src/data/adaptEdgePicks.ts` | Turns the fixture array into typed plays. It only renames and classifies fields already on the row. |
| Feed presenter | `src/data/presentEdgeFeed.ts` | Builds the Edge feed ticket, grades, and the flat-1u record from adapted rows. |
| Fixture | `fixtures/edge-picks-sample.json` | Read-only snapshot of the current pick feed. |
| Sample card | `src/data/sampleBoard.ts` | Heist, Safe +100, official tickets, cappers, props, live, and last night. Labeled sample. |
| Standings | `src/data/standings.ts` and `src/data/standings.sample.json` | NBA, MLB, NCAAF, and NCAAB tables from the approved card. NHL is only the teams printed on that card. NFL rows were not in the bundle and are left blank. |
| Book links | `src/lib/links.ts` | The only URL builder. Hard Rock and DraftKings formats are still TODOs, so Open tells you the ids instead of guessing a host. |
| Share image | `src/lib/shareCard.ts` and `src/lib/shareImage.ts` | Ticket legs, odds, and result. No units, profit, or bankroll. |

A book that does not offer a play says **Not on HR** or **Not on DK**. Those plays stay on the card. The edge-picks fixture has Hard Rock prices only, so every feed row says Not on DK.

**Alt line** is the single tag for a buy-down. The Heist ticket shows the before line, then the after line.

Player status (Out, Questionable, GTD, Minutes limit, Not starting, Active) is display only. It never removes a play, a checkbox, or a button.

Profit and win rate are marked “Only you can see this”. They are not on the share image.

## Tests

`npm test` checks the adapter against the fixture (351 rows, grades, no invented DK price), the link builders, and that share cards do not contain a unit profit.

`node scripts/verify.mjs` drives the preview build in Chrome at 390, 360, and 1280. Start `npm run preview` first. It needs Chrome.
