/**
 * Preflop scenarios with approximate 100bb 6-max ranges. They only seed the
 * street-by-street simulation that produces river ranges, so "close to standard"
 * is the goal rather than solver-exact charts.
 */
export interface Scenario {
  id: string;
  name: string;
  potType: 'SRP' | '3BP';
  oopPos: string;
  ipPos: string;
  /** Side that made the last preflop raise (0 = OOP, 1 = IP). */
  aggressor: 0 | 1;
  oopRange: string;
  ipRange: string;
  pot: number;
  stack: number;
  preflop: string;
}

const BTN_OPEN =
  '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o';
const BB_CALL_VS_BTN =
  '99-22, AJs-A6s, A2s, K2s-KJs, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, AJo-A2o, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o, 65o, ' +
  'TT:0.3, AQs:0.3, AQo:0.5, KQs:0.5, KQo:0.7, A5s:0.4, A4s:0.5, A3s:0.6';

const CO_OPEN = '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo';
const BTN_FLAT_VS_CO =
  'TT-55, 44-22:0.6, AJs-ATs, A9s:0.5, A5s:0.5, A4s:0.5, KQs:0.5, KJs-KTs, QJs, QTs, JTs, J9s, T9s, 98s, 87s, 76s, 65s:0.6, AQo:0.6, AJo:0.4, KQo:0.6, JJ:0.3, AQs:0.4';

const SB_OPEN =
  '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K5o+, Q8o+, J8o+, T8o+, 98o, 87o';
const BB_CALL_VS_SB =
  'JJ-22, AJs-A2s, K2s+, Q2s+, J2s+, T4s+, 95s+, 85s+, 74s+, 63s+, 52s+, 42s+, 32s, ATo-A2o, K2o+, Q5o+, J7o+, T7o+, 97o+, 86o+, 75o+, 65o, 54o, ' +
  'QQ:0.3, AQs:0.5, AKo:0.3, AJo:0.6, AQo:0.5';

const BB_3BET_VS_BTN =
  'TT+, AJs+, KQs, AQo+, A5s-A3s:0.6, KJs:0.5, QJs:0.4, JTs:0.3, 76s:0.3, 65s:0.3, K9s:0.25, AJo:0.3, KQo:0.3';
const BTN_CALL_3BET =
  'JJ-66, 55-22:0.5, AQs-A9s, A5s:0.5, A4s:0.5, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, 65s:0.6, AQo, AJo:0.5, KQo:0.6, QQ:0.4, AKs:0.3, AKo:0.3';

export const SCENARIOS: Scenario[] = [
  {
    id: 'btn-bb',
    name: 'BTN vs BB',
    potType: 'SRP',
    oopPos: 'BB',
    ipPos: 'BTN',
    aggressor: 1,
    oopRange: BB_CALL_VS_BTN,
    ipRange: BTN_OPEN,
    pot: 5.5,
    stack: 97.5,
    preflop: 'BTN raises to 2.5bb, SB folds, BB calls',
  },
  {
    id: 'co-btn',
    name: 'CO vs BTN',
    potType: 'SRP',
    oopPos: 'CO',
    ipPos: 'BTN',
    aggressor: 0,
    oopRange: CO_OPEN,
    ipRange: BTN_FLAT_VS_CO,
    pot: 6.5,
    stack: 97.5,
    preflop: 'CO raises to 2.5bb, BTN calls, blinds fold',
  },
  {
    id: 'sb-bb',
    name: 'SB vs BB',
    potType: 'SRP',
    oopPos: 'SB',
    ipPos: 'BB',
    aggressor: 0,
    oopRange: SB_OPEN,
    ipRange: BB_CALL_VS_SB,
    pot: 6,
    stack: 97,
    preflop: 'Folds to SB, SB raises to 3bb, BB calls',
  },
  {
    id: 'btn-bb-3bp',
    name: 'BTN vs BB 3-bet pot',
    potType: '3BP',
    oopPos: 'BB',
    ipPos: 'BTN',
    aggressor: 0,
    oopRange: BB_3BET_VS_BTN,
    ipRange: BTN_CALL_3BET,
    pot: 22.5,
    stack: 89,
    preflop: 'BTN raises to 2.5bb, BB 3-bets to 11bb, BTN calls',
  },
];

export const scenarioById = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
