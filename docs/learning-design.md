# Learning design: why Range Den trains the way it does

This is the reasoning behind the training loop, the modes, and the progress metrics. Each section names the finding, how strong the evidence is, and what the app does with it.

## 1. Poker is a "wicked" learning environment, so grade decisions, not results

Intuition becomes reliable only in environments with valid cues and fast, accurate feedback (Kahneman & Klein, 2009). Hogarth (2001) calls environments with noisy or misleading feedback *wicked*. Poker is a textbook case: a correct call loses often, and a bad bluff often works. Playing more hands improves skill slowly and can teach the wrong lessons ("resulting").

**In the app:** every score is computed from expected value against a solved strategy, never from whether you won the hand. The reveal deals one hand, but its grade depends only on EV loss.

## 2. Retrieval and generation before feedback

Testing yourself beats re-studying (Roediger & Karpicke, 2006). Generating an answer before seeing it improves memory (Slamecka & Graf, 1978), and this holds even when the attempt is wrong (Kornell, Hays & Bjork, 2009; Richland, Kornell & Kao, 2009). Dunlosky et al. (2013) rate practice testing and distributed practice as the two highest-utility study techniques.

**In the app:** the core twist (commit a full range before your hand is revealed) is a generation task. You can't peek at solver EVs while building; the live readout shows only theory-derived quantities.

## 3. Spacing: the garden

Distributed practice beats massed practice across hundreds of studies (Cepeda et al., 2006). Adaptive schedulers that space items by performance and response time beat fixed schedules (Mettler, Massey & Kellman, 2016).

**In the app:** each *spot family* (decision type × board texture on the flop, turn or river, or decision type × seat preflop: 84 in total) has a memory model with a stability measured in days. Good scores stretch the interval (more so when you're tested close to forgetting), failures shrink it, and the family returns within the same session after 3+ other spots. Plants wilt when retrievability drops below 90%.

## 4. Interleaving, and when to block instead

Interleaving categories improves induction and discrimination, even though learners believe blocking works better (Kornell & Bjork, 2008; Rohrer & Taylor, 2007). A meta-analysis of 59 studies finds a moderate overall benefit (g ≈ 0.42), larger for visual categories and for categories that resemble each other, and reversed for some verbal material (Brunmair & Richter, 2019). Carvalho & Goldstone (2014) show that interleaving helps when categories are similar (it highlights differences) and blocking helps when they are dissimilar (it highlights commonalities).

**In the app:** Training interleaves families and never repeats one twice in a row. Drills offer *Mixed* (default) and *Blocked* (four in a row) so a brand-new concept can be blocked first, then mixed.

## 5. Your Woodpecker question: does drilling near-identical hands work?

Partly. The useful ingredients are repetition, retrieval and speed pressure. The risky ingredient is *identical* repetition.

- The Woodpecker Method (Smith & Tikkanen, 2018) solves a fixed set of about 1,100 chess tactics, then re-solves the same set in cycles, each faster. It isn't a controlled study, but it combines retrieval practice with growing automaticity.
- Overlearning, meaning continued drilling of the same items past mastery, gives benefits that fade sharply within weeks (Rohrer, Taylor, Pashler, Wixted & Cepeda, 2005).
- Chess tactics are concrete visual patterns that recur exactly in games. Poker "patterns" are relations between ranges, board, sizing and blockers, so an identical repeat can be answered from memory ("this one is a call") without retrieving the principle.
- Category learning improves when surface features vary and the deep structure stays fixed (variation theory; contrasting cases: Schwartz & Bransford, 1998; Gentner, Loewenstein & Thompson, 2003). A meta-analysis of 57 experiments supports learning by comparing cases (Alfieri, Nokes-Malach & Schunn, 2013).

**In the app:** Woodpecker sets keep the repetition and the "same accuracy, half the time" target, but **mirror mode** permutes suits each cycle for postflop sets. The spot is strategically identical yet visually new, so you must recognise the structure rather than the picture. Rest days between cycles are encouraged (spacing). **Twins** add *minimal pairs*: same line with a different last card (river, turn or flop), or the same spot against a different villain, shown side by side.

Preflop is the exception, and section 13 explains why preflop sets repeat exactly.

There is still no controlled study of the Woodpecker Method itself, only practitioner reports, some positive and some sceptical (one long-time user found no improvement and suspected the gains were memorised puzzles). The app relies on its evidence-backed ingredients (retrieval, spacing, speed targets on known material) rather than on the method's reputation.

## 6. Fluency through fast classification

Expertise is largely fast pattern pickup (Chase & Simon, 1973). Perceptual-learning modules, short and rapid classification trials, build that fluency in mathematics, medicine and aviation (Kellman & Garrigan, 2009; Kellman, Massey & Son, 2010). Kellman's lab reports that novices with under an hour of training outperformed pilots with about 1,000 hours on instrument interpretation. That result is developer-reported and not independently replicated, so treat it as suggestive.

**In the app:** Blitz gives many short decisions with immediate right/wrong signals and delayed elaborated feedback (a review of misses at the end). The garden and progress pages track speed alongside accuracy. Blitz defaults to preflop (see section 13).

## 7. Difficulty: aim for about 85%

For a broad family of learners, training is fastest at an error rate around 15% (Wilson, Shenhav, Straccia & Cohen, 2019), consistent with *desirable difficulties* (Bjork, 1994).

**In the app:** the share of exploitable-villain spots rises when your recent success rate is above ~88% and falls below ~65%. Blitz serves hands whose estimated difficulty is near your rating.

## 8. Feedback that explains the task

Feedback improves performance on average, but about a third of interventions in one major meta-analysis made performance worse, especially feedback aimed at the self rather than the task (Kluger & DeNisi, 1996). Elaborated, task-focused feedback works best (Hattie & Timperley, 2007; Shute, 2008).

**In the app:** insights point at specific hands and frequencies ("A♦9♣ (two pair): you checked, betting earns 0.8bb more"), not at the player.

## 9. Confidence, calibration and hypercorrection

High-confidence errors are corrected more readily than low-confidence ones once feedback arrives (Butterfield & Metcalfe, 2001; Metcalfe, 2017).

**In the app:** locking in asks for a confidence level. Confident misses are re-queued sooner, and the Progress page shows calibration ("when you felt certain, you scored 75+ X% of the time").

## 10. Scaffolds that fade, and numbers people can reason with

Guidance helps novices but can hinder experts (the expertise-reversal effect: Kalyuga, Ayres, Chandler & Sweller, 2003; faded examples: Renkl & Atkinson, 2003). Natural frequencies make probabilistic reasoning far easier than percentages (Gigerenzer & Hoffrage, 1995).

**In the app:** theory markers (MDF, s/(1+2s) bluff share, equity dashes) fade automatically once a family is mastered, unless you set them to always on. The readout shows combo counts ("26.9 value · 9.1 bluff combos") alongside percentages.

## 11. Practice volume vs practice quality

Deliberate practice explains about 26% of the variance in performance in games (Macnamara, Hambrick & Oswald, 2014): a lot, but not everything. In chess, serious solitary study predicted skill better than tournament play (Charness et al., 2005). Experienced poker players make more mathematically accurate decisions, and the expertise literature stresses emotion regulation alongside technical skill (Laakasuo, Palomäki & Salmela, 2015; Palomäki et al., 2020).

**In the app:** short, focused, feedback-rich sessions over volume. Blitz is the only mode with time pressure.

## 12. Motivation without undermining it

Gamification has small-to-medium positive effects on cognitive (g ≈ 0.49), motivational (g ≈ 0.36) and behavioural (g ≈ 0.25) outcomes (Sailer & Homner, 2020). Expected, tangible, contingent rewards can undermine intrinsic motivation, while informational feedback supports it (Deci, Koestner & Ryan, 1999). Self-determination theory points to autonomy, competence and relatedness (Ryan & Deci, 2000).

**In the app:**

- *Competence:* the score breakdown, the plant that grows, the tendency tuner moving toward centre, highlights for skilful plays.
- *Autonomy:* drills let you practise anything; unlocks can be switched off.
- *Rewards are cosmetic and informational:* chips buy felts, card backs and pets. Nothing is pay-to-win or required.
- *Streaks are forgiving:* spare logs (freezes) protect a missed day, to avoid loss-aversion pressure.

## 13. Preflop vs postflop: where repetition and speed belong

Do Woodpecker cycles and Blitz suit preflop especially well? The literature says yes, with two conditions.

**Why preflop fits.** Preflop is a closed, finite problem: 169 starting hands, six seats, and a handful of situations (open, facing an open, facing a 3-bet, facing a 4-bet). The same situation always has the same answer. In the automaticity literature this is a *consistent mapping*, and it is the condition under which practice turns slow, effortful processing into fast, automatic responding (Schneider & Shiffrin, 1977). Logan's instance theory (1988) gives the mechanism: each practice trial stores an instance, and once enough instances exist, retrieving the answer beats computing it. Practice adds instances and makes retrieval faster; consistency makes the retrieved instances correct. Rickard (1997) disputes some of the theory's quantitative predictions, but the basic finding holds: consistent practice turns computation into retrieval.

Postflop is different. The right action depends on the board, both ranges, the sizing and the stack depth, so the same *picture* rarely recurs with the same answer. There, identical repetition risks memorising pictures (section 5).

Poker research points the same way. In a think-aloud study of 45 players, experts and intermediates beat novices mainly in the *later* stages of a hand (St. Germain & Tenenbaum, 2011). Early decisions are where novices can most easily catch up, and they are exactly the ones a drill can make automatic. Automatic preflop also frees attention for the postflop decisions that need it.

**Condition 1: retrieve, and keep retrieving after you're right.** Continued testing after an item is learned produces large gains in delayed recall, while continued restudying produces none (Karpicke & Roediger, 2008, with Swahili vocabulary; replicated in its original design in 2015). Preflop charts are paired associates of the same kind (hand + situation → action). So the app tests (paint the chart, answer the hand) instead of showing charts to stare at.

**Condition 2: space it, and add speed only after understanding.** Spacing beat cramming for 90% of learners in a flashcard study, even though 72% believed cramming had worked better (Kornell, 2009). Time pressure is not a free win: in a study of timed vs untimed practice of arithmetic facts, time pressure sped up later responses only when practice was spaced daily or every other day, slowed them at other spacings, and untimed practice transferred better to unpractised, related facts (Jazbutis, Wiseheart, Radvansky & McNeil, 2023). The same think-aloud poker study found, unexpectedly, that novices did *better* under a time limit, so time pressure isn't automatically harmful either. The safe reading: understand a range first, then speed it up, and spread the speed work over days.

**In the app:**

- **Woodpecker preflop sets repeat exactly** and are the default set type. Suits don't change a preflop chart, so a mirrored repeat would be the same item anyway. Postflop sets keep mirror mode. Rest days between cycles are still encouraged.
- **Blitz defaults to preflop**, with postflop and mixed as options. Its intro says to learn the ranges slowly first (Training, Range Sketch) and to spread runs over days.
- **Training lets you focus** on preflop, postflop or every street, and Drills have preflop presets by seat (defend the big blind, steal from late position, tight early opens, facing 3-bets, 4-bets).
- Preflop families are keyed by **decision × seat** (e.g. "facing an open, from the BB"), so spaced repetition schedules exactly the charts you're weak on.

## 14. Range Sketch: drawing ranges before you see them

Reading ranges is the skill under every postflop decision, and the regular loop *shows* you the villain's range. Range Sketch removes that crutch. In order of action you draw the villain's range after each thing they do, and your own range after each thing you do. You can see your earlier drawings but not their accuracy until the hand is over, when each drawing is laid next to the real range from the solver.

- **Generation and pretesting.** Producing an answer before seeing it improves memory for the correct answer, even when the attempt is wrong (Slamecka & Graf, 1978; Kornell, Hays & Bjork, 2009; Richland, Kornell & Kao, 2009). Each drawing is a generation attempt; the reveal is the correction.
- **Delayed feedback for multi-step reasoning.** Showing accuracy after each step would let you adjust later drawings to earlier feedback instead of reasoning from the betting. Holding all feedback to the end keeps each drawing a genuine inference from the line, and the reveal then shows where the reasoning chain went wrong (too wide preflop, didn't narrow on the turn barrel, and so on).
- **Seeing your own earlier drawings** keeps the task about *narrowing* (each new range should be a subset of the last one for that player), which is how range reading works at the table.
- **Natural frequencies.** The reveal reports combos ("you drew 154 combos; the real range had 385") and lists the hand classes you left out or added, not just a percentage (Gigerenzer & Hoffrage, 1995).
- **Scoring.** Overlap = shared combos ÷ combos in either range (a weighted Jaccard index over combos, ignoring those the board blocks). It rewards the right shape and size together; drawing everything or nothing both score poorly.

## Progress metrics beyond accuracy

| Metric | Definition |
| --- | --- |
| Range score | 0.6 × hand-by-hand accuracy + 0.4 × balance (see README) |
| Tendencies | Your frequency minus the reference: aggression, bluff share, defence (continue %), raise %, big-bet share, thin-value betting with 50–80% equity hands |
| Bluff picking | Share of your bluff combos the reference also bluffs |
| Exploit capture | (EV of your range − EV of the equilibrium range) ÷ (EV of the best response − EV of the equilibrium range), against the exploitable villain |
| Calibration | Share of 75+ scores for each confidence level |
| Highlights | Hero call (call with < 45% equity, second pair or worse, solver calls ≥ 50%), brave bluff (≥ 70% pot bluff with < 25% equity vs callers), thin value, big laydown, blocker bluff, trap, exploit spotted |
| Fluency | Seconds per range build, rolling average |
| By street | Average score over the last 25 spots preflop, on the flop, turn and river |
| Sketch overlap | Shared combos ÷ combos in either range, per drawing, averaged over a range sketch |

## References

- Alfieri, L., Nokes-Malach, T. J., & Schunn, C. D. (2013). Learning through case comparisons: A meta-analytic review. *Educational Psychologist, 48*(2), 87–113.
- Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In *Metacognition: Knowing about knowing*.
- Brown, N., & Sandholm, T. (2019). Solving imperfect-information games via discounted regret minimization. *AAAI*.
- Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin, 145*(11).
- Butterfield, B., & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. *JEP: Learning, Memory, and Cognition, 27*(6).
- Carvalho, P. F., & Goldstone, R. L. (2014). Putting category learning in order: Category structure and temporal arrangement affect the benefit of interleaved over blocked study. *Memory & Cognition, 42*(3), 481–495.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin, 132*(3).
- Charness, N., Tuffiash, M., Krampe, R., Reingold, E., & Vasyukova, E. (2005). The role of deliberate practice in chess expertise. *Applied Cognitive Psychology, 19*.
- Chase, W. G., & Simon, H. A. (1973). Perception in chess. *Cognitive Psychology, 4*.
- Chen, B., & Ankenman, J. (2006). *The Mathematics of Poker*.
- Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin, 125*(6).
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1).
- Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. *Psychological Review, 100*(3).
- Gentner, D., Loewenstein, J., & Thompson, L. (2003). Learning and transfer: A general role for analogical encoding. *Journal of Educational Psychology, 95*(2).
- Gigerenzer, G., & Hoffrage, U. (1995). How to improve Bayesian reasoning without instruction: Frequency formats. *Psychological Review, 102*(4).
- Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research, 77*(1).
- Hogarth, R. M. (2001). *Educating Intuition*.
- Jazbutis, O. R., Wiseheart, M., Radvansky, G. A., & McNeil, N. M. (2023). Distributed practice and time pressure interact to affect learning and retention of arithmetic facts. *Journal of Numerical Cognition, 9*(2).
- Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science, 319*(5865), 966–968.
- Kahneman, D., & Klein, G. (2009). Conditions for intuitive expertise: A failure to disagree. *American Psychologist, 64*(6).
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist, 38*(1).
- Kellman, P. J., & Garrigan, P. (2009). Perceptual learning and human expertise. *Physics of Life Reviews, 6*(2).
- Kellman, P. J., Massey, C. M., & Son, J. Y. (2010). Perceptual learning modules in mathematics. *Topics in Cognitive Science, 2*(2).
- Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance. *Psychological Bulletin, 119*(2).
- Kornell, N. (2009). Optimising learning using flashcards: Spacing is more effective than cramming. *Applied Cognitive Psychology, 23*(9), 1297–1317.
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science, 19*(6).
- Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. *JEP: Learning, Memory, and Cognition, 35*(4).
- Laakasuo, M., Palomäki, J., & Salmela, M. (2015). Emotional and social factors influence poker decision making accuracy. *Journal of Gambling Studies, 31*.
- Logan, G. D. (1988). Toward an instance theory of automatization. *Psychological Review, 95*(4), 492–527.
- Macnamara, B. N., Hambrick, D. Z., & Oswald, F. L. (2014). Deliberate practice and performance in music, games, sports, education, and professions: A meta-analysis. *Psychological Science, 25*(8).
- Metcalfe, J. (2017). Learning from errors. *Annual Review of Psychology, 68*.
- Mettler, E., Massey, C. M., & Kellman, P. J. (2016). A comparison of adaptive and fixed schedules of practice. *Journal of Experimental Psychology: General, 145*(7).
- Palomäki, J., Laakasuo, M., Cowley, B. U., & Lappi, O. (2020). Poker as a domain of expertise. *Journal of Expertise, 3*(2).
- Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving. *Educational Psychologist, 38*(1).
- Rickard, T. C. (1997). Bending the power law: A CMPL theory of strategy shifts and the automatization of cognitive skills. *Journal of Experimental Psychology: General, 126*(3).
- Richland, L. E., Kornell, N., & Kao, L. S. (2009). The pretesting effect. *JEP: Applied, 15*(3).
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science, 17*(3).
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science, 35*.
- Rohrer, D., Taylor, K., Pashler, H., Wixted, J. T., & Cepeda, N. J. (2005). The effect of overlearning on long-term retention. *Applied Cognitive Psychology, 19*.
- Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation. *American Psychologist, 55*(1).
- Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. *Educational Psychology Review, 32*.
- Schneider, W., & Shiffrin, R. M. (1977). Controlled and automatic human information processing: I. Detection, search, and attention. *Psychological Review, 84*(1).
- Schwartz, D. L., & Bransford, J. D. (1998). A time for telling. *Cognition and Instruction, 16*(4).
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational Research, 78*(1).
- Slamecka, N. J., & Graf, P. (1978). The generation effect. *JEP: Human Learning and Memory, 4*(6).
- Smith, A., & Tikkanen, H. (2018). *The Woodpecker Method*. Quality Chess.
- St. Germain, J., & Tenenbaum, G. (2011). Decision-making and thought processes among poker players. *High Ability Studies, 22*(1), 3–17.
- Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications, 10*.
- Zinkevich, M., Johanson, M., Bowling, M., & Piccione, C. (2007). Regret minimization in games with incomplete information. *NeurIPS*.
