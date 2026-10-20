import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { CAT, categoryOf, evaluate } from './evaluator';
import { classLabel, comboClass, comboStr, NUM_COMBOS } from './combos';
import { parseRange, rangeCombos } from './range';

const ev = (s: string) => evaluate(parseCards(s));

describe('evaluator', () => {
  it('counts every 5-card hand category exactly', () => {
    const counts = new Array(9).fill(0);
    const distinct = new Set<number>();
    const h = new Int32Array(5);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
              const v = evaluate(h, 5);
              counts[categoryOf(v)]++;
              distinct.add(v);
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
    expect(distinct.size).toBe(7462);
  });

  it('orders tricky 7-card hands correctly', () => {
    expect(categoryOf(ev('AsKsQsJsTs2c3d'))).toBe(CAT.STRAIGHT_FLUSH);
    expect(categoryOf(ev('As2s3s4s5sKdKc'))).toBe(CAT.STRAIGHT_FLUSH);
    expect(ev('5s6s7s8s9s')).toBeGreaterThan(ev('As2s3s4s5s'));
    // Wheel loses to six-high straight.
    expect(ev('Ad2c3h4s5d')).toBeLessThan(ev('2c3h4s5d6c'));
    // Two trips make a full house with the higher trips.
    expect(categoryOf(ev('AsAdAcKsKdKc2h'))).toBe(CAT.FULL_HOUSE);
    expect(ev('AsAdAcKsKdKc2h')).toBe(ev('AsAdAhKsKd3c4h'));
    // Three pairs: best two pairs plus best kicker.
    expect(ev('AsAdKsKdQsQd2h')).toBe(ev('AhAcKhKcQh3c4d'));
    expect(ev('AsAdKsKd7s7d6h')).toBeLessThan(ev('AhAcKhKc8h3c4d'));
    // Kicker matters for one pair.
    expect(ev('AsAdKs9d7h4c2c')).toBeGreaterThan(ev('AhAcQh9c7d4h2d'));
    // Flush beats straight, and a flush uses its top five cards.
    expect(ev('2h4h6h8hTh9c7d')).toBeGreaterThan(ev('Tc9s8d7h6c2d3s'));
    expect(ev('AhKh9h7h5h3h2h')).toBe(ev('AhKh9h7h5hQc2c'));
  });
});

describe('combos and ranges', () => {
  it('maps combos to the 13x13 grid', () => {
    const classCounts = new Array(169).fill(0);
    for (let i = 0; i < NUM_COMBOS; i++) classCounts[comboClass[i]]++;
    expect(classCounts.filter((n) => n === 6).length).toBe(13);
    expect(classCounts.filter((n) => n === 4).length).toBe(78);
    expect(classCounts.filter((n) => n === 12).length).toBe(78);
    expect(classLabel(0)).toBe('AA');
    expect(classLabel(1)).toBe('AKs');
    expect(classLabel(13)).toBe('AKo');
    expect(classLabel(168)).toBe('22');
  });

  it('parses range syntax', () => {
    expect(rangeCombos(parseRange('AA'))).toBe(6);
    expect(rangeCombos(parseRange('22+'))).toBe(78);
    expect(rangeCombos(parseRange('A2s+'))).toBe(48);
    expect(rangeCombos(parseRange('KTo+'))).toBe(36);
    expect(rangeCombos(parseRange('A5s-A2s'))).toBe(16);
    expect(rangeCombos(parseRange('99-66'))).toBe(24);
    expect(rangeCombos(parseRange('AK'))).toBe(16);
    expect(rangeCombos(parseRange('AKs:0.5'))).toBe(2);
    const r = parseRange('AsKs');
    let found = '';
    for (let i = 0; i < NUM_COMBOS; i++) if (r[i] > 0) found = comboStr(i);
    expect(found).toBe('AsKs');
  });
});
