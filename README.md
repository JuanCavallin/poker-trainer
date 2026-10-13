# Range Den 🂡

A cozy heads-up poker trainer built around one twist: **you see the villain's range and action first, build your whole range, and only then get dealt your hand.**

Spots cover every street: **preflop** (open, defend, face 3-bets and 4-bets), **flop**, **turn** and **river**. Everything is solved with Discounted CFR in a Web Worker in your browser, so every answer is computed for the exact ranges you're shown. No server or account is needed, and progress is saved in `localStorage`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + learning unit tests (Vitest)
npm run build      # type-check + production build to dist/
```

Needs Node 22.12+ (tested on Node 25; Vitest prints an engine warning on odd-numbered Node releases but runs fine).

## The loop

1. **Read the villain.** Board (or none, preflop), the action so far, the villain persona, and the villain's range at this decision, coloured by how each hand does against *your* range.
2. **Paint your range.** Use action brushes (fold / check / call / bet 33% / bet 75% / raise / all-in, or open / 3-bet / 4-bet / jam preflop), mixed-frequency brushes (shift-click a second action), the **strength ladder** (drag a band of hands sorted by equity), one-click **hand-type / strength buckets** (made hands and draws postflop, hand groups preflop), and a per-suit **inspector**.
3. **Watch the live readout** as you paint: action frequencies, hands ahead of / behind the villain's continuing range for each bet size (with the river's s/(1+2s) bluff ratio), defence vs **MDF**, pot odds, equity and nut advantage, and whether your checking range is protected.
4. **Lock in with a confidence rating**, get dealt a real hand from your range, confirm the action.
5. **Feedback:** a range score (hand-by-hand accuracy + balance), a grade for your hand (Perfect → Blunder), EV of every action, a side-by-side solver grid, a "where EV leaked" heatmap, auto-generated insights, and a note on how the spot was solved. Then you can play a **twin** spot (same line with a new last card, or a new villain) to compare.

## Seats

Every spot is played between two of the six 6-max seats (UTG, HJ, CO, BTN, SB, BB), and the seats decide who acts first: the earlier seat opens preflop, and the blinds act first after the flop. Seats are random by default. You can fix yours, the villain's, or both in **Settings** (for Training and reviews), in the **Drills** builder, and in Blitz, Woodpecker and Range Sketch. So you play as the one acting first (opening, leading, c-betting) as often as the one responding.

## Modes

| Mode | What it is |
| --- | --- |
| **Training** | Adaptive mix of spot families: spaced reviews when due, new families as you level up, weak families more often, missed families re-tested a few spots later. Choose **every street, preflop only, or postflop only** on the Den or in Settings. Villain difficulty drifts toward ~85% success. |
| **Drills** | Concept presets (defend the big blind, steal from late position, facing 3-bets, c-betting in position, turn barrels, monotone flops, bluff-catching, exploiting each villain…) or a custom builder: street × decision × texture × your seat × villain's seat × pot type × villain, with **mixed** or **blocked** order. Any drill can also run as a range sketch. |
| **Blitz** | 3 minutes, 3 strikes. Fast single-hand decisions against a visible range, Elo-style rating, and a review of your misses at the end. **Preflop** (default), postflop or mixed. |
| **Woodpecker** | A fixed set re-solved in cycles with a "same accuracy, half the time" target. Preflop sets repeat **exactly**; postflop sets use **mirror** mode, which reshuffles suits each cycle so you learn the pattern, not the picture. |
| **Range Sketch** | No ranges are shown. Following the hand in order of action, draw the villain's range after each of their actions and your own range after each of yours, then paint your response at the decision. You can see (and redo) your earlier drawings but get no accuracy until the end, when each drawing is laid next to the real range with an overlap score, plus full feedback on your decision. |
| **Garden** | Spaced-repetition map with a tab per street: each decision type × board texture (or × seat, preflop) is a plant that grows with mastery and wilts when a review is due. |

## Villains

| | Persona | Tendency (preflop and postflop) | Correct adjustment |
| --- | --- | --- | --- |
| 🦉 | Wise Owl | Equilibrium | Play balanced |
| 🦥 | Sticky Sloth | Calling station: calls opens and 3-bets far too wide, rarely raises | Value bet thinner and bigger, bluff less |
| 🐰 | Timid Bunny | Nit: opens tight, folds to 3-bets, only bets real hands | Steal and bluff more, fold more to their aggression |
| 🦊 | Sly Fox | Over-bluffer: light 3-bets and 4-bets, too many bluffs | Bluff-catch and 4-bet wider |
| 🦝 | Wild Raccoon | Maniac: opens, raises and bets everything | Call down lighter, trap, bluff less |

Villains play their style from the first action: their preflop ranges are the equilibrium bent by their tendency, and those ranges then narrow street by street through the (also bent) solved strategies. Against exploitable villains you're graded against the **best response** to their strategy, and the HUD shows their stats next to the balanced baseline.

## How each street is solved

| Street | Model |
| --- | --- |
| Preflop | Each pair of seats is a heads-up game over the 169 starting hands (open → fold / call / 3-bet → fold / call / 4-bet → fold / call / jam), with exact card removal between hand classes. When a call ends the betting, the postflop is valued by **equity realisation**: all-in equity scaled by position, suitedness, connectedness and stack-to-pot ratio, with a squeeze penalty for cold calls with seats still to act. Opening ranges are solved against **every seat still to act** (iterated to a fixed point). Results: UTG opens 18.6%, HJ 23.1%, CO 29.0%, BTN 40.5%, SB 41.9%; BB vs a BTN open folds 38%, calls 47% and 3-bets 15%. |
| Flop | The flop's full betting (33% and 75% bets, a raise) plus turn play (66% bets) on 5–7 sampled turn cards, spread over ranks and suits; the river is a showdown over sampled cards with a small edge for the player in position. ~1–2 s. |
| Turn | The turn's full betting plus river play (75% bets) on every river card, or 12–24 sampled river cards when ranges are wide. ~1–2 s. |
| River | Exact for its tree (33%, 75% and all-in bets, one raise). ~0.5 s. |

Streets **before** the decision are solved too: each earlier street is solved with its own betting and a showdown over sampled runouts, then one line is sampled from those strategies (the villain's bent by their tendency). The ranges you see are what an equilibrium player would really bring to the spot, not a heuristic.

Card-dealing weights are validated by a test: a turn game where nobody bets the turn has the same value as the 48 river games solved separately.

## Progress & rewards

XP and levels (gradual unlocks), chips for cosmetic felts, card backs and table pets, daily quests with a bonus chest, a streak with spare logs (freezes), and 30 achievements. Beyond accuracy, progress is measured with:

- **By street:** recent average score preflop, on the flop, turn and river, plus a mastery map per street.
- **Highlights scrapbook:** hero calls, brave bluffs, bluff raises, thin value, big laydowns, blocker bluffs, traps (river) and exploits (any street). All are replayable.
- **Tendency tuner:** aggression, bluffing, defence, raising, sizing and thin value, each as a deviation from the reference, now vs your previous 25 spots.
- **Exploit radar:** the share of the available exploit EV you captured against each villain.
- **Confidence calibration**, **bluff-picking quality**, **EV leak per hand**, **fluency** (time per decision), and **range-sketch overlap**.

## Scoring

- **Hand-by-hand accuracy** = `100·exp(−EVloss/4)`, where EV loss is the weighted average (as % of pot) of `max_a EV(hand, a) − EV(your mix)`, against the reference villain.
- **Balance** (equilibrium spots) = `100·exp(−gap/15)`, where `gap` is how much more a best-responding villain would win against your range than against the equilibrium range at this node (% of pot). Open-or-fold spots have no balance score.
- **Range score** = `0.6·accuracy + 0.4·balance` (accuracy only for exploit and open-or-fold spots). Calibration on solved spots: equilibrium ≈ 98–100, sensible heuristics ≈ 45–90, random play ≈ 0–25.
- **Hand grade:** Perfect ≤ 0.15% pot lost (or the solver plays it ≥ 50%), Great ≤ 0.6%, Good ≤ 1.5%, Inaccuracy ≤ 4%, Mistake ≤ 10%, Blunder above that.
- **Range-sketch overlap** = shared combos ÷ combos in either range (weighted per combo, board-blocked combos excluded). 60%+ is strong reading.

## Architecture

```
src/engine/     pure TypeScript poker engine (no DOM)
  evaluator.ts    7-card hand evaluator (verified on all 2,598,960 five-card hands)
  equity.ts       range-vs-range river equity with card removal (sorted sweep, O(n+m))
  tree.ts         multi-street betting trees with chance (dealt-card) nodes
  solver.ts       generic vectorised Discounted CFR over any game: best response, per-action EVs
  postflop.ts     postflop game: sampled turn/river deals, river-board sweeps, depth-limited showdowns
  preflop.ts      heads-up preflop games, equity realisation, opening ranges, villain preflop styles
  seats.ts        6-max seats and who acts first
  data/           generated tables: 169x169 preflop equities, solved preflop strategies
  profiles.ts     villain personalities as perturbations of the equilibrium
  spot.ts         spot generation for every street: seats → preflop → solved earlier streets → decision
  analysis.ts     live metrics, scoring, hand grades, highlight detection, range-sketch scoring
src/learning/   spaced repetition, adaptive selection, XP, quests, achievements
src/worker/     Web Worker wrapper + client (foreground and prefetch lanes)
src/state/      zustand store persisted to localStorage
src/ui/         React screens and components (plain CSS, light/dark themes)
scripts/        generators for the preflop tables (npm run gen:equity, npm run gen:preflop)
```

Spots are reproducible from their request (seed, street, seats, filters, optional suit permutation, board and line seed), which is how replays, Woodpecker sets, and twins work. Saved river progress carries over: river spot families keep their original keys.

## Limitations

- **Abstractions before the river.** Flop and turn solves use sampled turn/river cards and one bet size on later streets, and flop solves end in a showdown at the river with a small positional edge. They're close to full solves, not identical to them. The decision street always gets two sizes and a raise.
- **Preflop is a model.** Heads-up games with equity realisation, not a full multi-way 6-max solve. Ranges land close to standard 100bb charts; limping and multi-way pots aren't modelled, and the small blind plays raise-or-fold.
- Betting trees are deliberately small (two sizes, all-in when short, one raise), which keeps solves to a second or two in the browser.
- "Value vs bluff" in the readout is classified against villain's *continuing* range for each size; before the river this means hands ahead of or behind the hands that continue, by all-in equity.

See [docs/learning-design.md](docs/learning-design.md) for the research behind the training design.
