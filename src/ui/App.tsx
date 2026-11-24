import { useCallback, useEffect, useMemo, useState } from 'react';
import { translator, type TKey } from '../i18n';
import { DEFAULT_SETTINGS, type Settings as S } from '../lib/settings';
import { ensureProfile, getSetting, setSetting } from '../lib/storage/repo';
import { db, type Profile } from '../lib/storage/db';
import { AppCtx, type Route } from './AppContext';
import { Icon, type IconName } from './icons';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { Games } from './screens/Games';
import { Settings } from './screens/Settings';
import { AcademyHome, OpeningPage, QuizScreen, StageScreen } from './academy/Academy';
import { LessonScreen, TopicPage } from './lessons/Lessons';
import { PuzzlesHome, PuzzleSolve, PuzzleStatsScreen } from './puzzles/Puzzles';
import { Coaches, CoachDetail } from './coach/CoachScreens';
import { CoachGame } from './coach/CoachGame';
import { CoachChat, AiSettings } from './coach/CoachChat';
import { AnalyzePgn } from './analysis/AnalyzePgn';
import { Analysis } from './analysis/Analysis';

const NAV: { route: Route['name']; key: TKey; icon: IconName }[] = [
  { route: 'coaches', key: 'nav_coaches', icon: 'person' },
  { route: 'puzzles', key: 'nav_puzzles', icon: 'puzzle' },
  { route: 'home', key: 'nav_home', icon: 'home' },
  { route: 'openings', key: 'nav_openings', icon: 'book' },
  { route: 'settings', key: 'nav_settings', icon: 'settings' },
];

export function App() {
  const [settings, setSettingsState] = useState<S | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [toastMsg, setToastMsg] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [navKey, setNavKey] = useState(0);

  useEffect(() => {
    (async () => {
      // Ask the browser not to evict our IndexedDB under storage pressure.
      try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
      const stored = await getSetting<Partial<S>>('settings', {});
      const s = { ...DEFAULT_SETTINGS, ...stored };
      // v2: the redesigned green board and bold pieces become the default once
      if (!stored.v || stored.v < 2) { s.boardTheme = 'green'; s.pieceSet = 'chessnut'; }
      // v3: analysis depth 12 = the depth the classification models were calibrated at
      // v4: deeper full analysis (depth 18, ≤3 s per position) so evaluations are closer to Lichess/Chess.com
      if (!stored.v || stored.v < 4) { s.analysisDepth = 18; s.analysisMoveTimeMs = 3000; s.v = 4; await setSetting('settings', s); }
      setSettingsState(s);
      setProfile(await ensureProfile(translator(s.lang)('defaultName')));
    })();
  }, []);

  const t = useMemo(() => translator(settings?.lang ?? 'ar'), [settings?.lang]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.lang = settings.lang;
    document.documentElement.dir = settings.lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  const setSettings = useCallback((patch: Partial<S>) => {
    setSettingsState((prev) => {
      const next = { ...(prev ?? DEFAULT_SETTINGS), ...patch };
      setSetting('settings', next);
      return next;
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfile((await db().profile.get('me')) ?? null);
  }, []);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2600);
  }, []);

  if (!settings) return <div className="boot">♞</div>;

  const ctx = {
    t, settings, setSettings, profile, refreshProfile, toast,
    go: (r: Route) => { setRoute(r); setNavKey((k) => k + 1); window.scrollTo(0, 0); },
    dataVersion, bumpData: () => setDataVersion((v) => v + 1),
  };

  const screen = (() => {
    switch (route.name) {
      case 'home': return <Home />;
      case 'play': return <Play key={navKey} resume={route.resume} />;
      case 'games': return <Games openId={route.openId} />;
      case 'settings': return <Settings />;
      case 'coaches': return <Coaches />;
      case 'puzzles': return <PuzzlesHome />;
      case 'puzzle': return <PuzzleSolve key={navKey} cat={route.cat} rows={route.rows} />;
      case 'puzzleStats': return <PuzzleStatsScreen />;
      case 'openings': return <AcademyHome />;
      case 'opening': return <OpeningPage key={route.id} id={route.id} />;
      case 'openingStage': return <StageScreen key={navKey} id={route.id} stage={route.stage} />;
      case 'openingQuiz': return <QuizScreen key={navKey} id={route.id} />;
      case 'topic': return <TopicPage key={route.id} id={route.id} />;
      case 'lesson': return <LessonScreen key={navKey} id={route.id} />;
      case 'coach': return <CoachDetail id={route.id} />;
      case 'coachGame': return <CoachGame key={navKey} id={route.id} resume={route.resume} />;
      case 'coachChat': return <CoachChat key={route.id} id={route.id} />;
      case 'aiSettings': return <AiSettings />;
      case 'analysis': return <Analysis key={route.gameId} gameId={route.gameId} autostart={route.autostart} />;
      case 'analyzePgn': return <AnalyzePgn />;
    }
  })();

  const activeNav = ['play', 'coach', 'coachGame', 'coachChat'].includes(route.name) ? 'coaches' : ['games', 'analysis', 'analyzePgn'].includes(route.name) ? 'home' : ['puzzle', 'puzzleStats'].includes(route.name) ? 'puzzles' : ['opening', 'openingStage', 'openingQuiz', 'topic', 'lesson'].includes(route.name) ? 'openings' : route.name === 'aiSettings' ? 'settings' : route.name;

  return (
    <AppCtx.Provider value={ctx}>
      <main className="main" data-section={activeNav}>{screen}</main>
      <nav className="tabbar" data-section={activeNav}>
        {NAV.map((n) => (
          <button key={n.route} className={activeNav === n.route ? 'on' : ''} onClick={() => ctx.go({ name: n.route } as Route)} data-testid={'nav-' + n.route}>
            <Icon name={n.icon} />
            <span>{t(n.key)}</span>
          </button>
        ))}
      </nav>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}
