import { createContext, useContext } from 'react';
import type { T } from '../i18n';
import type { Settings } from '../lib/settings';
import type { Profile } from '../lib/storage/db';

export type Route =
  | { name: 'home' }
  | { name: 'coaches' }
  | { name: 'puzzles' }
  | { name: 'puzzle'; cat: string; rows?: number[] }
  | { name: 'puzzleStats' }
  | { name: 'openings' }
  | { name: 'opening'; id: string }
  | { name: 'openingStage'; id: string; stage: number }
  | { name: 'openingQuiz'; id: string }
  | { name: 'topic'; id: string }
  | { name: 'lesson'; id: string }
  | { name: 'settings' }
  | { name: 'play'; resume?: boolean }
  | { name: 'games'; openId?: number }
  | { name: 'coach'; id: string }
  | { name: 'coachGame'; id: string; resume?: boolean }
  | { name: 'coachChat'; id: string }
  | { name: 'aiSettings' }
  | { name: 'analysis'; gameId: number; autostart?: boolean }
  | { name: 'analyzePgn' };

export interface Ctx {
  t: T;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  go: (r: Route) => void;
  toast: (msg: string) => void;
  /** bumps whenever data changes, so screens re-query */
  dataVersion: number;
  bumpData: () => void;
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);
