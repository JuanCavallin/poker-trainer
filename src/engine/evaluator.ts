/**
 * Hand evaluator for 5-7 cards. Returns an integer where higher is better:
 *   value = category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5
 */
export const CAT = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export const CAT_NAMES = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Straight flush'];

export const categoryOf = (value: number): number => value >> 20;

/** STRAIGHT_HIGH[mask] = rank index of the straight's top card, or -1. Wheel = 3 (five-high). */
export const STRAIGHT_HIGH = new Int8Array(8192);
for (let m = 0; m < 8192; m++) {
  let hi = -1;
  for (let h = 12; h >= 4; h--) {
    const w = 0x1f << (h - 4);
    if ((m & w) === w) {
      hi = h;
      break;
    }
  }
  if (hi < 0 && (m & 0x100f) === 0x100f) hi = 3;
  STRAIGHT_HIGH[m] = hi;
}

const rc = new Uint8Array(13);
const sc = new Uint8Array(4);
const sm = new Uint16Array(4);

export function evaluate(cards: ArrayLike<number>, n: number = cards.length): number {
  rc.fill(0);
  sc.fill(0);
  sm.fill(0);
  let rmask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rc[r]++;
    sc[s]++;
    sm[s] |= 1 << r;
    rmask |= 1 << r;
  }

  let fs = -1;
  for (let s = 0; s < 4; s++) {
    if (sc[s] >= 5) {
      fs = s;
      break;
    }
  }
  if (fs >= 0) {
    const sh = STRAIGHT_HIGH[sm[fs]];
    if (sh >= 0) return (8 << 20) | (sh << 16);
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = rc[r];
    if (k === 4) {
      if (quad < 0) quad = r;
    } else if (k === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (k === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
    }
  }

  if (quad >= 0) {
    let kick = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== quad && rc[r] > 0) {
        kick = r;
        break;
      }
    }
    return (7 << 20) | (quad << 16) | (kick << 12);
  }

  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const p = Math.max(trip2, pair1);
    return (6 << 20) | (trip1 << 16) | (p << 12);
  }

  if (fs >= 0) {
    let v = 5 << 20;
    let shift = 16;
    for (let r = 12; r >= 0 && shift >= 0; r--) {
      if (sm[fs] & (1 << r)) {
        v |= r << shift;
        shift -= 4;
      }
    }
    return v;
  }

  const st = STRAIGHT_HIGH[rmask];
  if (st >= 0) return (4 << 20) | (st << 16);

  if (trip1 >= 0) {
    let v = (3 << 20) | (trip1 << 16);
    let shift = 12;
    for (let r = 12; r >= 0 && shift >= 8; r--) {
      if (r !== trip1 && rc[r] > 0) {
        v |= r << shift;
        shift -= 4;
      }
    }
    return v;
  }

  if (pair1 >= 0 && pair2 >= 0) {
    let kick = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== pair1 && r !== pair2 && rc[r] > 0) {
        kick = r;
        break;
      }
    }
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (kick << 8);
  }

  if (pair1 >= 0) {
    let v = (1 << 20) | (pair1 << 16);
    let shift = 12;
    for (let r = 12; r >= 0 && shift >= 4; r--) {
      if (r !== pair1 && rc[r] > 0) {
        v |= r << shift;
        shift -= 4;
      }
    }
    return v;
  }

  let v = 0;
  let shift = 16;
  for (let r = 12; r >= 0 && shift >= 0; r--) {
    if (rc[r] > 0) {
      v |= r << shift;
      shift -= 4;
    }
  }
  return v;
}

const scratch7 = new Int32Array(7);

/** Evaluates a 5-card board plus two hole cards without allocating. */
export function evaluateWith(board: ArrayLike<number>, c1: number, c2: number): number {
  const n = board.length;
  for (let i = 0; i < n; i++) scratch7[i] = board[i];
  scratch7[n] = c1;
  scratch7[n + 1] = c2;
  return evaluate(scratch7, n + 2);
}
