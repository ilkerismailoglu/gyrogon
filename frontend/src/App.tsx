import {
  BoardLayout,
  DEFAULT_LAYOUT,
  DEFAULT_SIDES,
  GameMode,
  HexacoreSimulator,
  PolygonSides,
  SUPPORTED_SIDES,
  isSupportedLayout,
  isSupportedSides
} from '@hexacore/game-core';
import {
  Award,
  CalendarCheck2,
  CheckCircle2,
  Coins,
  Flame,
  Flower2,
  HelpCircle,
  Hexagon,
  Home,
  Layers,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Trash2,
  Trophy,
  User,
  Volume2,
  VolumeX,
  WifiOff,
  Zap
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { synthAudio } from './audio/SynthAudioEngine';
import { HexCanvasView, HudUpdatePayload } from './canvas/HexCanvasView';
import { Tooltip } from './components/Tooltip';
import { showRewardedAd } from './services/adBridge';
import {
  DailyChallengeInfo,
  LeaderboardBoard,
  LeaderboardData,
  SocialProvider,
  StartSessionResponse,
  SubmitSessionResponse,
  claimDailyStreak,
  claimQuestApi,
  deleteMyAccountApi,
  ensureGuestAuth,
  equipThemeApi,
  fetchDailyChallenge,
  fetchLeaderboard,
  fetchPlayerProfile,
  linkSocialAccountApi,
  purchaseThemeApi,
  startSession,
  submitSession,
  syncPendingReplays,
  updateServerDisplayName
} from './services/api';
import {
  getPlatformLabel,
  initNativeShell,
  subscribeAppLifecycle
} from './services/nativeBridge';
import { getPendingReplayCount } from './services/offlineQueue';
import { THEMES, ThemeId } from './themes/themes';

interface QuestState {
  id: string;
  title: string;
  target: number;
  progress: number;
  rewardCoins: number;
  claimed: boolean;
}

const DEFAULT_STREAK_REWARDS = [25, 40, 60, 80, 100, 125, 200];

const POLYGON_LABELS: Record<PolygonSides, string> = {
  3: 'Üçgen',
  4: 'Kare',
  5: 'Beşgen',
  6: 'Altıgen',
  7: 'Yedigen',
  8: 'Sekizgen'
};

const STORAGE_KEYS = {
  HIGH_CLASSIC: 'hexacore_high_classic_v2',
  HIGH_DAILY: 'hexacore_high_daily_v2',
  HIGH_BY_POLY: 'hexacore_high_poly_v1',
  SIDES: 'hexacore_sides_v1',
  LAYOUT: 'hexacore_layout_v1',
  COINS: 'hexacore_coins_v2',
  UNLOCKED_THEMES: 'hexacore_themes_v3',
  EQUIPPED_THEME: 'hexacore_equipped_theme_v3',
  PLAYER_NAME: 'hexacore_player_name_v2',
  QUESTS: 'hexacore_quests_v2',
  STREAK: 'hexacore_streak_v2'
};

function createInitialQuests(dateStr: string): { date: string; items: QuestState[] } {
  return {
    date: dateStr,
    items: [
      { id: 'q-blocks', title: '30 Blok Patlat', target: 30, progress: 0, rewardCoins: 40, claimed: false },
      { id: 'q-combo', title: 'x4 Kombo Yakala', target: 4, progress: 0, rewardCoins: 50, claimed: false },
      { id: 'q-score', title: '1.200 Puana Ulaş', target: 1200, progress: 0, rewardCoins: 75, claimed: false }
    ]
  };
}

function loadQuests(): QuestState[] {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUESTS);
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; items: QuestState[] };
      if (parsed.date === today && Array.isArray(parsed.items)) {
        return parsed.items;
      }
    }
  } catch {
    // Fallback
  }
  const fresh = createInitialQuests(today);
  localStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify(fresh));
  return fresh.items;
}

function loadLocalStreak(): { streakCount: number; lastClaimDate: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STREAK);
    if (raw) {
      return JSON.parse(raw) as { streakCount: number; lastClaimDate: string | null };
    }
  } catch {
    // ignore
  }
  return { streakCount: 0, lastClaimDate: null };
}

function formatTurkishDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long'
  }).format(parsed);
}

function formatLeaderboardPeriod(board: LeaderboardBoard, periodKey: string): string {
  if (board === 'classic' || periodKey === 'all-time') {
    return 'Tüm Zamanlar';
  }

  if (board === 'daily') {
    const today = new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
      const label = formatTurkishDate(periodKey);
      return periodKey === today ? `Bugün · ${label}` : label;
    }
    return 'Bugün';
  }

  // Weekly ISO week format: YYYY-Www -> Pazartesi - Pazar aralığı (örn: Bu Hafta · 16–22 Kas)
  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (match) {
    const year = Number(match[1]);
    const week = Number(match[2]);
    // Jan 4 is always in ISO week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
    const start = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);

    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const shortFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
    const rangeText = sameMonth
      ? `${start.getUTCDate()}–${shortFmt.format(end)}`
      : `${shortFmt.format(start)} – ${shortFmt.format(end)}`;
    return `Bu Hafta · ${rangeText}`;
  }

  return 'Bu Hafta';
}

export const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>('classic');
  const [sides, setSides] = useState<PolygonSides>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEYS.SIDES));
    return isSupportedSides(saved) ? saved : DEFAULT_SIDES;
  });
  const [layout, setLayout] = useState<BoardLayout>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LAYOUT);
    return isSupportedLayout(saved) ? saved : DEFAULT_LAYOUT;
  });
  const [phase, setPhase] = useState<'MENU' | 'PLAYING' | 'PAUSED' | 'REVIVE_OFFER' | 'GAMEOVER'>('MENU');
  const [simulator, setSimulator] = useState<HexacoreSimulator | null>(null);
  const sessionRef = useRef<StartSessionResponse | null>(null);

  const [playerName, setPlayerName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.PLAYER_NAME) || 'GyroPilot'
  );
  const [coins, setCoins] = useState<number>(() =>
    parseInt(localStorage.getItem(STORAGE_KEYS.COINS) || '100', 10)
  );
  const [highScores, setHighScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {
      'classic:6': parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_CLASSIC) || '0', 10),
      'daily:6': parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_DAILY) || '0', 10)
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HIGH_BY_POLY);
      if (raw) {
        return { ...initial, ...(JSON.parse(raw) as Record<string, number>) };
      }
    } catch {
      // fallback
    }
    return initial;
  });

  const [unlockedThemes, setUnlockedThemes] = useState<ThemeId[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.UNLOCKED_THEMES);
      if (raw) {
        const parsed = JSON.parse(raw) as ThemeId[];
        return Array.from(new Set<ThemeId>(['hextris', 'cyberpunk', ...parsed]));
      }
    } catch {
      // fallback
    }
    return ['hextris', 'cyberpunk'];
  });
  const [equippedTheme, setEquippedTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.EQUIPPED_THEME) as ThemeId | null;
    return saved && saved in THEMES ? saved : 'hextris';
  });

  const initialStreak = loadLocalStreak();
  const [streakCount, setStreakCount] = useState<number>(initialStreak.streakCount);
  const [lastStreakDate, setLastStreakDate] = useState<string | null>(initialStreak.lastClaimDate);
  const [streakRewards, setStreakRewards] = useState<number[]>(DEFAULT_STREAK_REWARDS);

  const [soundOn, setSoundOn] = useState(true);
  const [hud, setHud] = useState<HudUpdatePayload>({
    score: 0,
    combo: 1,
    comboRatio: 0,
    maxCombo: 1,
    blocksCleared: 0,
    coinsEarned: 0,
    freezeSecondsLeft: 0,
    danger: false
  });

  const [quests, setQuests] = useState<QuestState[]>(() => loadQuests());
  const [dailyInfo, setDailyInfo] = useState<DailyChallengeInfo | null>(null);
  const [verificationResult, setVerificationResult] = useState<SubmitSessionResponse | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const prevBestRef = useRef(0);
  const [activeModal, setActiveModal] = useState<'none' | 'help' | 'shop' | 'leaderboard' | 'quests' | 'streak' | 'account'>('none');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [lbBoard, setLbBoard] = useState<LeaderboardBoard>('classic');
  const [lbSides, setLbSides] = useState<PolygonSides>(DEFAULT_SIDES);
  const [startingGame, setStartingGame] = useState(false);
  const [playerId, setPlayerId] = useState<string | undefined>(undefined);
  const [linkedProviders, setLinkedProviders] = useState({ apple: false, google: false, facebook: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const canClaimStreakToday = lastStreakDate !== todayStr;
  const activeTheme = THEMES[equippedTheme] ?? THEMES.hextris;
  const isLight = activeTheme.isLight;
  const scoreKey = layout === 'polygon' ? `${mode}:${sides}` : `${mode}:${sides}:${layout}`;
  const activeHighScore = highScores[scoreKey] ?? 0;

  // Keep document background & theme-color synced with active theme
  useEffect(() => {
    document.body.style.backgroundColor = activeTheme.canvasBg;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', activeTheme.canvasBg);
    }
  }, [activeTheme]);

  // Native shell + online/offline queue sync + Guest JWT bootstrap
  useEffect(() => {
    void initNativeShell();
    void fetchDailyChallenge().then(setDailyInfo);
    void getPendingReplayCount().then(setPendingSyncCount);

    const bootstrap = async () => {
      await ensureGuestAuth(playerName);
      const synced = await syncPendingReplays();
      if (synced > 0) {
        setPendingSyncCount(await getPendingReplayCount());
      }
      const res = await fetchPlayerProfile();
      if (!res) return;
      const { player, quests: serverQuests, streakRewards: rewards } = res;
      setPlayerId(player.id);
      setCoins(player.hexaCoins);
      setStreakCount(player.streakCount);
      setLastStreakDate(player.lastStreakClaimDate);
      if (player.linkedProviders) setLinkedProviders(player.linkedProviders);
      if (rewards.length === 7) setStreakRewards(rewards);
      setHighScores((prev) => ({
        ...prev,
        'classic:6': Math.max(prev['classic:6'] ?? 0, player.highScoreClassic),
        'daily:6': Math.max(prev['daily:6'] ?? 0, player.highScoreDaily)
      }));

      const validUnlocked = player.unlockedItems.filter((c): c is ThemeId => c in THEMES);
      if (validUnlocked.length > 0) {
        setUnlockedThemes(Array.from(new Set<ThemeId>(['hextris', 'cyberpunk', ...validUnlocked])));
      }
      if (player.equippedTheme in THEMES) {
        setEquippedTheme(player.equippedTheme as ThemeId);
      }

      if (serverQuests.length > 0) {
        setQuests(
          serverQuests.map((q) => ({
            id: q.questCode,
            title: q.title,
            target: q.target,
            progress: q.progress,
            rewardCoins: q.rewardCoins,
            claimed: q.claimed
          }))
        );
      }
    };
    void bootstrap();

    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingReplays().then(async () => {
        setPendingSyncCount(await getPendingReplayCount());
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COINS, String(coins));
  }, [coins]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SIDES, String(sides));
  }, [sides]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LAYOUT, layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HIGH_BY_POLY, JSON.stringify(highScores));
  }, [highScores]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.UNLOCKED_THEMES, JSON.stringify(unlockedThemes));
  }, [unlockedThemes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EQUIPPED_THEME, equippedTheme);
  }, [equippedTheme]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.STREAK,
      JSON.stringify({ streakCount, lastClaimDate: lastStreakDate })
    );
  }, [lastStreakDate, streakCount]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify({ date: today, items: quests }));
  }, [quests]);

  // Auto-pause when tab or native app moves to background
  useEffect(() => {
    return subscribeAppLifecycle(() => {
      if (phase === 'PLAYING') {
        setPhase('PAUSED');
        synthAudio.suspend();
      }
    });
  }, [phase]);

  const handleStartGame = useCallback(
    async (selectedMode: GameMode = mode, selectedSides: PolygonSides = sides) => {
      synthAudio.unlock();
      setStartingGame(true);
      setMode(selectedMode);
      setSides(selectedSides);
      setVerificationResult(null);
      setIsNewRecord(false);
      const startKey =
        layout === 'polygon'
          ? `${selectedMode}:${selectedSides}`
          : `${selectedMode}:${selectedSides}:${layout}`;
      prevBestRef.current = highScores[startKey] ?? 0;

      void updateServerDisplayName(playerName);
      const session = await startSession(selectedMode, playerName, selectedSides);
      sessionRef.current = session;

      const sim = new HexacoreSimulator(session.seed, selectedSides);
      setSimulator(sim);
      setHud({
        score: 0,
        combo: 1,
        comboRatio: 0,
        maxCombo: 1,
        blocksCleared: 0,
        coinsEarned: 0,
        freezeSecondsLeft: 0,
        danger: false
      });
      setPhase('PLAYING');
      setStartingGame(false);
    },
    [highScores, layout, mode, playerName, sides]
  );

  const finalizeGameOver = useCallback(
    async (sim: HexacoreSimulator) => {
      setPhase('GAMEOVER');

      const key = layout === 'polygon' ? `${mode}:${sim.sides}` : `${mode}:${sim.sides}:${layout}`;
      setIsNewRecord(sim.score > 0 && sim.score > prevBestRef.current);
      setHighScores((prev) => {
        if (sim.score <= (prev[key] ?? 0)) return prev;
        return { ...prev, [key]: sim.score };
      });
      if (layout === 'polygon' && sim.sides === 6 && mode === 'classic') {
        localStorage.setItem(STORAGE_KEYS.HIGH_CLASSIC, String(Math.max(activeHighScore, sim.score)));
      } else if (layout === 'polygon' && sim.sides === 6 && mode === 'daily') {
        localStorage.setItem(STORAGE_KEYS.HIGH_DAILY, String(Math.max(activeHighScore, sim.score)));
      }

      if (sessionRef.current) {
        const res = await submitSession({
          session: sessionRef.current,
          claimedScore: sim.score,
          moves: sim.recordedMoves,
          playerName
        });
        setVerificationResult(res);

        if (res.player) {
          setCoins(res.player.hexaCoins);
        } else if (res.verified && res.coinsEarned > 0) {
          setCoins((c) => c + res.coinsEarned);
        }

        if (res.quests && res.quests.length > 0) {
          setQuests(
            res.quests.map((q) => ({
              id: q.questCode,
              title: q.title,
              target: q.target,
              progress: q.progress,
              rewardCoins: q.rewardCoins,
              claimed: q.claimed
            }))
          );
          return;
        }
      }

      setQuests((prev) =>
        prev.map((q) => {
          if (q.id === 'q-blocks') {
            return { ...q, progress: Math.min(q.target, q.progress + sim.blocksCleared) };
          }
          if (q.id === 'q-combo') {
            return { ...q, progress: Math.min(q.target, Math.max(q.progress, sim.maxCombo)) };
          }
          if (q.id === 'q-score') {
            return { ...q, progress: Math.min(q.target, Math.max(q.progress, sim.score)) };
          }
          return q;
        })
      );
    },
    [activeHighScore, layout, mode, playerName]
  );

  const handleEngineGameOver = useCallback(() => {
    if (!simulator) return;
    if (simulator.revivesUsed === 0 && simulator.score > 0) {
      setPhase('REVIVE_OFFER');
    } else {
      void finalizeGameOver(simulator);
    }
  }, [finalizeGameOver, simulator]);

  const handleRevive = async (method: 'coins' | 'ad') => {
    if (!simulator) return;
    if (method === 'coins') {
      if (coins < 50) return;
      setCoins((c) => c - 50);
    } else {
      const adRes = await showRewardedAd('revive', playerId);
      if (!adRes.completed) return;
    }
    simulator.applyMove('REVIVE');
    synthAudio.play('revive');
    synthAudio.vibrate([20, 40, 20]);
    setPhase('PLAYING');
  };

  const handleDeclineRevive = () => {
    if (!simulator) return;
    void finalizeGameOver(simulator);
  };

  const handleLinkSocial = async (provider: SocialProvider) => {
    setAccountMessage(null);
    const devToken = `dev:${provider}-${playerName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pilot'}:${playerName}`;
    const res = await linkSocialAccountApi(provider, devToken);
    if (res) {
      setPlayerId(res.player.id);
      setCoins(res.player.hexaCoins);
      if (res.player.linkedProviders) setLinkedProviders(res.player.linkedProviders);
      setAccountMessage(
        res.merged
          ? `${provider.toUpperCase()} hesabı birleştirildi! Mevcut ilerlemen ve coinlerin korundu.`
          : `${provider.toUpperCase()} hesabı başarıyla bağlandı.`
      );
      synthAudio.play('joker');
    } else {
      setAccountMessage('Sunucuya bağlanılamadı. Çevrimdışı modda hesap bağlama yapılamaz.');
    }
  };

  const handleDeleteAccount = async () => {
    await deleteMyAccountApi();
    setConfirmDelete(false);
    setActiveModal('none');
    setCoins(100);
    setHighScores({});
    setStreakCount(0);
    setLastStreakDate(null);
    setUnlockedThemes(['hextris', 'cyberpunk']);
    setEquippedTheme('hextris');
    setLinkedProviders({ apple: false, google: false, facebook: false });
    setSimulator(null);
    setPhase('MENU');
  };

  const handleRotate = useCallback(
    (dir: -1 | 1) => {
      if (!simulator || phase !== 'PLAYING') return;
      synthAudio.unlock();
      simulator.applyMove(dir === -1 ? 'ROTATE_LEFT' : 'ROTATE_RIGHT');
      synthAudio.play('rotate');
      synthAudio.vibrate(8);
    },
    [phase, simulator]
  );

  const handleFastDropChange = useCallback(
    (active: boolean) => {
      if (!simulator || phase !== 'PLAYING') return;
      simulator.applyMove(active ? 'FAST_DROP_ON' : 'FAST_DROP_OFF');
    },
    [phase, simulator]
  );

  // Keyboard shortcuts (including Enter/Space to start like original Hextris)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeModal !== 'none') {
        if (e.key === 'Escape') {
          setActiveModal('none');
        }
        return;
      }
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (phase === 'MENU' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        void handleStartGame(mode);
        return;
      }

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phase === 'PLAYING') setPhase('PAUSED');
        else if (phase === 'PAUSED') setPhase('PLAYING');
        return;
      }

      if (phase !== 'PLAYING') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleRotate(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleRotate(1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!e.repeat) handleFastDropChange(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        handleFastDropChange(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeModal, handleFastDropChange, handleRotate, handleStartGame, mode, phase]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    synthAudio.setEnabled(next);
  };

  const openLeaderboard = async (
    targetBoard: LeaderboardBoard = mode,
    targetSides: PolygonSides = sides
  ) => {
    setLbBoard(targetBoard);
    setLbSides(targetSides);
    setActiveModal('leaderboard');
    const data = await fetchLeaderboard(targetBoard, targetSides);
    setLeaderboardData(data);
  };

  const handleBuyOrEquipTheme = async (themeId: ThemeId) => {
    const t = THEMES[themeId];
    if (unlockedThemes.includes(themeId)) {
      const serverRes = await equipThemeApi(themeId);
      setEquippedTheme((serverRes?.equippedTheme as ThemeId) ?? themeId);
      return;
    }
    if (coins < t.price) return;

    const serverRes = await purchaseThemeApi(themeId);
    if (serverRes) {
      setCoins(serverRes.hexaCoins);
      const valid = serverRes.unlockedItems.filter((c): c is ThemeId => c in THEMES);
      setUnlockedThemes(Array.from(new Set<ThemeId>(['hextris', 'cyberpunk', ...valid])));
      setEquippedTheme(serverRes.equippedTheme as ThemeId);
      synthAudio.play('joker');
    } else {
      setCoins((c) => c - t.price);
      setUnlockedThemes((prev) => [...prev, themeId]);
      setEquippedTheme(themeId);
      synthAudio.play('joker');
    }
  };

  const claimQuest = async (id: string) => {
    const targetQuest = quests.find((q) => q.id === id);
    if (!targetQuest || targetQuest.claimed || targetQuest.progress < targetQuest.target) return;

    const serverRes = await claimQuestApi(id);
    if (serverRes) {
      setCoins(serverRes.hexaCoins);
      setQuests((prev) => prev.map((q) => (q.id === id ? { ...q, claimed: true } : q)));
      synthAudio.play('revive');
    } else {
      setCoins((c) => c + targetQuest.rewardCoins);
      setQuests((prev) => prev.map((q) => (q.id === id ? { ...q, claimed: true } : q)));
      synthAudio.play('revive');
    }
  };

  const handleClaimStreak = async () => {
    if (!canClaimStreakToday) return;
    const serverRes = await claimDailyStreak();
    if (serverRes) {
      setStreakCount(serverRes.streakCount);
      setLastStreakDate(todayStr);
      setCoins(serverRes.hexaCoins);
      if (serverRes.claimed) synthAudio.play('revive');
    } else {
      const next = (streakCount % 7) + 1;
      const reward = streakRewards[next - 1] ?? 25;
      setStreakCount(next);
      setLastStreakDate(todayStr);
      setCoins((c) => c + reward);
      synthAudio.play('revive');
    }
  };

  const claimableQuestsCount = quests.filter((q) => !q.claimed && q.progress >= q.target).length;

  // Theme-aware UI classes (Theme 1 Light Hextris vs Theme 2+ Dark Neon)
  const cardSurface = isLight ? 'glass-card-light text-[#2c3e50]' : 'glass-card-dark text-slate-50';
  const pillBtn = isLight
    ? 'bg-white/80 hover:bg-white text-[#2c3e50] border border-[#2c3e50]/15 shadow-sm'
    : 'bg-[#0F1626]/80 hover:bg-[#172136] text-slate-100 border border-white/15';
  const mutedText = isLight ? 'text-[#5b6b78]' : 'text-slate-400';

  return (
    <div
      className={`fixed inset-0 w-screen h-dvh overflow-hidden ${isLight ? 'font-hextris' : 'grid-bg-dark'}`}
      style={{ backgroundColor: activeTheme.canvasBg }}
    >
      {/* FULL-SCREEN 120Hz GAME CANVAS (100% Viewport like Original Hextris) */}
      <div className="absolute inset-0 z-0">
        <HexCanvasView
          simulator={simulator}
          sides={sides}
          layout={layout}
          isMenu={phase === 'MENU'}
          isPlaying={phase === 'PLAYING'}
          isPaused={phase === 'PAUSED'}
          theme={activeTheme}
          onStartFromCenter={() => void handleStartGame(mode, sides)}
          onRotate={handleRotate}
          onFastDropChange={handleFastDropChange}
          onHudUpdate={setHud}
          onGameOver={handleEngineGameOver}
        />
      </div>

      {/* FLOATING TOP BAR (Minimal, non-intrusive corners) */}
      <header
        className="fixed top-0 inset-x-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-5 pointer-events-none"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        {/* Top-Left: High Score / Combo / Live Indicators */}
        <div className="flex flex-col gap-1.5 pointer-events-auto">
          <div className={`inline-flex items-center gap-3 px-3.5 py-2 rounded-2xl ${pillBtn}`}>
            <div>
              <span className={`text-[10px] uppercase tracking-wider block leading-none ${mutedText}`}>
                REKOR ({POLYGON_LABELS[sides]}
                {layout === 'bloom' ? ' · Çiçek' : layout === 'morph' ? ' · Dönüşüm' : ''})
              </span>
              <span className="font-bold text-base sm:text-lg leading-tight">
                {Math.max(activeHighScore, hud.score)}
              </span>
            </div>
            {phase === 'PLAYING' && (
              <>
                <div className={`w-[1px] h-6 ${isLight ? 'bg-[#2c3e50]/15' : 'bg-white/15'}`} />
                <div>
                  <span className={`text-[10px] uppercase tracking-wider block leading-none ${mutedText}`}>
                    KOMBO
                  </span>
                  <span
                    className={`font-bold text-base sm:text-lg leading-tight ${
                      isLight ? 'text-[#e74c3c]' : 'text-amber-400'
                    }`}
                  >
                    x{hud.combo}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {layout === 'morph' && phase === 'PLAYING' && hud.morphCountdown && hud.morphNextTarget && (
              <span
                className={`px-2.5 py-1 rounded-xl border text-xs font-bold flex items-center gap-1 animate-pulse ${
                  isLight
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                    : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {hud.morphNextTarget === 'bloom' ? (
                  <>
                    <Flower2 className="w-3.5 h-3.5" />
                    {hud.morphCountdown}s Çiçek Açılıyor!
                  </>
                ) : (
                  <>
                    <Hexagon className="w-3.5 h-3.5" />
                    {hud.morphCountdown}s Çokgene Dönüyor!
                  </>
                )}
              </span>
            )}
            {hud.freezeSecondsLeft > 0 && phase === 'PLAYING' && (
              <span
                className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center gap-1 ${
                  isLight
                    ? 'bg-sky-100 border-sky-400 text-sky-800'
                    : 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                {hud.freezeSecondsLeft}s
              </span>
            )}
            {hud.danger && phase === 'PLAYING' && (
              <span className="px-2.5 py-1 rounded-xl bg-[#e74c3c] text-white text-[11px] font-bold animate-pulse">
                TEHLİKE!
              </span>
            )}
            {(!isOnline || pendingSyncCount > 0) && (
              <span
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-mono flex items-center gap-1 ${
                  isLight
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                }`}
              >
                <WifiOff className="w-3.5 h-3.5" />
                {!isOnline ? 'Çevrimdışı' : `${pendingSyncCount} kuyrukta`}
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Coins + Action Icons */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 pointer-events-auto">
          <Tooltip label="GyroCoins Bakiyesi" isLight={isLight}>
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs font-bold ${pillBtn}`}>
              <Coins className="w-4 h-4 text-amber-500" />
              <span>{coins}</span>
            </div>
          </Tooltip>

          <Tooltip label="Nasıl Oynanır & Oyun Rehberi" isLight={isLight}>
            <button
              onClick={() => {
                if (phase === 'PLAYING') setPhase('PAUSED');
                setActiveModal('help');
              }}
              className={`p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="Nasıl Oynanır ve Oyun Rehberi"
            >
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
            </button>
          </Tooltip>

          <Tooltip label="Tema Mağazası" isLight={isLight}>
            <button
              onClick={() => setActiveModal('shop')}
              className={`p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="Tema Mağazası"
            >
              <Palette className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
            </button>
          </Tooltip>

          <Tooltip label="7 Günlük Giriş Serisi" isLight={isLight}>
            <button
              onClick={() => setActiveModal('streak')}
              className={`relative p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="7 Günlük Giriş Serisi"
            >
              <CalendarCheck2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              {canClaimStreakToday && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500" />
              )}
            </button>
          </Tooltip>

          <Tooltip label="Günlük Görevler" isLight={isLight}>
            <button
              onClick={() => setActiveModal('quests')}
              className={`relative p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="Günlük Görevler"
            >
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              {claimableQuestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#e74c3c] text-white text-[10px] font-bold flex items-center justify-center">
                  {claimableQuestsCount}
                </span>
              )}
            </button>
          </Tooltip>

          <Tooltip label="Liderlik Tablosu" isLight={isLight}>
            <button
              onClick={() => void openLeaderboard(mode)}
              className={`p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="Liderlik Tablosu"
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500" />
            </button>
          </Tooltip>

          {phase === 'MENU' && (
            <Tooltip label={soundOn ? 'Sesi Kapat' : 'Sesi Aç'} isLight={isLight}>
              <button
                onClick={toggleSound}
                className={`p-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
                aria-label={soundOn ? 'Sesi Kapat' : 'Sesi Aç'}
              >
                {soundOn ? (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500" />
                ) : (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 opacity-50" />
                )}
              </button>
            </Tooltip>
          )}

          <Tooltip label="Profil & Hesap Ayarları" isLight={isLight} align="right">
            <button
              onClick={() => {
                setConfirmDelete(false);
                setAccountMessage(null);
                setActiveModal('account');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition-all cursor-pointer ${pillBtn}`}
              aria-label="Profil ve Hesap Ayarları"
            >
              <User className="w-4 h-4 text-sky-500" />
              <span className="hidden sm:inline text-xs font-bold max-w-[96px] truncate">
                {playerName}
              </span>
              <Settings className="w-4 h-4 opacity-70" />
            </button>
          </Tooltip>
        </div>
      </header>

      {/* CENTERED CONTROLS DIRECTLY ABOVE HEXAGON WHILE PLAYING / PAUSED */}
      {(phase === 'PLAYING' || phase === 'PAUSED') && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-auto"
          style={{
            top: 'max(0.75rem, env(safe-area-inset-top), calc(50% - 41.5vmin - 48px))'
          }}
        >
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl ${pillBtn}`}>
            <Tooltip label={phase === 'PAUSED' ? 'Devam Et (P)' : 'Duraklat (P)'} isLight={isLight}>
              <button
                onClick={() => setPhase(phase === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={phase === 'PAUSED' ? 'Devam Et' : 'Duraklat'}
              >
                {phase === 'PAUSED' ? (
                  <Play className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Pause className="w-5 h-5" />
                )}
              </button>
            </Tooltip>

            <Tooltip label="Yeniden Başlat" isLight={isLight}>
              <button
                onClick={() => void handleStartGame(mode)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label="Yeniden Başlat"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip label={soundOn ? 'Sesi Kapat' : 'Sesi Aç'} isLight={isLight}>
              <button
                onClick={toggleSound}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={soundOn ? 'Sesi Kapat' : 'Sesi Aç'}
              >
                {soundOn ? (
                  <Volume2 className="w-5 h-5 text-sky-500" />
                ) : (
                  <VolumeX className="w-5 h-5 opacity-50" />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* MENU OVERLAY (Title & Play Inside Outer Polygon or Centered Above Bloomed Line) */}
      {phase === 'MENU' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-6 sm:pb-10 px-4">
          {/* Larger Title & Subtitle: inside upper polygon when closed, upper-center when bloomed */}
          <div
            className="fixed left-1/2 -translate-x-1/2 text-center select-none px-3 transition-all duration-500"
            style={
              layout === 'bloom'
                ? {
                    bottom: 'calc(50% + 4vmin)',
                    width: 'min(92vw, 76vmin)'
                  }
                : {
                    bottom: 'calc(50% + 14.5vmin)',
                    width: 'min(92vw, 66vmin)'
                  }
            }
          >
            <h1
              className={`leading-[0.95] tracking-tight ${
                isLight ? 'font-hextris font-light text-[#2c3e50]' : 'font-display font-extrabold text-white'
              }`}
              style={{ fontSize: 'clamp(2.25rem, 9.2vmin, 5.75rem)' }}
            >
              GYRO<span className={isLight ? 'font-bold text-[#2c3e50]' : 'text-cyan-400'}>GON</span>
            </h1>
            <p
              className={`mt-2 mx-auto font-medium leading-snug ${
                isLight ? 'text-[#3d5166]' : 'text-slate-200/90'
              }`}
              style={{
                fontSize: 'clamp(0.8rem, 2.25vmin, 1.15rem)',
                maxWidth: '58vmin'
              }}
            >
              {mode === 'daily'
                ? `Günlük Bulmaca (${dailyInfo?.date ? formatTurkishDate(dailyInfo.date) : 'Bugün'}) · Herkesle aynı blok sırası`
                : layout === 'bloom'
                  ? 'Çiçek Modu · Alt çizgiyi sağa-sola kaydır, 3+ bloğu patlat'
                  : layout === 'morph'
                    ? 'Dönüşüm Modu · Çokgen dalgalarda çiçek gibi açılıp kapanır'
                    : 'Aynı renkten 3+ bloğu birleştir ve patlat'}
            </p>
          </div>

          {/* Prominent "Oyna!" CTA: inside lower polygon when closed, cleanly above bloomed bar when open */}
          <div
            className="fixed left-1/2 -translate-x-1/2 pointer-events-auto transition-all duration-500"
            style={{ top: layout === 'bloom' ? 'calc(50% + 1vmin)' : 'calc(50% + 15.5vmin)' }}
          >
            <button
              onClick={() => void handleStartGame(mode)}
              disabled={startingGame}
              className={`inline-flex items-center gap-2.5 px-10 py-3.5 rounded-full text-lg sm:text-xl font-extrabold tracking-wide cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                isLight
                  ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white border-2 border-white/80 shadow-[0_10px_28px_rgba(46,204,113,0.45)]'
                  : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 text-slate-950 border border-white/30 shadow-[0_0_32px_rgba(0,240,255,0.45)]'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{startingGame ? 'Hazırlanıyor...' : 'OYNA'}</span>
            </button>
          </div>

          {/* Bottom Compact Mode + Board Form (Çokgen/Çiçek/Dönüşüm) + Polygon (3..8) Switcher */}
          <div
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-2xl ${cardSurface}`}
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div
              className={`inline-flex p-0.5 rounded-xl ${
                isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
              }`}
            >
              <Tooltip label="Her oyunda rastgele yeni blok sırası" isLight={isLight} position="top">
                <button
                  onClick={() => setMode('classic')}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    mode === 'classic'
                      ? isLight
                        ? 'bg-[#2c3e50] text-white'
                        : 'bg-cyan-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  Klasik
                </button>
              </Tooltip>
              <Tooltip label="Bugün tüm oyuncularla aynı blok sırası" isLight={isLight} position="top">
                <button
                  onClick={() => setMode('daily')}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    mode === 'daily'
                      ? isLight
                        ? 'bg-[#e74c3c] text-white'
                        : 'bg-pink-500 text-white'
                      : mutedText
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  Günlük
                </button>
              </Tooltip>
            </div>

            {/* Board Form Switcher: Çokgen | Çiçek (Düz Çizgi) | Dönüşüm */}
            <div
              className={`inline-flex p-0.5 rounded-xl ${
                isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
              }`}
            >
              <Tooltip label="Klasik kapalı çokgen modu" isLight={isLight} position="top">
                <button
                  onClick={() => setLayout('polygon')}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    layout === 'polygon'
                      ? isLight
                        ? 'bg-[#2c3e50] text-white'
                        : 'bg-cyan-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Hexagon className="w-3.5 h-3.5" />
                  Çokgen
                </button>
              </Tooltip>
              <Tooltip label="Çiçek gibi açılır · Altta düz çizgi modu" isLight={isLight} position="top">
                <button
                  onClick={() => setLayout('bloom')}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    layout === 'bloom'
                      ? isLight
                        ? 'bg-[#2ecc71] text-white'
                        : 'bg-emerald-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Flower2 className="w-3.5 h-3.5" />
                  Çiçek
                </button>
              </Tooltip>
              <Tooltip label="Çokgen başlar · Dalgalarda çiçek gibi açılıp kapanır" isLight={isLight} position="top">
                <button
                  onClick={() => setLayout('morph')}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    layout === 'morph'
                      ? isLight
                        ? 'bg-[#9b59b6] text-white'
                        : 'bg-fuchsia-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Dönüşüm
                </button>
              </Tooltip>
            </div>

            <div
              className={`inline-flex items-center p-0.5 rounded-xl ${
                isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
              }`}
            >
              {SUPPORTED_SIDES.map((s) => (
                <Tooltip
                  key={s}
                  label={POLYGON_LABELS[s]}
                  isLight={isLight}
                  position="top"
                >
                  <button
                    onClick={() => setSides(s)}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer ${
                      sides === s
                        ? isLight
                          ? 'bg-[#3498db] text-white shadow-sm'
                          : 'bg-cyan-400 text-slate-950'
                        : mutedText
                    }`}
                  >
                    {s}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PLAYING BOTTOM SUBTLE CONTROLS (Non-intrusive, mobile & desktop ergonomic) */}
      {phase === 'PLAYING' && (
        <div
          className="fixed bottom-3 inset-x-0 z-10 flex flex-col items-center gap-1.5 px-4 pointer-events-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-2 pointer-events-auto sm:hidden">
            <button
              onPointerDown={() => handleRotate(-1)}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs ${pillBtn}`}
            >
              ◀ Sola
            </button>
            <button
              onPointerDown={() => handleFastDropChange(true)}
              onPointerUp={() => handleFastDropChange(false)}
              onPointerLeave={() => handleFastDropChange(false)}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs ${pillBtn}`}
            >
              ▼ Hızlı
            </button>
            <button
              onPointerDown={() => handleRotate(1)}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs ${pillBtn}`}
            >
              Sağa ▶
            </button>
          </div>
          <div
            className={`hidden sm:inline-flex items-center gap-4 px-4 py-2 rounded-2xl text-xs font-medium ${cardSurface}`}
          >
            <div className="flex items-center gap-1.5">
              <kbd
                className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-cyan-300'
                }`}
              >
                ←
              </kbd>
              <kbd
                className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-cyan-300'
                }`}
              >
                →
              </kbd>
              <span className={`text-[11px] ${mutedText}`}>veya</span>
              <kbd
                className={`inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-cyan-300'
                }`}
              >
                A
              </kbd>
              <kbd
                className={`inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-cyan-300'
                }`}
              >
                D
              </kbd>
              <span className="font-semibold ml-0.5">
                {layout === 'bloom' ? 'Kaydır' : layout === 'morph' ? 'Döndür / Kaydır' : 'Döndür'}
              </span>
            </div>

            <span className={`w-[1px] h-4 ${isLight ? 'bg-[#2c3e50]/20' : 'bg-white/15'}`} />

            <div className="flex items-center gap-1.5">
              <kbd
                className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-amber-300'
                }`}
              >
                ↓
              </kbd>
              <kbd
                className={`inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-amber-300'
                }`}
              >
                S
              </kbd>
              <span className="font-semibold ml-0.5">Hızlandır</span>
            </div>

            <span className={`w-[1px] h-4 ${isLight ? 'bg-[#2c3e50]/20' : 'bg-white/15'}`} />

            <div className="flex items-center gap-1.5">
              <kbd
                className={`inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                  isLight
                    ? 'bg-[#ecf0f1] border-[#95a5a6]/60 text-[#2c3e50]'
                    : 'bg-white/10 border-white/20 text-slate-200'
                }`}
              >
                P
              </kbd>
              <span className="font-semibold ml-0.5">Duraklat</span>
            </div>
          </div>
        </div>
      )}

      {/* PAUSED / REVIVE / GAMEOVER CENTER OVERLAY */}
      {(phase === 'PAUSED' || phase === 'REVIVE_OFFER' || phase === 'GAMEOVER') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div
            className={`w-full ${
              phase === 'GAMEOVER' ? 'max-w-[420px]' : 'max-w-sm'
            } rounded-3xl p-6 text-center shadow-2xl ${cardSurface}`}
          >
            {phase === 'PAUSED' && (
              <>
                <h2 className="text-2xl font-bold mb-2">Oyun Duraklatıldı</h2>
                <p className={`text-xs mb-6 ${mutedText}`}>
                  Devam etmek için aşağıdaki butona bas veya P tuşunu kullan.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => setPhase('PLAYING')}
                    className={`w-full py-3 rounded-xl font-bold text-sm ${
                      isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400 text-slate-950'
                    }`}
                  >
                    Devam Et
                  </button>
                  <button
                    onClick={() => void handleStartGame(mode)}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm ${pillBtn}`}
                  >
                    Yeniden Başlat
                  </button>
                  <button
                    onClick={() => {
                      setSimulator(null);
                      setPhase('MENU');
                    }}
                    className={`w-full py-2 text-xs ${mutedText}`}
                  >
                    Ana Menüye Dön
                  </button>
                </div>
              </>
            )}

            {phase === 'REVIVE_OFFER' && (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6 text-amber-500" />
                </div>
                <h2 className="text-2xl font-extrabold mb-1">
                  {POLYGON_LABELS[sides].toUpperCase()} TAŞTI!
                </h2>
                <p className={`text-xs mb-5 ${mutedText}`}>
                  Skorun: <strong>{simulator?.score ?? 0}</strong>. Dış 3 sırayı patlatıp rekoruna devam et!
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => void handleRevive('ad')}
                    className="w-full py-3 rounded-xl bg-[#2ecc71] text-white font-extrabold text-xs sm:text-sm"
                  >
                    Ödüllü Video ile Canlan (AdMob / Demo)
                  </button>
                  <button
                    onClick={() => void handleRevive('coins')}
                    disabled={coins < 50}
                    className={`w-full py-2.5 rounded-xl border font-bold text-xs disabled:opacity-40 ${
                      isLight
                        ? 'bg-amber-100 border-amber-400 text-amber-900'
                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    50 GyroCoin ile Canlan (Bakiye: {coins})
                  </button>
                  <button onClick={handleDeclineRevive} className={`w-full py-2 text-xs ${mutedText}`}>
                    Hayır, Skoru Kaydet
                  </button>
                </div>
              </>
            )}

            {phase === 'GAMEOVER' && (
              <div>
                {/* Top Mode / Shape Tag + New Record Badge */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border ${
                      isLight
                        ? 'bg-[#ecf0f1] border-[#bdc3c7] text-[#2c3e50]'
                        : 'bg-white/10 border-white/15 text-slate-200'
                    }`}
                  >
                    {mode === 'daily' ? 'Günlük' : 'Klasik'} · {POLYGON_LABELS[sides]}
                    {layout === 'bloom' ? ' · Çiçek' : layout === 'morph' ? ' · Dönüşüm' : ''}
                  </span>
                  {isNewRecord && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide bg-amber-400 text-slate-950 shadow-sm">
                      ★ YENİ REKOR!
                    </span>
                  )}
                </div>

                {/* Hero Score */}
                <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${mutedText}`}>
                  OYUN BİTTİ
                </div>
                <div
                  className={`text-5xl sm:text-6xl font-extrabold tracking-tight my-1.5 tabular-nums ${
                    isLight ? 'text-[#2c3e50]' : 'text-white'
                  }`}
                >
                  {(simulator?.score ?? 0).toLocaleString('tr-TR')}
                </div>
                <div className={`text-xs font-medium mb-5 ${mutedText}`}>
                  {isNewRecord
                    ? prevBestRef.current > 0
                      ? `Önceki rekorunu (${prevBestRef.current.toLocaleString('tr-TR')}) geçtin!`
                      : 'Bu moddaki ilk rekorun kaydedildi!'
                    : `Bu moddaki rekorun: ${Math.max(activeHighScore, simulator?.score ?? 0).toLocaleString('tr-TR')}`}
                </div>

                {/* 3 High-Contrast Stat Cards */}
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  <div
                    className={`p-3 rounded-2xl border ${
                      isLight
                        ? 'bg-white border-[#d5dbdb] shadow-xs'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-amber-500 leading-tight">
                      x{simulator?.maxCombo ?? 1}
                    </div>
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>En Yüksek Kombo</div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isLight
                        ? 'bg-white border-[#d5dbdb] shadow-xs'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-sky-500 mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-sky-500 leading-tight">
                      {simulator?.blocksCleared ?? 0}
                    </div>
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>Patlatılan Blok</div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isLight
                        ? 'bg-white border-[#d5dbdb] shadow-xs'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <Coins className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-emerald-500 leading-tight">
                      +{verificationResult?.coinsEarned ?? simulator?.coinsEarned ?? 0}
                    </div>
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>Kazanılan Coin</div>
                  </div>
                </div>

                {/* Clear, Jargon-Free Score Save Status */}
                <div className="mb-5">
                  {!verificationResult ? (
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs font-medium inline-flex items-center gap-2 border ${
                        isLight
                          ? 'bg-[#ecf0f1] border-[#d5dbdb] text-[#5b6b78]'
                          : 'bg-white/5 border-white/10 text-slate-300'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 animate-pulse text-sky-500" />
                      <span>Skor kaydediliyor...</span>
                    </div>
                  ) : verificationResult.saveStatus === 'synced' ? (
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs border flex items-center justify-center gap-2 font-semibold ${
                        isLight
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>
                        Skor Liderlik Tablosuna Kaydedildi
                        {verificationResult.rank ? ` · #${verificationResult.rank}. Sıra` : ''}
                      </span>
                    </div>
                  ) : verificationResult.saveStatus === 'local' ? (
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs border text-left flex items-start gap-2.5 ${
                        isLight
                          ? 'bg-sky-50 text-sky-950 border-sky-200'
                          : 'bg-sky-500/15 text-sky-200 border-sky-500/30'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Skorun Cihazına Kaydedildi</div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-sky-800/80' : 'text-sky-200/75'}`}>
                          Sunucu bağlantısı veya oturum yenilendiği için skor yerel olarak saklandı.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs border text-left flex items-start gap-2.5 ${
                        isLight
                          ? 'bg-amber-50 text-amber-950 border-amber-300'
                          : 'bg-amber-500/15 text-amber-200 border-amber-500/35'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Sıralamaya Eklenemedi</div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-amber-900/80' : 'text-amber-200/75'}`}>
                          Oyun sürümü güncellendiği veya oturum eşleşmediği için skor doğrulanamadı.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary + Secondary Actions */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => void handleStartGame(mode)}
                    className={`w-full py-3.5 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      isLight
                        ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)]'
                        : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 text-slate-950 shadow-[0_0_24px_rgba(0,240,255,0.3)]'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Tekrar Oyna
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => void openLeaderboard(mode)}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 ${pillBtn}`}
                    >
                      <Trophy className="w-4 h-4 text-sky-500" />
                      Sıralama
                    </button>
                    <button
                      onClick={() => {
                        setSimulator(null);
                        setPhase('MENU');
                      }}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 ${pillBtn}`}
                    >
                      <Home className="w-4 h-4 opacity-75" />
                      Ana Menü
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS (HELP, SHOP, QUESTS, STREAK, LEADERBOARD, ACCOUNT) ================= */}
      {activeModal !== 'none' && (
        <div
          onClick={() => setActiveModal('none')}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${
              activeModal === 'help' ? 'max-w-[1024px]' : 'max-w-md'
            } rounded-3xl p-6 max-h-[85vh] overflow-y-auto custom-scroll ${
              isLight ? 'custom-scroll-light' : 'custom-scroll-dark'
            } ${cardSurface}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                {activeModal === 'help' && 'Nasıl Oynanır & Oyun Rehberi'}
                {activeModal === 'shop' && 'Tema Mağazası'}
                {activeModal === 'quests' && 'Günlük Görevler'}
                {activeModal === 'streak' && '7 Günlük Giriş Serisi'}
                {activeModal === 'leaderboard' && 'Liderlik Tablosu'}
                {activeModal === 'account' && 'Hesap & Gizlilik'}
              </h3>
              <button
                onClick={() => setActiveModal('none')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${pillBtn}`}
              >
                Kapat
              </button>
            </div>

            {activeModal === 'help' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-[13px] leading-relaxed">
                {/* 1. Oyunun Amacı */}
                <section
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-emerald-500" />
                    Oyunun Amacı
                  </h4>
                  <p className={mutedText}>
                    Merkezdeki çokgeni sağa veya sola döndürerek dışarıdan gelen renkli çubukları uygun kenarlara
                    yerleştir. Aynı renkten <strong>en az 3 çubuğu</strong> yan yana veya üst üste birleştirdiğinde
                    patlar ve puan kazanırsın. Herhangi bir kenardaki yığın dış çerçeveyi aşarsa oyun biter.
                  </p>
                </section>

                {/* 2. Kontroller */}
                <section
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <h4 className="font-bold text-sm mb-3">Kontroller</h4>
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Çokgeni Döndür</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-cyan-300'
                          }`}
                        >
                          ←
                        </kbd>
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-cyan-300'
                          }`}
                        >
                          →
                        </kbd>
                        <span className={`text-[11px] ${mutedText}`}>veya</span>
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-cyan-300'
                          }`}
                        >
                          A
                        </kbd>
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-cyan-300'
                          }`}
                        >
                          D
                        </kbd>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            isLight ? 'bg-white/80 text-[#5b6b78]' : 'bg-white/5 text-slate-300'
                          }`}
                        >
                          Mobil: Sol / Sağ Tık
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Hızlı İndir</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-amber-300'
                          }`}
                        >
                          ↓
                        </kbd>
                        <span className={`text-[11px] ${mutedText}`}>veya</span>
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-amber-300'
                          }`}
                        >
                          S
                        </kbd>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            isLight ? 'bg-white/80 text-[#5b6b78]' : 'bg-white/5 text-slate-300'
                          }`}
                        >
                          Mobil: Aşağı Kaydır
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Duraklat / Devam</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-slate-200'
                          }`}
                        >
                          P
                        </kbd>
                        <span className={`text-[11px] ${mutedText}`}>veya</span>
                        <kbd
                          className={`inline-flex items-center justify-center min-w-[34px] h-6 px-1.5 rounded-md font-mono text-[11px] font-bold border shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                            isLight
                              ? 'bg-white border-[#95a5a6]/70 text-[#2c3e50]'
                              : 'bg-white/10 border-white/20 text-slate-200'
                          }`}
                        >
                          Esc
                        </kbd>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3. Özel Güç Blokları */}
                <section
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <h4 className="font-bold text-sm mb-2.5 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Özel Güç Çubukları (Power-Up)
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#e74c3c] text-white font-bold flex items-center justify-center shrink-0">
                        B
                      </span>
                      <div>
                        <div className="font-bold">Bomba Çubuğu</div>
                        <div className={mutedText}>
                          Yere oturduğunda etrafındaki komşu blokları anında patlatarak sıkışan kenarları açar.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#f1c40f] text-[#2c3e50] font-bold flex items-center justify-center shrink-0">
                        ★
                      </span>
                      <div>
                        <div className="font-bold">Joker Çubuğu</div>
                        <div className={mutedText}>
                          Temas ettiği komşu rengin yerine geçerek eksik 3&apos;lü eşleşmeyi tamamlar.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#3498db] text-white font-bold flex items-center justify-center shrink-0">
                        ❄
                      </span>
                      <div>
                        <div className="font-bold">Dondurma (Freeze)</div>
                        <div className={mutedText}>
                          4 saniye boyunca gelen tüm çubukları yavaşlatır, zorlu dalgalarda nefes almanı sağlar.
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4 & 5. Kombo + Oyun Modları ve Çokgenler */}
                <div className="flex flex-col gap-4">
                  <section
                    className={`p-4 rounded-2xl border ${
                      isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <h4 className="font-bold text-sm mb-1.5">Kombo & Zincir Patlatma</h4>
                    <p className={mutedText}>
                      Dış çokgenin kenarında eriyen renkli çizgi <strong>kombo süreni</strong> gösterir. Süre dolmadan
                      yeni bir patlatma yaptığında veya üstteki bloklar düşüp zincirleme (kaskad) eşleşme oluşturduğunda
                      kombo çarpanı (<strong>x2, x3, x4...</strong>) artar ve skorun katlanır.
                    </p>
                  </section>

                  <section
                    className={`p-4 rounded-2xl border flex-1 ${
                      isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <h4 className="font-bold text-sm mb-2">Oyun Modları, Çiçek & Çokgenler (3–8)</h4>
                    <ul className={`space-y-1.5 list-disc pl-4 ${mutedText}`}>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>Klasik & Günlük:</strong> Klasik
                        her oyunda rastgele blok üretir; Günlük modda o gün herkes aynı blok sırasıyla yarışır.
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>Çiçek (Düz Çizgi) Modu:</strong>{' '}
                        Çokgen çiçek gibi açılıp alt kısımda yatay düz şeride dönüşür. Sütunları döngüsel olarak sağa-sola
                        kaydırarak yukarıdan düşen blokları eşleştirirsin.
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>Dönüşüm Modu:</strong> Çokgen
                        olarak başlar; dalgalarda ve yüksek kombolarda çiçek gibi açılıp düz çizgiye geçer, sonra tekrar
                        çokgene kapanır.
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>3–8 Çokgen Seçici:</strong> Üçgen,
                        Kare, Beşgen, Altıgen, Yedigen ve Sekizgen — hepsi tüm modlarla uyumludur.
                      </li>
                    </ul>
                  </section>
                </div>

                {/* 6. Ekrandaki Butonlar Ne İşe Yarar? */}
                <section
                  className={`md:col-span-2 p-4 rounded-2xl border ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <h4 className="font-bold text-sm mb-3">Menüdeki Butonlar Ne İşe Yarar?</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="flex items-start gap-2">
                      <Coins className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">GyroCoins</div>
                        <div className={mutedText}>Oyun ve görevlerden kazanılır; tema açmak veya canlanmak için kullanılır.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Palette className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Tema Mağazası</div>
                        <div className={mutedText}>Hextris Klasik, Cyberpunk Neon gibi görsel temaları değiştirir.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CalendarCheck2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">7 Günlük Seri</div>
                        <div className={mutedText}>Her gün giriş yaptıkça artan günlük GyroCoin ödülleri verir.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Award className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Günlük Görevler</div>
                        <div className={mutedText}>Blok, kombo ve skor hedeflerini tamamlayıp ekstra coin toplarsın.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Trophy className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Liderlik Tablosu</div>
                        <div className={mutedText}>Global, Haftalık ve Günlük sıralamaları 3G–8G bazında gösterir.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Profil & Hesap</div>
                        <div className={mutedText}>Oyuncu adını düzenler, sosyal hesap bağlar ve verilerini yönetirsin.</div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeModal === 'account' && (
              <div className="space-y-4 text-xs">
                <div className={`p-3.5 rounded-2xl ${isLight ? 'bg-[#ecf0f1]' : 'bg-white/5 border border-white/10'}`}>
                  <label
                    htmlFor="profile-player-name"
                    className={`text-[10px] font-mono uppercase block mb-1.5 ${mutedText}`}
                  >
                    OYUNCU ADI (LİDERLİK TABLOSUNDA GÖRÜNÜR)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="profile-player-name"
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                      placeholder="Oyuncu adını yaz"
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold focus:outline-none ${
                        isLight
                          ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                          : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                      }`}
                    />
                    <button
                      onClick={() => {
                        const trimmed = playerName.trim() || 'GyroPilot';
                        setPlayerName(trimmed);
                        void updateServerDisplayName(trimmed);
                        setAccountMessage('Oyuncu adın güncellendi.');
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 ${
                        isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400 text-slate-950'
                      }`}
                    >
                      Kaydet
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-sky-500 mt-2">
                    Platform: {getPlatformLabel().toUpperCase()} • Durum: {isOnline ? 'Çevrimiçi' : 'Çevrimdışı PWA'}
                  </div>
                </div>

                <div>
                  <div className="font-bold mb-2">Sosyal Hesap Bağla (Account Linking)</div>
                  <p className={`mb-3 leading-relaxed ${mutedText}`}>
                    Misafir olarak kazandığın tüm skorlar, temalar ve GyroCoins bakiyen bağladığın hesapla kayıpsız birleştirilir.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => void handleLinkSocial('apple')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#111827] text-white font-bold flex items-center justify-between"
                    >
                      <span>Sign in with Apple</span>
                      <span className="text-[11px] font-mono">
                        {linkedProviders.apple ? '✓ Bağlı' : 'Bağla'}
                      </span>
                    </button>
                    <button
                      onClick={() => void handleLinkSocial('google')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#3498db] text-white font-bold flex items-center justify-between"
                    >
                      <span>Google ile Bağlan</span>
                      <span className="text-[11px] font-mono">
                        {linkedProviders.google ? '✓ Bağlı' : 'Bağla'}
                      </span>
                    </button>
                    <button
                      onClick={() => void handleLinkSocial('facebook')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#1877F2] text-white font-bold flex items-center justify-between"
                    >
                      <span>Facebook ile Bağlan</span>
                      <span className="text-[11px] font-mono">
                        {linkedProviders.facebook ? '✓ Bağlı' : 'Bağla'}
                      </span>
                    </button>
                  </div>
                  {accountMessage && (
                    <p
                      className={`mt-2.5 p-2.5 rounded-xl border font-semibold ${
                        isLight
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                          : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                      }`}
                    >
                      {accountMessage}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-current/10 text-[11px]">
                  <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">
                    Gizlilik Politikası (KVKK / GDPR)
                  </a>
                  <a href="/terms.html" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">
                    Kullanım Koşulları
                  </a>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/35">
                  <div className="font-bold text-rose-500 mb-1 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" />
                    Hesap ve Veri Silme (App Store 4.8 / KVKK)
                  </div>
                  <p className={`text-[11px] mb-3 ${mutedText}`}>
                    Bu işlem tüm skorlarını, liderlik kaydını, temalarını ve kimlik bağlarını kalıcı olarak siler.
                  </p>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className={`w-full py-2.5 rounded-xl border font-bold cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-rose-600 hover:bg-rose-700 border-rose-700 text-white'
                          : 'bg-rose-500/25 hover:bg-rose-500/35 border-rose-500/50 text-rose-200'
                      }`}
                    >
                      Hesabımı ve Tüm Verilerimi Sil
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleDeleteAccount()}
                        className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold"
                      >
                        Evet, Kalıcı Olarak Sil
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className={`px-4 py-2 rounded-xl font-semibold ${pillBtn}`}
                      >
                        Vazgeç
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeModal === 'streak' && (
              <div>
                <p className={`text-xs mb-4 ${mutedText}`}>
                  Her gün oyuna girerek artan GyroCoin ödüllerini topla! 7. günde büyük bonus seni bekliyor.
                </p>
                <div className="grid grid-cols-4 gap-2 mb-5">
                  {streakRewards.map((reward, idx) => {
                    const dayNum = idx + 1;
                    const completed = dayNum <= streakCount;
                    const isNext = canClaimStreakToday && dayNum === (streakCount % 7) + 1;
                    return (
                      <div
                        key={dayNum}
                        className={`p-2.5 rounded-2xl border text-center ${
                          dayNum === 7 ? 'col-span-2' : ''
                        } ${
                          completed
                            ? 'bg-emerald-500/15 border-emerald-500/40'
                            : isNext
                              ? 'bg-amber-500/15 border-amber-500/60'
                              : isLight
                                ? 'bg-[#ecf0f1] border-[#bdc3c7]'
                                : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className={`text-[10px] font-mono ${mutedText}`}>GÜN {dayNum}</div>
                        <div className="font-bold text-sm text-amber-500 mt-0.5">+{reward}</div>
                        <div className={`text-[10px] ${mutedText}`}>
                          {completed ? '✓ Alındı' : isNext ? 'Hazır!' : 'Coin'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => void handleClaimStreak()}
                  disabled={!canClaimStreakToday}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-sm disabled:opacity-40"
                >
                  {canClaimStreakToday
                    ? `Gün ${(streakCount % 7) + 1} Ödülünü Al (+${streakRewards[streakCount % 7] ?? 25} Coin)`
                    : 'Bugünün Ödülü Alındı ✓'}
                </button>
              </div>
            )}

            {activeModal === 'shop' && (
              <div className="space-y-3">
                {(Object.keys(THEMES) as ThemeId[]).map((tid) => {
                  const t = THEMES[tid];
                  const unlocked = unlockedThemes.includes(tid);
                  const equipped = equippedTheme === tid;
                  return (
                    <div
                      key={tid}
                      className={`p-4 rounded-2xl border transition-all ${
                        equipped
                          ? 'bg-sky-500/15 border-sky-500/60'
                          : isLight
                            ? 'bg-[#ecf0f1] border-[#bdc3c7]'
                            : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-sky-500 block">
                            {t.badge}
                          </span>
                          <div className="font-bold text-sm">{t.name}</div>
                          <div className={`text-xs ${mutedText}`}>{t.subtitle}</div>
                        </div>
                        <button
                          onClick={() => void handleBuyOrEquipTheme(tid)}
                          disabled={!unlocked && coins < t.price}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                            equipped
                              ? isLight
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-400'
                                : 'bg-emerald-500/20 text-emerald-300'
                              : unlocked
                                ? isLight
                                  ? 'bg-[#2c3e50] text-white'
                                  : 'bg-cyan-400 text-slate-950'
                                : 'bg-amber-400 text-slate-950 disabled:opacity-40'
                          }`}
                        >
                          {equipped ? 'Seçili' : unlocked ? 'Kullan' : `${t.price} Coin`}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-md border border-black/15"
                          style={{ backgroundColor: t.canvasBg }}
                          title="Zemin"
                        />
                        {t.palette.map((c) => (
                          <span
                            key={c.hex}
                            className="w-6 h-2.5 rounded-full"
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeModal === 'quests' && (
              <div className="space-y-3">
                {quests.map((q) => {
                  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                  const done = q.progress >= q.target;
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm">{q.title}</span>
                        <span className="text-xs font-mono text-amber-500">+{q.rewardCoins} Coin</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black/15 overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`flex items-center justify-between text-xs ${mutedText}`}>
                        <span>
                          {q.progress} / {q.target}
                        </span>
                        {q.claimed ? (
                          <span className="text-emerald-500 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Alındı
                          </span>
                        ) : (
                          <button
                            onClick={() => void claimQuest(q.id)}
                            disabled={!done}
                            className="px-3 py-1 rounded-lg bg-emerald-500 text-white font-bold disabled:opacity-35"
                          >
                            Ödülü Al
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeModal === 'leaderboard' && (
              <div>
                <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                  <button
                    onClick={() => void openLeaderboard('classic', lbSides)}
                    className={`py-2 rounded-xl text-xs font-bold ${
                      lbBoard === 'classic'
                        ? isLight
                          ? 'bg-[#2c3e50] text-white'
                          : 'bg-cyan-400 text-slate-950'
                        : pillBtn
                    }`}
                  >
                    Global
                  </button>
                  <button
                    onClick={() => void openLeaderboard('weekly', lbSides)}
                    className={`py-2 rounded-xl text-xs font-bold ${
                      lbBoard === 'weekly' ? 'bg-amber-400 text-slate-950' : pillBtn
                    }`}
                  >
                    Haftalık
                  </button>
                  <button
                    onClick={() => void openLeaderboard('daily', lbSides)}
                    className={`py-2 rounded-xl text-xs font-bold ${
                      lbBoard === 'daily' ? 'bg-[#e74c3c] text-white' : pillBtn
                    }`}
                  >
                    Günlük
                  </button>
                </div>

                {/* Polygon Sides Filter (3G..8G) */}
                <div className="grid grid-cols-6 gap-1 mb-3">
                  {SUPPORTED_SIDES.map((s) => (
                    <button
                      key={s}
                      onClick={() => void openLeaderboard(lbBoard, s)}
                      className={`py-1.5 rounded-lg font-mono text-[11px] font-bold transition-all ${
                        lbSides === s
                          ? isLight
                            ? 'bg-[#3498db] text-white'
                            : 'bg-cyan-400/25 border border-cyan-400/60 text-cyan-200'
                          : pillBtn
                      }`}
                    >
                      {s}G
                    </button>
                  ))}
                </div>

                {leaderboardData && (
                  <div className={`flex items-center justify-between text-xs font-medium mb-3 px-1 ${mutedText}`}>
                    <span>{formatLeaderboardPeriod(leaderboardData.board, leaderboardData.periodKey)}</span>
                    <span>
                      {leaderboardData.totalPlayers} oyuncu
                      {leaderboardData.engine === 'local' ? ' · Çevrimdışı' : ''}
                    </span>
                  </div>
                )}

                {leaderboardData?.me && (
                  <div className="mb-3 p-3 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-sky-500 block">
                        SENİN SIRAN
                      </span>
                      <span className="font-bold">
                        #{leaderboardData.me.rank} · {leaderboardData.me.entry.playerName}
                      </span>
                    </div>
                    <span className="font-bold text-lg text-sky-500">
                      {leaderboardData.me.entry.score}
                    </span>
                  </div>
                )}

                {!leaderboardData || leaderboardData.entries.length === 0 ? (
                  <p className={`text-center text-xs py-8 ${mutedText}`}>Henüz kayıtlı skor yok.</p>
                ) : (
                  <div className="space-y-2">
                    {leaderboardData.entries.map((entry) => (
                      <div
                        key={`${entry.memberId}-${entry.rank}`}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                          isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-bold w-6 ${mutedText}`}>#{entry.rank}</span>
                          <div>
                            <div className="font-bold">{entry.playerName}</div>
                            <div className={`text-[10px] ${mutedText}`}>
                              Max Kombo x{entry.maxCombo} • {entry.blocksCleared} Blok
                            </div>
                          </div>
                        </div>
                        <div className="font-bold text-base text-sky-500">{entry.score}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
