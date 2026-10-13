import { create } from 'zustand';
import type { SpotRequest } from '../engine/types';
import type { DrillFilters } from '../learning/selector';

export type Screen = 'home' | 'train' | 'drills' | 'blitz' | 'woodpecker' | 'sketch' | 'garden' | 'progress' | 'trophies' | 'shop' | 'learn' | 'settings';

export type SessionConfig =
  | { kind: 'regular' }
  | { kind: 'drill'; filters: DrillFilters; title: string }
  | { kind: 'review' }
  | { kind: 'woodpecker'; setId: string }
  | { kind: 'replay'; request: SpotRequest; title?: string }
  /** Range sketch: draw every range on the way to the decision yourself. */
  | { kind: 'sketch'; filters?: DrillFilters; title?: string };

interface Nav {
  screen: Screen;
  session: SessionConfig;
  /** Bumped on every navigation so the trainer remounts for a new session. */
  key: number;
  go: (screen: Screen, session?: SessionConfig) => void;
}

export const useNav = create<Nav>((set, get) => ({
  screen: 'home',
  session: { kind: 'regular' },
  key: 0,
  go: (screen, session) => {
    set({ screen, session: session ?? get().session, key: get().key + 1 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
}));
