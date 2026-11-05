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
| Standings adapter | `src/data/adaptStandings.ts` | `fixtures/desk-standings.json` is the desk snapshot for NBA, NHL, NFL, MLB, and NCAAF. NCAAB stays the labeled sample in `src/data/standings.sample.json`. |
| Book links | `src/lib/links.ts` | Hard Rock betslip URL and DraftKings single-leg URL, matching the live desk. Multi-leg DK opens each leg on its own. No id means Not on HR or Not on DK. |
| Share image | `src/lib/shareCard.ts` and `src/lib/shareImage.ts` | Ticket legs, odds, and result. No units, profit, or bankroll. |

A play with no selection id for the active book says **Not on HR** or **Not on DK** and stays on the card. Hard Rock opens `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/{id}`, one id or several joined with commas. DraftKings opens `https://sportsbook.draftkings.com/event/{event}?outcomes={id}` for one leg. Two or more DK legs open as separate singles, because the two-leg `dksb://sb/addbet` link did not open on the phone. The edge-picks fixture has Hard Rock prices and no DK Predictions ids, so those rows say Not on DK.

**Alt line** is the single tag for a buy-down. The Heist ticket shows the before line, then the after line.

Player status (Out, Questionable, GTD, Minutes limit, Not starting, Active) is display only. It never removes a play, a checkbox, or a button.

Profit and win rate are marked “Only you can see this”. They are not on the share image.

## Tests

`npm test` checks the adapter against the fixture (351 rows, grades, no invented DK price), the link builders, and that share cards do not contain a unit profit.

`node scripts/verify.mjs` drives the preview build in Chrome at 390, 360, and 1280. Start `npm run preview` first. It needs Chrome.
