# Range Den 🂡

A cozy heads-up poker trainer built around one twist: **you see the villain's range and action first, build your whole range, and only then get dealt your hand.**

Every spot is a heads-up river decision. A river solver (Discounted CFR) runs in a Web Worker in your browser, so every answer is computed for the exact ranges you're shown. No server or account is needed, and progress is saved in `localStorage`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + learning unit tests (Vitest)
npm run build      # type-check + production build to dist/
```

Needs Node 22.12+ (tested on Node 25; Vitest prints an engine warning on odd-numbered Node releases but runs fine).

## The loop

1. **Read the villain.** Board, action history, villain persona, and the villain's range at this node, coloured by how each hand does against *your* range.
2. **Paint your range.** Use action brushes (fold / check / call / bet 33% / bet 75% / raise / all-in), mixed-frequency brushes (shift-click a second action), the **strength ladder** (drag a band of hands sorted by equity), one-click **hand-type / strength buckets**, and a per-suit **inspector**.
3. **Watch the live readout** as you paint: action frequencies, **value vs bluff combos for each bet size against the theoretical s/(1+2s)**, defence vs **MDF**, pot odds, the villain's bluff share vs balanced, equity and nut advantage, and whether your checking range is protected.
4. **Lock in with a confidence rating**, get dealt a real hand from your range, confirm the action.
5. **Feedback:** a range score (hand-by-hand accuracy + balance), a grade for your hand (Perfect → Blunder), EV of every action, a side-by-side solver grid, a "where EV leaked" heatmap, and auto-generated insights. Then you can play a **twin** spot (same line, new river, or a new villain) to compare.

## Modes

| Mode | What it is |
| --- | --- |
| **Training** | Adaptive mix: spaced reviews when due, new spot families as you level up, weak families more often, missed families re-tested a few spots later. Villain difficulty drifts toward ~85% success. |
| **Drills** | Concept presets (bluff-catching, scare cards, exploiting each villain, 3-bet pots…) or a custom builder (decision type × texture × villain × preflop scenario), with **mixed** or **blocked** order. |
| **Blitz** | 3 minutes, 3 strikes. Fast single-hand decisions against a visible range, Elo-style rating, and a review of your misses at the end. |
| **Woodpecker** | A fixed set re-solved in cycles with a "half the time, same accuracy" target. **Mirror** mode reshuffles suits each cycle so you learn the pattern, not the picture. |
| **Garden** | Spaced-repetition map: each decision type × board texture is a plant that grows with mastery and wilts when a review is due. |

## Villains

| | Persona | Tendency | Correct adjustment |
| --- | --- | --- | --- |
| 🦉 | Wise Owl | Equilibrium | Play balanced |
| 🦥 | Sticky Sloth | Calling station | Value bet thinner and bigger, bluff less |
| 🐰 | Timid Bunny | Nit | Bluff more, fold more to their bets |
| 🦊 | Sly Fox | Over-bluffer | Bluff-catch wider |
| 🦝 | Wild Raccoon | Maniac | Call down lighter, trap, bluff less |

Against exploitable villains you're graded against the **best response** to their (perturbed) strategy, and the HUD shows their stats next to the balanced baseline.

## Progress & rewards

XP and levels (gradual unlocks), chips for cosmetic felts, card backs and table pets, daily quests with a bonus chest, a streak with spare logs (freezes), and 26 achievements. Beyond accuracy, progress is measured with:

- **Highlights scrapbook:** hero calls, brave bluffs, bluff raises, thin value, big laydowns, blocker bluffs, traps, exploits. All are replayable.
- **Tendency tuner:** aggression, bluffing, defence, raising, sizing and thin value, each as a deviation from the reference, now vs your previous 25 spots.
- **Exploit radar:** the share of the available exploit EV you captured against each villain.
- **Confidence calibration**, **bluff-picking quality**, **EV leak per hand**, **fluency** (time per decision), and a **mastery map**.

## Scoring

- **Hand-by-hand accuracy** = `100·exp(−EVloss/4)`, where EV loss is the weighted average (as % of pot) of `max_a EV(hand, a) − EV(your mix)`, against the reference villain.
- **Balance** (equilibrium spots) = `100·exp(−gap/15)`, where `gap` is how much more a best-responding villain would win against your range than against the equilibrium range at this node (% of pot).
- **Range score** = `0.6·accuracy + 0.4·balance` (accuracy only for exploit spots). Calibration on solved spots: equilibrium ≈ 98–100, sensible heuristics ≈ 45–90, random play ≈ 0–25.
- **Hand grade:** Perfect ≤ 0.15% pot lost (or the solver plays it ≥ 50%), Great ≤ 0.6%, Good ≤ 1.5%, Inaccuracy ≤ 4%, Mistake ≤ 10%, Blunder above that.

## Architecture

```
src/engine/     pure TypeScript poker engine (no DOM)
  evaluator.ts    7-card hand evaluator (verified on all 2,598,960 five-card hands)
  equity.ts       range-vs-range equity with card removal (sorted sweep, O(n+m))
  tree.ts         river betting tree (check, 33%, 75%, all-in; one raise)
  solver.ts       vectorised Discounted CFR, best response, per-action EVs
  narrowing.ts    flop/turn simulation that turns preflop ranges into river ranges
  profiles.ts     villain personalities as perturbations of the equilibrium
  spot.ts         spot generation: deal → simulate → solve → package (deterministic by seed)
  analysis.ts     live metrics, scoring, hand grades, highlight detection
src/learning/   spaced repetition, adaptive selection, XP, quests, achievements
src/worker/     Web Worker wrapper + client (foreground and prefetch lanes)
src/state/      zustand store persisted to localStorage
src/ui/         React screens and components (plain CSS, light/dark themes)
```

Spots are reproducible from their request (seed, filters, optional suit permutation, board and line seed), which is how replays, Woodpecker sets, and twins work.

## Limitations & next steps

- **River only.** The flop and turn are simulated with heuristics to produce believable river ranges. The river itself is solved exactly for its tree. Turn spots (solving over 44–46 river cards) are the natural next step; flop spots would need precomputed solutions.
- The betting tree is deliberately small (two bet sizes, all-in, one raise level), which keeps solves under a second in the browser.
- Preflop ranges are close to standard 100bb 6-max charts but not solver-exact; they only seed the simulation.
- "Value vs bluff" in the readout is classified against villain's *continuing* range for that bet size, which is the useful definition but differs slightly from "beats half of their whole range".

See [docs/learning-design.md](docs/learning-design.md) for the research behind the training design.
