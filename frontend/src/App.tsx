import {
  BoardLayout,
  DEFAULT_LAYOUT,
  DEFAULT_SIDES,
  GameMode,
  GyrogonSimulator,
  PolygonSides,
  SUPPORTED_SIDES,
  isSupportedLayout,
  isSupportedSides
} from '@gyrogon/game-core';
import {
  Award,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  Coins,
  Columns3,
  Download,
  Flame,
  Gamepad2,
  Gift,
  Globe,
  HelpCircle,
  Hexagon,
  Home,
  Layers,
  LogOut,
  Mail,
  Palette,
  Pause,
  Pencil,
  Play,
  PlusSquare,
  RotateCcw,
  Settings,
  Share,
  Share2,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Snowflake,
  Target,
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
import {
  ActivePowerUpKind,
  GyrogonCanvasView,
  HudUpdatePayload,
  PowerUpHint
} from './canvas/GyrogonCanvasView';
import { AvatarPickerModal } from './components/AvatarPickerModal';
import {
  DEFAULT_AVATAR_FRAME,
  DEFAULT_AVATAR_URL,
  PlayerAvatar
} from './components/AvatarCatalog';
import { LeaderboardModalContent } from './components/LeaderboardModalContent';
import { Tooltip } from './components/Tooltip';
import { ADMOB_ENABLED, showRewardedAd } from './services/adBridge';
import {
  DailyChallengeInfo,
  LeaderboardBoard,
  LeaderboardData,
  PlayerBanInfoDTO,
  PlayerProfileDTO,
  PlayerStatsDTO,
  StartSessionResponse,
  SubmitSessionResponse,
  claimDailyStreak,
  claimQuestApi,
  confirmPasswordResetApi,
  deleteMyAccountApi,
  ensureGuestAuth,
  equipThemeApi,
  exchangeOAuthCodeApi,
  fetchAuthProvidersApi,
  fetchDailyChallenge,
  fetchLeaderboard,
  fetchPlayerProfile,
  fetchPlayerStats,
  generateGuestDisplayName,
  getFacebookLoginUrl,
  hasStoredSession,
  loginEmailApi,
  logoutEmailAccount,
  purchaseThemeApi,
  registerEmailApi,
  requestPasswordResetApi,
  startSession,
  submitSession,
  syncPendingReplays,
  updateServerDisplayName,
  updateServerProfile
} from './services/api';
import { analyticsTracker } from './services/analytics';
import {
  initNativeShell,
  isNativeApp,
  subscribeAppLifecycle
} from './services/nativeBridge';
import { getPendingReplayCount } from './services/offlineQueue';
import { PwaState, getPwaState, promptPwaInstall, subscribePwaState } from './services/pwa';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  Language,
  TRANSLATIONS,
  getInitialLanguage,
  getLocale
} from './i18n/translations';
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

const POWERUP_STYLES: Record<
  ActivePowerUpKind,
  {
    symbol: string;
    badgeClass: string;
    cardLight: string;
    cardDark: string;
  }
> = {
  bomb: {
    symbol: 'B',
    badgeClass: 'bg-[#e74c3c] text-white',
    cardLight: 'bg-white/90 border-rose-300 text-[#2c3e50]',
    cardDark: 'bg-[#0F1626]/88 border-rose-500/45 text-slate-100'
  },
  joker: {
    symbol: '★',
    badgeClass: 'bg-[#f1c40f] text-[#2c3e50]',
    cardLight: 'bg-white/90 border-amber-400 text-[#2c3e50]',
    cardDark: 'bg-[#0F1626]/88 border-amber-400/45 text-slate-100'
  },
  freeze: {
    symbol: '❄',
    badgeClass: 'bg-[#3498db] text-white',
    cardLight: 'bg-white/90 border-sky-400 text-[#2c3e50]',
    cardDark: 'bg-[#0F1626]/88 border-sky-400/45 text-slate-100'
  }
};

const STORAGE_KEYS = {
  HIGH_CLASSIC: 'gyrogon_high_classic_v2',
  HIGH_DAILY: 'gyrogon_high_daily_v2',
  HIGH_BY_POLY: 'gyrogon_high_poly_v1',
  SIDES: 'gyrogon_sides_v1',
  LAYOUT: 'gyrogon_layout_v1',
  COINS: 'gyrogon_coins_v2',
  UNLOCKED_THEMES: 'gyrogon_themes_v3',
  EQUIPPED_THEME: 'gyrogon_equipped_theme_v4',
  PLAYER_NAME: 'gyrogon_player_name_v2',
  AVATAR_URL: 'gyrogon_avatar_url_v1',
  AVATAR_FRAME: 'gyrogon_avatar_frame_v1',
  QUESTS: 'gyrogon_quests_v2',
  STREAK: 'gyrogon_streak_v2'
};

// Seamless one-time migration from legacy browser storage keys
try {
  for (const newKey of Object.values(STORAGE_KEYS)) {
    const oldKey = newKey.replace(/^gyrogon_/, 'hexacore_');
    if (localStorage.getItem(newKey) === null) {
      const legacyVal = localStorage.getItem(oldKey);
      if (legacyVal !== null) {
        localStorage.setItem(newKey, legacyVal);
        localStorage.removeItem(oldKey);
      }
    }
  }
} catch {
  // ignore
}

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

function formatLocalizedDate(isoDate: string, lang: Language): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat(getLocale(lang), {
    day: 'numeric',
    month: 'long'
  }).format(parsed);
}

function formatLeaderboardPeriod(board: LeaderboardBoard, periodKey: string, lang: Language): string {
  const dict = TRANSLATIONS[lang];
  if (board === 'classic' || periodKey === 'all-time') {
    return dict.lbGlobal;
  }

  const todayWord = lang === 'en' ? 'Today' : lang === 'sq' ? 'Sot' : 'Bugün';
  const weekWord = lang === 'en' ? 'This Week' : lang === 'sq' ? 'Këtë Javë' : 'Bu Hafta';

  if (board === 'daily') {
    const today = new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
      const label = formatLocalizedDate(periodKey, lang);
      return periodKey === today ? `${todayWord} · ${label}` : label;
    }
    return todayWord;
  }

  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (match) {
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
    const start = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);

    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const shortFmt = new Intl.DateTimeFormat(getLocale(lang), { day: 'numeric', month: 'short' });
    const rangeText = sameMonth
      ? `${start.getUTCDate()}–${shortFmt.format(end)}`
      : `${shortFmt.format(start)} – ${shortFmt.format(end)}`;
    return `${weekWord} · ${rangeText}`;
  }

  return weekWord;
}

export const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => getInitialLanguage());
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const t = TRANSLATIONS[lang];
  const locale = getLocale(lang);
  const currentLangOption = LANGUAGE_OPTIONS.find((opt) => opt.code === lang) ?? LANGUAGE_OPTIONS[0];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.siteTitle;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang, t.siteTitle]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-lang-menu]')) return;
      setLangMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [langMenuOpen]);

  const handleSelectLanguage = useCallback((next: Language) => {
    setLang(next);
    setLangMenuOpen(false);
  }, []);

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
  const [simulator, setSimulator] = useState<GyrogonSimulator | null>(null);
  const sessionRef = useRef<StartSessionResponse | null>(null);

  const [playerName, setPlayerName] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME)?.trim();
    if (hasStoredSession()) {
      if (saved && !/^gyropilot$/i.test(saved)) {
        return saved;
      }
      return generateGuestDisplayName();
    }
    if (saved && /^GyroPilot\d+$/i.test(saved)) {
      return saved;
    }
    return generateGuestDisplayName();
  });
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
        const parsed = (JSON.parse(raw) as unknown[]).filter(
          (c): c is ThemeId => typeof c === 'string' && c in THEMES
        );
        return Array.from(new Set<ThemeId>(['cyberpunk', 'classic', ...parsed]));
      }
    } catch {
      // fallback
    }
    return ['cyberpunk', 'classic'];
  });
  const [equippedTheme, setEquippedTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.EQUIPPED_THEME) as ThemeId | null;
    return saved && saved in THEMES ? saved : 'cyberpunk';
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
  const [activeModal, setActiveModal] = useState<
    'none' | 'help' | 'shop' | 'leaderboard' | 'rewards' | 'account' | 'settings' | 'install'
  >('none');
  const [rewardsTab, setRewardsTab] = useState<'quests' | 'streak'>('quests');
  const [accountTab, setAccountTab] = useState<'profile' | 'avatar'>('profile');
  const [pwaState, setPwaState] = useState<PwaState>(() => getPwaState());
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [lbBoard, setLbBoard] = useState<LeaderboardBoard>('classic');
  const [avatarUrl, setAvatarUrl] = useState<string>(() =>
    hasStoredSession()
      ? localStorage.getItem(STORAGE_KEYS.AVATAR_URL)?.trim() || DEFAULT_AVATAR_URL
      : DEFAULT_AVATAR_URL
  );
  const [avatarFrame, setAvatarFrame] = useState<string>(() =>
    hasStoredSession()
      ? localStorage.getItem(STORAGE_KEYS.AVATAR_FRAME)?.trim() || DEFAULT_AVATAR_FRAME
      : DEFAULT_AVATAR_FRAME
  );
  const [unlockedServerItems, setUnlockedServerItems] = useState<string[]>(['cyberpunk', 'classic']);
  const [startingGame, setStartingGame] = useState(false);
  const [playerId, setPlayerId] = useState<string | undefined>(undefined);
  const [playerEmail, setPlayerEmail] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<{
    email: boolean;
    apple: boolean;
    google: boolean;
    facebook: boolean;
  }>({ email: false, apple: false, google: false, facebook: false });
  const [facebookAuthEnabled, setFacebookAuthEnabled] = useState(false);
  const [banInfo, setBanInfo] = useState<PlayerBanInfoDTO | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStatsDTO | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [authTab, setAuthTab] = useState<'register' | 'login' | 'forgot'>('register');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [resetDevCode, setResetDevCode] = useState<string | null>(null);
  const [registerNameInput, setRegisterNameInput] = useState<string>(() => {
    if (!hasStoredSession()) return '';
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME)?.trim() || '';
    return saved && !/^GyroPilot\d*$/i.test(saved) ? saved : '';
  });
  const [displayNameDraft, setDisplayNameDraft] = useState<string>(() => playerName);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordConfirmInput, setPasswordConfirmInput] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const canClaimStreakToday = lastStreakDate !== todayStr;
  const claimableQuestsCount = quests.filter((q) => !q.claimed && q.progress >= q.target).length;
  const rewardsBadgeCount = claimableQuestsCount + (canClaimStreakToday ? 1 : 0);
  const activeTheme = THEMES[equippedTheme] ?? THEMES.cyberpunk;
  const isLight = activeTheme.isLight;
  const isSignedIn = Boolean(
    playerEmail ||
      linkedProviders.email ||
      linkedProviders.facebook ||
      linkedProviders.google ||
      linkedProviders.apple
  );
  const scoreKey = layout === 'polygon' ? `${mode}:${sides}` : `${mode}:${sides}:${layout}`;
  const activeHighScore = highScores[scoreKey] ?? 0;

  const pauseIfPlaying = useCallback(() => {
    if (phase === 'PLAYING') {
      setPhase('PAUSED');
    }
  }, [phase]);

  const applyServerPlayerProfile = useCallback(
    (
      player: PlayerProfileDTO,
      opts: { resetHighScores?: boolean; syncDisplayName?: boolean } = {}
    ) => {
      setPlayerId(player.id);
      setPlayerEmail(player.email ?? null);
      setLinkedProviders({
        email: Boolean(player.linkedProviders?.email ?? player.email),
        apple: Boolean(player.linkedProviders?.apple),
        google: Boolean(player.linkedProviders?.google),
        facebook: Boolean(player.linkedProviders?.facebook)
      });
      setBanInfo(player.banInfo?.isBanned ? player.banInfo : null);
      if (opts.syncDisplayName && player.displayName) {
        setPlayerName(player.displayName);
        setDisplayNameDraft(player.displayName);
      }
      setCoins(player.hexaCoins);
      setStreakCount(player.streakCount);
      setLastStreakDate(player.lastStreakClaimDate);
      setHighScores((prev) =>
        opts.resetHighScores
          ? {
              'classic:6': player.highScoreClassic,
              'daily:6': player.highScoreDaily
            }
          : {
              ...prev,
              'classic:6': Math.max(prev['classic:6'] ?? 0, player.highScoreClassic),
              'daily:6': Math.max(prev['daily:6'] ?? 0, player.highScoreDaily)
            }
      );

      const validUnlocked = player.unlockedItems.filter((c): c is ThemeId => c in THEMES);
      setUnlockedServerItems(
        player.unlockedItems.length > 0 ? player.unlockedItems : ['cyberpunk', 'classic']
      );
      setUnlockedThemes(
        validUnlocked.length > 0
          ? Array.from(new Set<ThemeId>(['cyberpunk', 'classic', ...validUnlocked]))
          : ['cyberpunk', 'classic']
      );
      if (player.equippedTheme in THEMES) {
        setEquippedTheme(player.equippedTheme as ThemeId);
      }
      if (player.avatarUrl) {
        setAvatarUrl(player.avatarUrl);
      }
      if (player.avatarFrame) {
        setAvatarFrame(player.avatarFrame);
      }
    },
    []
  );

  const handleInstallPwa = useCallback(async () => {
    if (pwaState.canPromptInstall) {
      const result = await promptPwaInstall();
      if (result !== 'unavailable') return;
    }
    setActiveModal('install');
  }, [pwaState.canPromptInstall]);

  useEffect(() => subscribePwaState(setPwaState), []);

  const openRewardsModal = useCallback(
    (preferredTab?: 'quests' | 'streak') => {
      pauseIfPlaying();
      if (preferredTab) {
        setRewardsTab(preferredTab);
      } else {
        setRewardsTab(claimableQuestsCount === 0 && canClaimStreakToday ? 'streak' : 'quests');
      }
      setActiveModal('rewards');
    },
    [canClaimStreakToday, claimableQuestsCount, pauseIfPlaying]
  );

  const refreshPlayerStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const stats = await fetchPlayerStats({ existingOnly: true });
      if (stats) {
        setPlayerStats(stats);
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const applyOfflineRunToStats = useCallback(
    (
      prev: PlayerStatsDTO | null,
      run: {
        mode: GameMode;
        sides: PolygonSides;
        score: number;
        maxCombo: number;
        blocksCleared: number;
        coinsEarned: number;
      },
      unlockedCount: number
    ): PlayerStatsDTO => {
      const base: PlayerStatsDTO = prev ?? {
        totalGames: 0,
        classicGames: 0,
        dailyGames: 0,
        totalBlocksCleared: 0,
        totalScore: 0,
        averageScore: 0,
        bestScore: 0,
        bestScoreClassic: 0,
        bestScoreDaily: 0,
        bestCombo: 0,
        totalCoinsEarned: 0,
        questsCompleted: 0,
        unlockedThemesCount: unlockedCount,
        totalThemesCount: Object.keys(THEMES).length,
        favoriteSides: null,
        memberSince: null,
        bySides: SUPPORTED_SIDES.map((s) => ({ sides: s, games: 0, bestScore: 0, blocksCleared: 0 })),
        recentGames: []
      };

      const totalGames = base.totalGames + 1;
      const classicGames = base.classicGames + (run.mode === 'classic' ? 1 : 0);
      const dailyGames = base.dailyGames + (run.mode === 'daily' ? 1 : 0);
      const totalBlocksCleared = base.totalBlocksCleared + run.blocksCleared;
      const totalScore = base.totalScore + run.score;
      const averageScore = Math.round(totalScore / totalGames);
      const bestScoreClassic =
        run.mode === 'classic' ? Math.max(base.bestScoreClassic, run.score) : base.bestScoreClassic;
      const bestScoreDaily =
        run.mode === 'daily' ? Math.max(base.bestScoreDaily, run.score) : base.bestScoreDaily;
      const bestScore = Math.max(bestScoreClassic, bestScoreDaily, run.score);
      const bestCombo = Math.max(base.bestCombo, run.maxCombo);
      const totalCoinsEarned = base.totalCoinsEarned + run.coinsEarned;

      const bySides = SUPPORTED_SIDES.map((s) => {
        const existing = base.bySides.find((item) => item.sides === s) ?? {
          sides: s,
          games: 0,
          bestScore: 0,
          blocksCleared: 0
        };
        if (s !== run.sides) return existing;
        return {
          sides: s,
          games: existing.games + 1,
          bestScore: Math.max(existing.bestScore, run.score),
          blocksCleared: existing.blocksCleared + run.blocksCleared
        };
      });

      let favoriteSides: PolygonSides | null = null;
      let bestSideEntry = bySides[0];
      for (const item of bySides) {
        if (
          item.games > 0 &&
          (!bestSideEntry ||
            bestSideEntry.games === 0 ||
            item.games > bestSideEntry.games ||
            (item.games === bestSideEntry.games && item.bestScore > bestSideEntry.bestScore))
        ) {
          bestSideEntry = item;
        }
      }
      if (bestSideEntry && bestSideEntry.games > 0) {
        favoriteSides = bestSideEntry.sides;
      }

      const recentGames = [
        {
          id: `local-${Date.now()}`,
          mode: run.mode,
          sides: run.sides,
          score: run.score,
          maxCombo: run.maxCombo,
          blocksCleared: run.blocksCleared,
          coinsEarned: run.coinsEarned,
          createdAt: new Date().toISOString()
        },
        ...base.recentGames
      ].slice(0, 5);

      return {
        ...base,
        totalGames,
        classicGames,
        dailyGames,
        totalBlocksCleared,
        totalScore,
        averageScore,
        bestScore,
        bestScoreClassic,
        bestScoreDaily,
        bestCombo,
        totalCoinsEarned,
        unlockedThemesCount: unlockedCount,
        totalThemesCount: Object.keys(THEMES).length,
        favoriteSides,
        bySides,
        recentGames
      };
    },
    []
  );

  const openAccountModal = useCallback(() => {
    pauseIfPlaying();
    setConfirmDelete(false);
    setAccountMessage(null);
    setAccountError(null);
    setAccountTab('profile');
    setResetStep('request');
    setResetCodeInput('');
    setResetDevCode(null);
    setAuthTab((prev) => (prev === 'forgot' ? 'login' : prev));
    setDisplayNameDraft(playerName);
    if (!isSignedIn) {
      setRegisterNameInput(!/^GyroPilot\d*$/i.test(playerName) ? playerName : '');
    }
    setActiveModal('account');
    if (isSignedIn) {
      void refreshPlayerStats();
    }
  }, [isSignedIn, pauseIfPlaying, playerName, refreshPlayerStats]);

  useEffect(() => {
    setShareCopied(false);
  }, [phase]);

  // Keep document background & theme-color synced with active theme
  useEffect(() => {
    document.body.style.backgroundColor = activeTheme.canvasBg;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', activeTheme.canvasBg);
    }
  }, [activeTheme]);

  // Native shell + analytics tracker + online/offline queue sync + Guest JWT bootstrap
  useEffect(() => {
    void initNativeShell();
    analyticsTracker.start();
    void fetchDailyChallenge().then(setDailyInfo);
    void fetchAuthProvidersApi().then((providers) => setFacebookAuthEnabled(providers.facebook));
    void getPendingReplayCount().then(setPendingSyncCount);

    const bootstrap = async () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        const rawHash = window.location.hash;
        if (rawHash.startsWith('#fb_auth=') || rawHash.startsWith('#fb_error=')) {
          const params = new URLSearchParams(rawHash.slice(1));
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          const fbCode = params.get('fb_auth');
          const fbErr = params.get('fb_error');
          if (fbCode) {
            const exchanged = await exchangeOAuthCodeApi(fbCode);
            if (exchanged.ok) {
              applyServerPlayerProfile(exchanged.player, { syncDisplayName: true });
              analyticsTracker.syncIdentity();
              await refreshServerQuests();
              setAccountError(null);
              setAccountMessage(t.msgFacebookSignedIn);
              setActiveModal('account');
              synthAudio.play('joker');
              return;
            }
            setAuthTab('login');
            setAccountError(exchanged.error);
            setActiveModal('account');
          } else if (fbErr) {
            setAuthTab('login');
            setAccountError(fbErr === 'cancelled' ? t.errFacebookCancelled : t.errFacebookFailed);
            setActiveModal('account');
          }
        }
      }

      const synced = await syncPendingReplays();
      if (synced > 0) {
        setPendingSyncCount(await getPendingReplayCount());
      }
      const res = await fetchPlayerProfile({ existingOnly: true });
      if (!res) return;
      if (!res.player) {
        setPlayerId(undefined);
        setPlayerEmail(null);
        setLinkedProviders({ email: false, apple: false, google: false, facebook: false });
        setAvatarUrl(DEFAULT_AVATAR_URL);
        setAvatarFrame(DEFAULT_AVATAR_FRAME);
        setUnlockedServerItems(['cyberpunk', 'classic']);
        setPlayerName((prev) => {
          const next = /^GyroPilot\d+$/i.test(prev) ? prev : generateGuestDisplayName();
          setDisplayNameDraft(next);
          return next;
        });
        setRegisterNameInput('');
        return;
      }
      analyticsTracker.syncIdentity();
      const { player, quests: serverQuests, streakRewards: rewards, stats } = res;
      applyServerPlayerProfile(player, {
        syncDisplayName:
          Boolean(
            player.email ||
              player.linkedProviders?.facebook ||
              player.linkedProviders?.google ||
              player.linkedProviders?.apple
          ) || !/^gyropilot$/i.test(player.displayName)
      });
      if (stats) setPlayerStats(stats);
      if (rewards.length === 7) setStreakRewards(rewards);

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
    analyticsTracker.setPlaying(phase === 'PLAYING', { mode, sides, layout });
  }, [layout, mode, phase, sides]);

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
    try {
      localStorage.setItem(STORAGE_KEYS.AVATAR_URL, avatarUrl);
    } catch {
      // ignore if quota exceeded
    }
  }, [avatarUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AVATAR_FRAME, avatarFrame);
  }, [avatarFrame]);

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

      let effectiveName = playerName;
      if (!hasStoredSession()) {
        const created = await ensureGuestAuth(playerName);
        if (created) {
          applyServerPlayerProfile(created, {
            syncDisplayName: Boolean(created.email) || !/^gyropilot$/i.test(created.displayName)
          });
          if (created.displayName && !/^gyropilot$/i.test(created.displayName)) {
            effectiveName = created.displayName;
          }
          analyticsTracker.syncIdentity();
        }
      }

      const session = await startSession(selectedMode, effectiveName, selectedSides);
      if (session.banned) {
        setBanInfo(
          session.banInfo ?? {
            isBanned: true,
            isPermanent: true,
            bannedUntil: null,
            banReason: null
          }
        );
        setStartingGame(false);
        return;
      }
      sessionRef.current = session;

      const sim = new GyrogonSimulator(session.seed, selectedSides);
      setSimulator(sim);
      setHud({
        score: 0,
        combo: 1,
        comboRatio: 0,
        maxCombo: 1,
        blocksCleared: 0,
        coinsEarned: 0,
        freezeSecondsLeft: 0,
        danger: false,
        powerUpHint: undefined
      });
      setPhase('PLAYING');
      setStartingGame(false);
      analyticsTracker.recordGameStart({
        mode: selectedMode,
        sides: selectedSides,
        layout
      });
    },
    [highScores, layout, mode, playerName, sides]
  );

  const finalizeGameOver = useCallback(
    async (sim: GyrogonSimulator) => {
      setPhase('GAMEOVER');
      analyticsTracker.recordGameComplete(sim.score);

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

        if (res.source === 'backend') {
          void refreshPlayerStats();
        } else {
          setPlayerStats((prev) =>
            applyOfflineRunToStats(
              prev,
              {
                mode,
                sides: sim.sides,
                score: res.score,
                maxCombo: res.maxCombo,
                blocksCleared: res.blocksCleared,
                coinsEarned: res.coinsEarned
              },
              unlockedThemes.length
            )
          );
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
    [activeHighScore, applyOfflineRunToStats, layout, mode, playerName, refreshPlayerStats, unlockedThemes.length]
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
      if (!ADMOB_ENABLED) return;
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

  const refreshServerQuests = async () => {
    const profileRes = await fetchPlayerProfile();
    if (profileRes?.stats) {
      setPlayerStats(profileRes.stats);
    }
    if (profileRes?.quests && profileRes.quests.length > 0) {
      setQuests(
        profileRes.quests.map((q) => ({
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

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountMessage(null);

    const trimmedName = registerNameInput.trim().slice(0, 24);
    if (authTab === 'register' && trimmedName.length < 2) {
      setAccountError(t.errNameShort);
      return;
    }

    const normalizedEmail = emailInput.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setAccountError(t.errEmailInvalid);
      return;
    }
    if (passwordInput.length < 6) {
      setAccountError(t.errPasswordShort);
      return;
    }
    if (authTab === 'register' && passwordInput !== passwordConfirmInput) {
      setAccountError(t.errPasswordMismatch);
      return;
    }

    setAuthSubmitting(true);
    const res =
      authTab === 'register'
        ? await registerEmailApi(normalizedEmail, passwordInput, trimmedName)
        : await loginEmailApi(normalizedEmail, passwordInput);

    if (res.ok) {
      applyServerPlayerProfile(res.player, { syncDisplayName: true });
      analyticsTracker.syncIdentity();
      await refreshServerQuests();
      setRegisterNameInput('');
      setEmailInput('');
      setPasswordInput('');
      setPasswordConfirmInput('');
      setAccountMessage(
        authTab === 'register'
          ? t.msgAccountCreated
          : res.merged
            ? t.msgLoginMerged
            : t.msgLoginSynced
      );
      synthAudio.play('joker');
    } else {
      setAccountError(res.error);
    }
    setAuthSubmitting(false);
  };

  const handleRequestPasswordReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAccountError(null);
    setAccountMessage(null);

    const normalizedEmail = emailInput.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setAccountError(t.errEmailInvalid);
      return;
    }

    setAuthSubmitting(true);
    const res = await requestPasswordResetApi(normalizedEmail, lang);
    if (res.ok) {
      setResetStep('confirm');
      setResetCodeInput('');
      setResetDevCode(res.devCode ?? null);
      setPasswordInput('');
      setPasswordConfirmInput('');
      setAccountMessage(t.msgResetCodeSent);
    } else {
      setAccountError(res.error);
    }
    setAuthSubmitting(false);
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountMessage(null);

    const normalizedEmail = emailInput.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setAccountError(t.errEmailInvalid);
      return;
    }

    const cleanCode = resetCodeInput.replace(/\D/g, '').slice(0, 6);
    if (cleanCode.length !== 6) {
      setAccountError(t.errResetCodeInvalid);
      return;
    }

    if (passwordInput.length < 6) {
      setAccountError(t.errPasswordShort);
      return;
    }
    if (passwordInput !== passwordConfirmInput) {
      setAccountError(t.errPasswordMismatch);
      return;
    }

    setAuthSubmitting(true);
    const res = await confirmPasswordResetApi(normalizedEmail, cleanCode, passwordInput);
    if (res.ok) {
      applyServerPlayerProfile(res.player, { syncDisplayName: true });
      analyticsTracker.syncIdentity();
      await refreshServerQuests();
      setRegisterNameInput('');
      setEmailInput('');
      setPasswordInput('');
      setPasswordConfirmInput('');
      setResetCodeInput('');
      setResetDevCode(null);
      setResetStep('request');
      setAuthTab('login');
      setAccountMessage(t.msgPasswordResetSuccess);
      synthAudio.play('joker');
    } else {
      setAccountError(res.error);
    }
    setAuthSubmitting(false);
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) return;
    setAccountError(null);
    setAccountMessage(null);

    const trimmed = displayNameDraft.trim().slice(0, 24);
    if (trimmed.length < 2) {
      setAccountError(t.errNameShort);
      return;
    }
    if (trimmed === playerName) return;

    setSavingDisplayName(true);
    const updated = await updateServerDisplayName(trimmed);
    if (updated) {
      applyServerPlayerProfile(updated, { syncDisplayName: true });
      setAccountMessage(t.msgNameUpdated);
    } else {
      setAccountError(t.errNameUpdateFailed);
    }
    setSavingDisplayName(false);
  };

  const handleLogoutAccount = async () => {
    setAuthSubmitting(true);
    setAccountError(null);
    setAccountMessage(null);
    setBanInfo(null);
    setPlayerStats(null);

    const freshGuest = await logoutEmailAccount();
    try {
      localStorage.removeItem(STORAGE_KEYS.HIGH_CLASSIC);
      localStorage.removeItem(STORAGE_KEYS.HIGH_DAILY);
      localStorage.removeItem(STORAGE_KEYS.HIGH_BY_POLY);
    } catch {
      // ignore
    }

    if (freshGuest) {
      applyServerPlayerProfile(freshGuest, { resetHighScores: true, syncDisplayName: true });
      await refreshServerQuests();
    } else {
      const nextGuestName = generateGuestDisplayName();
      setPlayerId(undefined);
      setPlayerEmail(null);
      setLinkedProviders({ email: false, apple: false, google: false, facebook: false });
      setPlayerName(nextGuestName);
      setDisplayNameDraft(nextGuestName);
      setAvatarUrl(DEFAULT_AVATAR_URL);
      setAvatarFrame(DEFAULT_AVATAR_FRAME);
      setUnlockedServerItems(['cyberpunk', 'classic']);
      setCoins(100);
      setHighScores({});
      setStreakCount(0);
      setLastStreakDate(null);
      setUnlockedThemes(['cyberpunk', 'classic']);
      setEquippedTheme('cyberpunk');
      setQuests(createInitialQuests(todayStr).items);
    }

    setRegisterNameInput('');
    setEmailInput('');
    setPasswordInput('');
    setPasswordConfirmInput('');
    setAccountMessage(t.msgLoggedOut);
    setAuthSubmitting(false);
  };

  const handleDeleteAccount = async () => {
    await deleteMyAccountApi();
    const nextGuestName = generateGuestDisplayName();
    setConfirmDelete(false);
    setActiveModal('none');
    setPlayerId(undefined);
    setPlayerEmail(null);
    setLinkedProviders({ email: false, apple: false, google: false, facebook: false });
    setBanInfo(null);
    setPlayerStats(null);
    setPlayerName(nextGuestName);
    setDisplayNameDraft(nextGuestName);
    setAvatarUrl(DEFAULT_AVATAR_URL);
    setAvatarFrame(DEFAULT_AVATAR_FRAME);
    setUnlockedServerItems(['cyberpunk', 'classic']);
    setRegisterNameInput('');
    setEmailInput('');
    setPasswordInput('');
    setPasswordConfirmInput('');
    setCoins(100);
    setHighScores({});
    setStreakCount(0);
    setLastStreakDate(null);
    setUnlockedThemes(['cyberpunk', 'classic']);
    setEquippedTheme('cyberpunk');
    setSimulator(null);
    setPhase('MENU');
  };

  const handleShareScore = async () => {
    const scoreVal = simulator?.score ?? 0;
    const modeLabel = mode === 'daily' ? t.shareDailyMode : t.shareClassicMode;
    const layoutLabel = layout === 'polygon' ? '' : ` · ${t.layouts[layout]}`;
    const text = `GYROGON (${modeLabel} · ${t.polygons[sides]}${layoutLabel}) ${t.shareScoreWord} ${scoreVal.toLocaleString(locale)} ${t.sharePointsExcl} ${t.shareMaxComboPrefix} x${simulator?.maxCombo ?? 1} — ${t.shareCta} https://gyrogon.com`;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: t.shareTitle,
          text,
          url: 'https://gyrogon.com'
        });
        return;
      }
    } catch {
      // Paylaşım iptal edildiyse veya desteklenmiyorsa panoya kopyalamayı dene
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      // ignore
    }
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

  // Keyboard shortcuts (Enter/Space to start, arrows/WASD to rotate)
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

  const openLeaderboard = async (targetBoard: LeaderboardBoard = mode) => {
    pauseIfPlaying();
    setLbBoard(targetBoard);
    setActiveModal('leaderboard');
    const data = await fetchLeaderboard(targetBoard);
    setLeaderboardData(data);
  };

  const handleSaveAvatar = async (nextAvatarUrl: string, nextFrameId: string) => {
    if (!isSignedIn) return;
    setAvatarUrl(nextAvatarUrl);
    setAvatarFrame(nextFrameId);

    if (hasStoredSession()) {
      const updated = await updateServerProfile({
        avatarUrl: nextAvatarUrl,
        avatarFrame: nextFrameId
      });
      if (updated) {
        applyServerPlayerProfile(updated, { syncDisplayName: true });
      }
    }

    setAccountMessage(t.msgAvatarUpdated);
    setAccountError(null);
    setAccountTab('profile');
  };

  const handleBuyOrEquipTheme = async (themeId: ThemeId) => {
    const targetTheme = THEMES[themeId];
    if (unlockedThemes.includes(themeId)) {
      const serverRes = await equipThemeApi(themeId);
      setEquippedTheme((serverRes?.equippedTheme as ThemeId) ?? themeId);
      return;
    }
    if (coins < targetTheme.price) return;

    const serverRes = await purchaseThemeApi(themeId);
    if (serverRes) {
      setCoins(serverRes.hexaCoins);
      const valid = serverRes.unlockedItems.filter((c): c is ThemeId => c in THEMES);
      setUnlockedThemes(Array.from(new Set<ThemeId>(['cyberpunk', 'classic', ...valid])));
      setEquippedTheme(serverRes.equippedTheme as ThemeId);
      synthAudio.play('joker');
    } else {
      setCoins((c) => c - targetTheme.price);
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

  // Theme-aware UI classes (Light Classic vs Dark Neon)
  const cardSurface = isLight ? 'glass-card-light text-[#2c3e50]' : 'glass-card-dark text-slate-50';
  const pillBtn = isLight
    ? 'bg-white/80 hover:bg-white text-[#2c3e50] border border-[#2c3e50]/15 shadow-sm'
    : 'bg-[#0F1626]/80 hover:bg-[#172136] text-slate-100 border border-white/15';
  const mutedText = isLight ? 'text-[#5b6b78]' : 'text-slate-400';

  const renderLanguageSwitcher = (compact: boolean) => (
    <div className="relative" data-lang-menu>
      <button
        type="button"
        onClick={() => setLangMenuOpen((prev) => !prev)}
        className={`flex items-center cursor-pointer transition-all ${
          compact
            ? `gap-1 px-2 py-1.5 rounded-xl font-mono text-[11px] font-bold ${pillBtn}`
            : `gap-1.5 px-2.5 lg:px-3 py-2 lg:py-2.5 rounded-2xl font-mono text-xs font-bold ${
                langMenuOpen
                  ? isLight
                    ? 'bg-[#2c3e50] text-white border border-[#2c3e50]'
                    : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                  : pillBtn
              }`
        }`}
        aria-label={t.langTooltip}
        aria-expanded={langMenuOpen}
      >
        <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />
        <span>{currentLangOption?.short ?? lang.toUpperCase()}</span>
      </button>

      {langMenuOpen && (
        <div
          className={`absolute right-0 top-full mt-2 min-w-[144px] p-1.5 rounded-2xl shadow-xl z-50 space-y-1 ${cardSurface}`}
          role="menu"
        >
          {LANGUAGE_OPTIONS.map((opt) => {
            const selected = opt.code === lang;
            return (
              <button
                key={opt.code}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => handleSelectLanguage(opt.code)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  selected
                    ? isLight
                      ? 'bg-[#2c3e50] text-white'
                      : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                    : isLight
                      ? 'hover:bg-[#ecf0f1] text-[#2c3e50]'
                      : 'hover:bg-white/10 text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{opt.flag}</span>
                  <span>{opt.label}</span>
                </span>
                <span className="font-mono text-[10px] opacity-70">{opt.short}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPowerUpHint = (hint: PowerUpHint) => {
    const style = POWERUP_STYLES[hint.kind];
    const copy = t.powerups[hint.kind];
    const isIncoming = hint.state === 'incoming';
    return (
      <div
        className={`pointer-events-none flex items-center gap-2.5 px-3 py-2 rounded-2xl border shadow-lg backdrop-blur-md ${
          isLight ? style.cardLight : style.cardDark
        }`}
      >
        <span
          className={`w-7 h-7 rounded-lg font-extrabold text-sm flex items-center justify-center shrink-0 shadow-sm ${style.badgeClass}`}
        >
          {style.symbol}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs">{copy.title}</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                isIncoming
                  ? isLight
                    ? 'bg-[#ecf0f1] text-[#2c3e50]'
                    : 'bg-white/10 text-cyan-300'
                  : 'bg-emerald-500/20 text-emerald-500'
              }`}
            >
              {isIncoming ? t.powerupIncoming : t.powerupActive}
            </span>
          </div>
          <p className={`text-[11px] mt-0.5 leading-snug ${mutedText}`}>
            {isIncoming ? copy.incomingDesc : copy.activatedDesc}
          </p>
        </div>
      </div>
    );
  };

  const renderPlayerStatsSection = () => {
    const localMaxHigh = Math.max(0, ...Object.values(highScores));
    const stats: PlayerStatsDTO = playerStats ?? {
      totalGames: 0,
      classicGames: 0,
      dailyGames: 0,
      totalBlocksCleared: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: localMaxHigh,
      bestScoreClassic: highScores['classic:6'] ?? 0,
      bestScoreDaily: highScores['daily:6'] ?? 0,
      bestCombo: 0,
      totalCoinsEarned: 0,
      questsCompleted: 0,
      unlockedThemesCount: unlockedThemes.length,
      totalThemesCount: Object.keys(THEMES).length,
      favoriteSides: null,
      memberSince: null,
      bySides: SUPPORTED_SIDES.map((s) => ({ sides: s, games: 0, bestScore: 0, blocksCleared: 0 })),
      recentGames: []
    };

    const effectiveBestScore = Math.max(stats.bestScore, localMaxHigh);
    const tileClass = `p-2.5 rounded-xl border ${
      isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
    }`;

    const metrics = [
      {
        label: t.statsGamesLabel,
        value: stats.totalGames.toLocaleString(locale),
        sub: `${t.classicShort} ${stats.classicGames} · ${t.dailyShort} ${stats.dailyGames}`,
        icon: <Gamepad2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />
      },
      {
        label: t.statsClearedLabel,
        value: stats.totalBlocksCleared.toLocaleString(locale),
        sub: t.statsClearedSub,
        icon: <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      },
      {
        label: t.statsBestScoreLabel,
        value: effectiveBestScore.toLocaleString(locale),
        sub: `${t.classicShort} ${stats.bestScoreClassic.toLocaleString(locale)} · ${t.dailyShort} ${stats.bestScoreDaily.toLocaleString(locale)}`,
        icon: <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      },
      {
        label: t.statsBestComboLabel,
        value: stats.bestCombo > 0 ? `x${stats.bestCombo}` : '-',
        sub: t.statsBestComboSub,
        icon: <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
      },
      {
        label: t.statsTotalScoreLabel,
        value: stats.totalScore.toLocaleString(locale),
        sub: t.statsAllGamesSub,
        icon: <Zap className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-purple-600' : 'text-cyan-400'}`} />
      },
      {
        label: t.statsAvgScoreLabel,
        value: stats.averageScore.toLocaleString(locale),
        sub: t.statsAvgSub,
        icon: <Target className="w-3.5 h-3.5 text-sky-500 shrink-0" />
      },
      {
        label: t.statsCoinEarningsLabel,
        value: stats.totalCoinsEarned.toLocaleString(locale),
        sub: t.statsMatchCoinsSub,
        icon: <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      },
      {
        label: t.statsQuestsDoneLabel,
        value: stats.questsCompleted.toLocaleString(locale),
        sub: t.statsQuestsDoneSub,
        icon: <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      }
    ];

    return (
      <div
        className={`p-3.5 rounded-2xl space-y-3 ${
          isLight ? 'bg-[#ecf0f1]' : 'bg-white/5 border border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
            <BarChart3 className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#2c3e50]' : 'text-cyan-400'}`} />
            <span>{t.statsTitle}</span>
          </div>
          {statsLoading && !playerStats ? (
            <span className={`text-[11px] font-mono ${mutedText}`}>{t.statsLoadingShort}</span>
          ) : isSignedIn && stats.memberSince ? (
            <span className={`text-[11px] ${mutedText}`}>
              {t.statsJoinedPrefix}{' '}
              {new Date(stats.memberSince).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className={tileClass}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className={`text-[10px] font-semibold truncate ${mutedText}`}>{m.label}</span>
                {m.icon}
              </div>
              <div className="font-extrabold text-sm sm:text-base leading-tight">{m.value}</div>
              <div className={`text-[10px] mt-0.5 truncate ${mutedText}`}>{m.sub}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-[10px] font-mono uppercase ${mutedText}`}>
              {t.statsPolyRecordsHeader}
            </span>
            {stats.favoriteSides !== null && (
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30'
                }`}
              >
                {t.statsFavoritePrefix} {stats.favoriteSides} {t.statsSideSuffix}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {SUPPORTED_SIDES.map((s) => {
              const entry = stats.bySides.find((b) => b.sides === s) ?? {
                sides: s,
                games: 0,
                bestScore: 0,
                blocksCleared: 0
              };
              const isFavorite = stats.favoriteSides === s;
              return (
                <div
                  key={s}
                  className={`p-2 rounded-xl border text-center ${
                    isFavorite
                      ? isLight
                        ? 'bg-sky-50 border-sky-400'
                        : 'bg-cyan-500/15 border-cyan-400/50'
                      : isLight
                        ? 'bg-white border-[#d5dbdb]'
                        : 'bg-black/30 border-white/10'
                  }`}
                >
                  <div className="font-mono font-bold text-[11px]">
                    {s}
                    {t.sideBadgeSuffix}
                  </div>
                  <div className="font-extrabold text-xs mt-0.5">
                    {entry.bestScore.toLocaleString(locale)}
                  </div>
                  <div className={`text-[9px] mt-0.5 ${mutedText}`}>
                    {entry.games} {t.statsGameUnit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className={`text-[10px] font-mono uppercase mb-1.5 ${mutedText}`}>{t.statsRecentHeader}</div>
          {stats.recentGames.length > 0 ? (
            <div className="space-y-1.5">
              {stats.recentGames.map((g) => (
                <div
                  key={g.id}
                  className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                    isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        g.mode === 'daily'
                          ? 'bg-amber-500/20 text-amber-500'
                          : isLight
                            ? 'bg-[#ecf0f1] text-[#2c3e50]'
                            : 'bg-white/10 text-slate-200'
                      }`}
                    >
                      {g.mode === 'daily' ? t.dailyShort : t.classicShort}
                    </span>
                    <span className="font-mono font-bold text-[11px] shrink-0">
                      {g.sides}
                      {t.sideBadgeSuffix}
                    </span>
                    <span className={`text-[10px] truncate ${mutedText}`}>
                      {new Date(g.createdAt).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-xs">
                      {g.score.toLocaleString(locale)} {t.statsPointsUnit}
                    </div>
                    <div className={`text-[10px] ${mutedText}`}>
                      {g.blocksCleared} {t.statsBlocksUnit} · x{g.maxCombo}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`p-3 rounded-xl border text-center text-[11px] ${
                isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
              } ${mutedText}`}
            >
              {t.statsEmptyLong}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 w-screen h-dvh overflow-hidden ${isLight ? 'font-classic' : 'grid-bg-dark'}`}
      style={{ backgroundColor: activeTheme.canvasBg }}
    >
      {/* FULL-SCREEN GAME CANVAS (100% Viewport) */}
      <div className="absolute inset-0 z-0">
        <GyrogonCanvasView
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
        className="fixed top-0 inset-x-0 z-30 flex items-start justify-between gap-1.5 sm:gap-2 px-2.5 py-2.5 sm:p-4 lg:p-5 pointer-events-none"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
      >
        {/* Top-Left: High Score / Combo / Live Indicators */}
        <div className="flex flex-col gap-1.5 pointer-events-auto min-w-0 max-w-[49%] sm:max-w-none">
          <div
            className={`inline-flex items-center gap-2 sm:gap-3 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl min-w-0 max-w-full ${pillBtn}`}
          >
            <div className="min-w-0">
              <span className={`text-[9px] sm:text-[10px] uppercase tracking-wider block leading-none truncate ${mutedText}`}>
                {t.recordUpper} ({t.polygons[sides]}
                {layout === 'polygon' ? '' : ` · ${t.layouts[layout]}`})
              </span>
              <span className="font-bold text-sm sm:text-lg leading-tight">
                {Math.max(activeHighScore, hud.score).toLocaleString(locale)}
              </span>
            </div>
            {phase === 'PLAYING' && (
              <>
                <div className={`w-[1px] h-5 sm:h-6 shrink-0 ${isLight ? 'bg-[#2c3e50]/15' : 'bg-white/15'}`} />
                <div className="shrink-0">
                  <span className={`text-[9px] sm:text-[10px] uppercase tracking-wider block leading-none ${mutedText}`}>
                    {t.comboUpper}
                  </span>
                  <span
                    className={`font-bold text-sm sm:text-lg leading-tight ${
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
                className={`px-2 py-1 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1 animate-pulse ${
                  isLight
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                    : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {hud.morphNextTarget === 'bloom' ? (
                  <>
                    <Columns3 className="w-3.5 h-3.5" />
                    {hud.morphCountdown}s {t.morphToBloom}
                  </>
                ) : (
                  <>
                    <Hexagon className="w-3.5 h-3.5" />
                    {hud.morphCountdown}s {t.morphToPolygon}
                  </>
                )}
              </span>
            )}
            {hud.freezeSecondsLeft > 0 && phase === 'PLAYING' && (
              <span
                className={`px-2 py-1 rounded-xl border text-[11px] sm:text-xs font-mono font-bold flex items-center gap-1 ${
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
              <span className="px-2 py-1 rounded-xl bg-[#e74c3c] text-white text-[10px] sm:text-[11px] font-bold animate-pulse">
                {t.dangerAlert}
              </span>
            )}
            {(!isOnline || pendingSyncCount > 0) && (
              <span
                className={`px-2 py-1 rounded-xl border text-[10px] sm:text-[11px] font-mono flex items-center gap-1 ${
                  isLight
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                }`}
              >
                <WifiOff className="w-3.5 h-3.5" />
                {!isOnline ? t.offlineShort : `${pendingSyncCount} ${t.queuedSuffix}`}
              </span>
            )}
          </div>

          {phase === 'PLAYING' && hud.powerUpHint && (
            <div className="hidden sm:block pointer-events-none max-w-[270px]">
              {renderPowerUpHint(hud.powerUpHint)}
            </div>
          )}
        </div>

        {/* Top-Right (Mobile): Ultra-clean Coins + Language + Settings */}
        <div className="flex sm:hidden items-center justify-end gap-1 shrink-0 pointer-events-auto">
          <button
            onClick={() => {
              pauseIfPlaying();
              setActiveModal('shop');
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer ${pillBtn}`}
            aria-label={t.coinsBalanceArenaAria}
          >
            <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{coins}</span>
          </button>

          {renderLanguageSwitcher(true)}

          <button
            onClick={() => {
              pauseIfPlaying();
              setActiveModal('settings');
            }}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${pillBtn}`}
            aria-label={t.settingsAndHelpAria}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Top-Right (Desktop / Landscape >=640px): Single non-wrapping row */}
        <div className="hidden sm:flex flex-nowrap items-center justify-end gap-1.5 lg:gap-2 shrink-0 pointer-events-auto">
          {/* 1. Oyun Kategorileri */}
          <div className={`inline-flex items-center gap-0.5 lg:gap-1 p-1 rounded-2xl ${cardSurface}`}>
            <button
              onClick={() => openRewardsModal()}
              className={`relative inline-flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeModal === 'rewards'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/40'
                  : isLight
                    ? 'hover:bg-[#ecf0f1] text-[#2c3e50]'
                    : 'hover:bg-white/10 text-slate-100'
              }`}
              aria-label={t.rewardsAria}
            >
              <Gift className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="hidden md:inline">{t.rewards}</span>
              {rewardsBadgeCount > 0 && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-[#e74c3c] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {rewardsBadgeCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                pauseIfPlaying();
                setActiveModal('shop');
              }}
              className={`inline-flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeModal === 'shop'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-purple-400/20 text-purple-200 border border-purple-400/40'
                  : isLight
                    ? 'hover:bg-[#ecf0f1] text-[#2c3e50]'
                    : 'hover:bg-white/10 text-slate-100'
              }`}
              aria-label={t.shopAria}
            >
              <Palette className="w-4 h-4 text-purple-500 shrink-0" />
              <span className="hidden md:inline">{t.shop}</span>
            </button>

            <button
              onClick={() => void openLeaderboard(mode)}
              className={`inline-flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeModal === 'leaderboard'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-sky-400/20 text-sky-200 border border-sky-400/40'
                  : isLight
                    ? 'hover:bg-[#ecf0f1] text-[#2c3e50]'
                    : 'hover:bg-white/10 text-slate-100'
              }`}
              aria-label={t.leaderboardAria}
            >
              <Trophy className="w-4 h-4 text-sky-500 shrink-0" />
              <span className="hidden md:inline">{t.leaderboard}</span>
            </button>
          </div>

          {/* 2. Ekonomi & Hesap */}
          <div className={`inline-flex items-center gap-1 p-1 rounded-2xl ${cardSurface}`}>
            <Tooltip label={t.coinsTooltip} isLight={isLight}>
              <button
                onClick={() => {
                  pauseIfPlaying();
                  setActiveModal('shop');
                }}
                className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={t.coinsBalanceAria}
              >
                <Coins className="w-4 h-4 text-amber-500" />
                <span>{coins}</span>
              </button>
            </Tooltip>

            <div className={`w-[1px] h-5 ${isLight ? 'bg-[#2c3e50]/15' : 'bg-white/15'}`} />

            <Tooltip
              label={isSignedIn ? t.accountMyTooltip : t.accountGuestTooltip}
              isLight={isLight}
              align="right"
            >
              <button
                onClick={openAccountModal}
                className={`inline-flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeModal === 'account'
                    ? isLight
                      ? 'bg-[#2c3e50] text-white'
                      : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                    : isLight
                      ? 'hover:bg-[#ecf0f1] text-[#2c3e50]'
                      : 'hover:bg-white/10 text-slate-100'
                }`}
                aria-label={isSignedIn ? t.accountMyTooltip : t.accountGuestTooltip}
              >
                {isSignedIn ? (
                  <PlayerAvatar
                    avatarUrl={avatarUrl}
                    frameId={avatarFrame}
                    size="xs"
                    isLight={isLight}
                  />
                ) : (
                  <User className="w-4 h-4 text-sky-500 shrink-0" />
                )}
                <span className="max-w-[90px] lg:max-w-[110px] truncate">
                  {isSignedIn ? playerName : t.guestAuthBtn}
                </span>
              </button>
            </Tooltip>
          </div>

          {/* 3. Dil & Ayarlar */}
          {renderLanguageSwitcher(false)}

          <Tooltip label={t.settingsTooltip} isLight={isLight} align="right">
            <button
              onClick={() => {
                pauseIfPlaying();
                setActiveModal('settings');
              }}
              className={`p-2 lg:p-2.5 rounded-2xl transition-all cursor-pointer ${
                activeModal === 'settings'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white border border-[#2c3e50]'
                    : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                  : pillBtn
              }`}
              aria-label={t.settingsTooltip}
            >
              <Settings className="w-4 h-4 lg:w-5 lg:h-5" />
            </button>
          </Tooltip>
        </div>
      </header>

      {/* CENTERED CONTROLS DIRECTLY ABOVE HEXAGON WHILE PLAYING / PAUSED */}
      {(phase === 'PLAYING' || phase === 'PAUSED') && (
        <div className="fixed left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-auto play-controls-pos">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl ${pillBtn}`}>
            <Tooltip label={phase === 'PAUSED' ? t.resumeWithKey : t.pauseWithKey} isLight={isLight}>
              <button
                onClick={() => setPhase(phase === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={phase === 'PAUSED' ? t.resumeGame : t.pauseGame}
              >
                {phase === 'PAUSED' ? (
                  <Play className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Pause className="w-5 h-5" />
                )}
              </button>
            </Tooltip>

            <Tooltip label={t.restartGame} isLight={isLight}>
              <button
                onClick={() => void handleStartGame(mode)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={t.restartGame}
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip label={soundOn ? t.soundOnTooltip : t.soundOffTooltip} isLight={isLight}>
              <button
                onClick={toggleSound}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-[#ecf0f1]' : 'hover:bg-white/10'
                }`}
                aria-label={soundOn ? t.soundOnTooltip : t.soundOffTooltip}
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
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-[4.5rem] sm:pb-3 md:pb-8 px-3 sm:px-4">
          {/* Larger Title & Subtitle: inside upper polygon when closed, upper-center when bloomed */}
          <div
            className={`fixed left-1/2 -translate-x-1/2 text-center select-none px-3 transition-all duration-500 ${
              layout === 'bloom' ? 'menu-title-bloom' : 'menu-title-polygon'
            }`}
          >
            <h1
              className={`leading-[0.95] tracking-tight ${
                isLight ? 'font-classic font-light text-[#2c3e50]' : 'font-display font-extrabold text-white'
              }`}
              style={{ fontSize: 'clamp(1.75rem, 8.2vmin, 5.5rem)' }}
            >
              GYRO<span className={isLight ? 'font-bold text-[#2c3e50]' : 'text-cyan-400'}>GON</span>
            </h1>
            <p
              className={`mt-1.5 sm:mt-2 mx-auto font-medium leading-snug ${
                isLight ? 'text-[#3d5166]' : 'text-slate-200/90'
              }`}
              style={{
                fontSize: 'clamp(0.75rem, 2.1vmin, 1.1rem)',
                maxWidth: 'min(84vw, 58vmin)'
              }}
            >
              {mode === 'daily'
                ? `${t.dailyPuzzleTitle} (${dailyInfo?.date ? formatLocalizedDate(dailyInfo.date, lang) : t.todayWord}) · ${t.dailySameOrderSub}`
                : layout === 'bloom'
                  ? t.menuBloomSub
                  : layout === 'morph'
                    ? t.menuMorphSub
                    : t.menuClassicSub}
            </p>
          </div>

          {/* Prominent "Oyna!" CTA: inside lower polygon when closed, cleanly above bloomed bar when open */}
          <div
            className={`fixed left-1/2 -translate-x-1/2 pointer-events-auto transition-all duration-500 ${
              layout === 'bloom' ? 'menu-cta-bloom' : 'menu-cta-polygon'
            }`}
          >
            <button
              onClick={() => void handleStartGame(mode)}
              disabled={startingGame}
              className={`inline-flex items-center gap-2 sm:gap-2.5 px-7 py-2.5 sm:px-10 sm:py-3.5 rounded-full text-base sm:text-xl font-extrabold tracking-wide cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                isLight
                  ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white border-2 border-white/80 shadow-[0_10px_28px_rgba(46,204,113,0.45)]'
                  : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 text-slate-950 border border-white/30 shadow-[0_0_32px_rgba(0,240,255,0.45)]'
              }`}
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>{startingGame ? t.preparingBtn : t.playUpperBtn}</span>
            </button>
          </div>

          {/* Bottom Compact Mode + Polygon (3..8) + Board Form Switcher (2 tidy rows on mobile, 1 row on desktop) */}
          <div
            className={`pointer-events-auto w-full max-w-[390px] sm:w-auto sm:max-w-none flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl ${cardSurface}`}
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between gap-1.5 sm:contents">
              <div
                className={`inline-flex shrink-0 p-0.5 rounded-xl ${
                  isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
                }`}
              >
                <Tooltip label={t.modeClassicTooltip} isLight={isLight} position="top">
                  <button
                    onClick={() => setMode('classic')}
                    className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all cursor-pointer ${
                      mode === 'classic'
                        ? isLight
                          ? 'bg-[#2c3e50] text-white'
                          : 'bg-cyan-400 text-slate-950'
                        : mutedText
                    }`}
                  >
                    {t.classicShort}
                  </button>
                </Tooltip>
                <Tooltip label={t.modeDailyTooltip} isLight={isLight} position="top">
                  <button
                    onClick={() => setMode('daily')}
                    className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      mode === 'daily'
                        ? isLight
                          ? 'bg-[#e74c3c] text-white'
                          : 'bg-pink-500 text-white'
                        : mutedText
                    }`}
                  >
                    <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>{t.dailyShort}</span>
                  </button>
                </Tooltip>
              </div>

              <div
                className={`flex-1 sm:flex-none grid grid-cols-6 sm:inline-flex sm:order-3 items-center p-0.5 rounded-xl ${
                  isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
                }`}
              >
                {SUPPORTED_SIDES.map((s) => (
                  <Tooltip
                    key={s}
                    label={t.polygons[s]}
                    isLight={isLight}
                    position="top"
                    className="w-full sm:w-auto min-w-0"
                  >
                    <button
                      onClick={() => setSides(s)}
                      className={`w-full sm:w-9 h-7 sm:h-9 rounded-lg text-[11px] sm:text-sm font-mono font-bold transition-all cursor-pointer ${
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

            {/* Board Form Switcher */}
            <div
              className={`grid grid-cols-3 sm:inline-flex sm:order-2 p-0.5 rounded-xl ${
                isLight ? 'bg-[#ecf0f1]' : 'bg-black/40 border border-white/10'
              }`}
            >
              <Tooltip
                label={t.layoutPolygonTooltip}
                isLight={isLight}
                position="top"
                className="w-full sm:w-auto min-w-0"
              >
                <button
                  onClick={() => setLayout('polygon')}
                  className={`w-full sm:w-auto justify-center px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 min-w-0 ${
                    layout === 'polygon'
                      ? isLight
                        ? 'bg-[#2c3e50] text-white'
                        : 'bg-cyan-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Hexagon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">{t.layouts.polygon}</span>
                </button>
              </Tooltip>
              <Tooltip
                label={t.layoutBloomTooltip}
                isLight={isLight}
                position="top"
                className="w-full sm:w-auto min-w-0"
              >
                <button
                  onClick={() => setLayout('bloom')}
                  className={`w-full sm:w-auto justify-center px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 min-w-0 ${
                    layout === 'bloom'
                      ? isLight
                        ? 'bg-[#2ecc71] text-white'
                        : 'bg-emerald-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Columns3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">{t.layouts.bloom}</span>
                </button>
              </Tooltip>
              <Tooltip
                label={t.layoutMorphTooltip}
                isLight={isLight}
                position="top"
                className="w-full sm:w-auto min-w-0"
              >
                <button
                  onClick={() => setLayout('morph')}
                  className={`w-full sm:w-auto justify-center px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 min-w-0 ${
                    layout === 'morph'
                      ? isLight
                        ? 'bg-[#9b59b6] text-white'
                        : 'bg-fuchsia-400 text-slate-950'
                      : mutedText
                  }`}
                >
                  <Shuffle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">{t.layouts.morph}</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVBAR (MENU only — hides during PLAYING so touch controls stay unobstructed) */}
      {phase === 'MENU' && (
        <nav
          aria-label={t.navCategoriesAria}
          className="sm:hidden fixed inset-x-3 bottom-2 z-20 pointer-events-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className={`grid grid-cols-5 gap-1 p-1 rounded-2xl shadow-lg ${cardSurface}`}>
            <button
              onClick={() => setActiveModal('none')}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeModal === 'none'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-white/15 text-white border border-white/20'
                  : isLight
                    ? 'text-[#2c3e50] hover:bg-[#ecf0f1]'
                    : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label={t.playShort}
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>{t.playShort}</span>
            </button>

            <button
              onClick={() => openRewardsModal()}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeModal === 'rewards'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/40'
                  : isLight
                    ? 'text-[#2c3e50] hover:bg-[#ecf0f1]'
                    : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label={t.rewards}
            >
              <Gift className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{t.rewards}</span>
              {rewardsBadgeCount > 0 && (
                <span className="absolute top-1 right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#e74c3c] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {rewardsBadgeCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveModal('shop')}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeModal === 'shop'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-purple-400/20 text-purple-200 border border-purple-400/40'
                  : isLight
                    ? 'text-[#2c3e50] hover:bg-[#ecf0f1]'
                    : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label={t.shop}
            >
              <Palette className="w-4 h-4 text-purple-500 shrink-0" />
              <span>{t.shop}</span>
            </button>

            <button
              onClick={() => void openLeaderboard(mode)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeModal === 'leaderboard'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-sky-400/20 text-sky-200 border border-sky-400/40'
                  : isLight
                    ? 'text-[#2c3e50] hover:bg-[#ecf0f1]'
                    : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label={t.leaderboard}
            >
              <Trophy className="w-4 h-4 text-sky-500 shrink-0" />
              <span>{t.leaderboard}</span>
            </button>

            <button
              onClick={openAccountModal}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeModal === 'account'
                  ? isLight
                    ? 'bg-[#2c3e50] text-white'
                    : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                  : isLight
                    ? 'text-[#2c3e50] hover:bg-[#ecf0f1]'
                    : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label={isSignedIn ? t.accountMyTooltip : t.account}
            >
              <User className="w-4 h-4 text-sky-500 shrink-0" />
              {isSignedIn && (
                <span className="absolute top-1.5 right-3.5 w-2 h-2 rounded-full bg-emerald-500" />
              )}
              <span>{t.account}</span>
            </button>
          </div>
        </nav>
      )}

      {/* MOBILE POWER-UP HINT (Non-blocking above bottom touch controls) */}
      {phase === 'PLAYING' && hud.powerUpHint && (
        <div
          className="sm:hidden fixed bottom-[4.25rem] left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(92vw,340px)]"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          {renderPowerUpHint(hud.powerUpHint)}
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
              className={`px-3.5 min-[370px]:px-5 py-2.5 rounded-2xl font-bold text-xs whitespace-nowrap cursor-pointer ${pillBtn}`}
            >
              {t.leftMobileBtn}
            </button>
            <button
              onPointerDown={() => handleFastDropChange(true)}
              onPointerUp={() => handleFastDropChange(false)}
              onPointerLeave={() => handleFastDropChange(false)}
              className={`px-3.5 min-[370px]:px-5 py-2.5 rounded-2xl font-bold text-xs whitespace-nowrap cursor-pointer ${pillBtn}`}
            >
              {t.fastMobileBtn}
            </button>
            <button
              onPointerDown={() => handleRotate(1)}
              className={`px-3.5 min-[370px]:px-5 py-2.5 rounded-2xl font-bold text-xs whitespace-nowrap cursor-pointer ${pillBtn}`}
            >
              {t.rightMobileBtn}
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
              <span className={`text-[11px] ${mutedText}`}>{t.orWord}</span>
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
                {layout === 'bloom' ? t.shiftVerb : layout === 'morph' ? t.rotateOrShiftVerb : t.rotateVerb}
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
              <span className="font-semibold ml-0.5">{t.speedUpVerb}</span>
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
              <span className="font-semibold ml-0.5">{t.pauseVerb}</span>
            </div>
          </div>
        </div>
      )}

      {/* PAUSED / REVIVE / GAMEOVER CENTER OVERLAY */}
      {(phase === 'PAUSED' || phase === 'REVIVE_OFFER' || phase === 'GAMEOVER') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div
            className={`w-full ${
              phase === 'GAMEOVER' ? 'max-w-[420px]' : 'max-w-sm'
            } max-h-[92dvh] overflow-y-auto custom-scroll ${
              isLight ? 'custom-scroll-light' : 'custom-scroll-dark'
            } rounded-3xl p-4 sm:p-6 text-center shadow-2xl ${cardSurface}`}
          >
            {phase === 'PAUSED' && (
              <>
                <h2 className="text-2xl font-bold mb-2">{t.pausedTitle}</h2>
                <p className={`text-xs mb-6 ${mutedText}`}>
                  {t.pausedDesc}
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => setPhase('PLAYING')}
                    className={`w-full py-3 rounded-xl font-bold text-sm cursor-pointer ${
                      isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {t.resumeGame}
                  </button>
                  <button
                    onClick={() => void handleStartGame(mode)}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm cursor-pointer ${pillBtn}`}
                  >
                    {t.restartGame}
                  </button>
                  <button
                    onClick={() => {
                      setSimulator(null);
                      setPhase('MENU');
                    }}
                    className={`w-full py-2 text-xs cursor-pointer ${mutedText}`}
                  >
                    {t.backToMainMenu}
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
                  {t.polygons[sides].toLocaleUpperCase(locale)} {t.overflowedSuffix}
                </h2>
                <p className={`text-xs mb-5 ${mutedText}`}>
                  {t.reviveScorePrefix} <strong>{(simulator?.score ?? 0).toLocaleString(locale)}</strong>. {t.reviveOuterDesc}
                </p>
                <div className="flex flex-col gap-2.5">
                  {ADMOB_ENABLED && (
                    <button
                      onClick={() => void handleRevive('ad')}
                      className="w-full py-3 rounded-xl bg-[#2ecc71] text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                    >
                      {t.reviveAdBtn}
                    </button>
                  )}
                  <button
                    onClick={() => void handleRevive('coins')}
                    disabled={coins < 50}
                    className={`w-full py-3 rounded-xl font-extrabold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      !ADMOB_ENABLED
                        ? isLight
                          ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white shadow-[0_8px_20px_rgba(46,204,113,0.3)]'
                          : 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950'
                        : isLight
                          ? 'bg-amber-100 border border-amber-400 text-amber-900'
                          : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {t.reviveCoinsBtnPrefix} ({t.reviveBalanceLabel} {coins})
                  </button>
                  <button
                    onClick={handleDeclineRevive}
                    className={`w-full py-2 text-xs cursor-pointer ${mutedText}`}
                  >
                    {t.skipReviveBtn}
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
                    {mode === 'daily' ? t.dailyShort : t.classicShort} · {t.polygons[sides]}
                    {layout === 'polygon' ? '' : ` · ${t.layouts[layout]}`}
                  </span>
                  {isNewRecord && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide bg-amber-400 text-slate-950 shadow-sm">
                      {t.newRecordBadge}
                    </span>
                  )}
                </div>

                {/* Hero Score */}
                <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${mutedText}`}>
                  {t.gameOverUpper}
                </div>
                <div
                  className={`text-4xl sm:text-6xl font-extrabold tracking-tight my-1.5 tabular-nums ${
                    isLight ? 'text-[#2c3e50]' : 'text-white'
                  }`}
                >
                  {(simulator?.score ?? 0).toLocaleString(locale)}
                </div>
                <div className={`text-xs font-medium mb-5 ${mutedText}`}>
                  {isNewRecord
                    ? prevBestRef.current > 0
                      ? `${t.prevBestBeatPrefix}${prevBestRef.current.toLocaleString(locale)}${t.prevBestBeatSuffix}`
                      : t.firstRecordSaved
                    : `${t.modeRecordPrefix} ${Math.max(activeHighScore, simulator?.score ?? 0).toLocaleString(locale)}`}
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
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>{t.maxComboLabel}</div>
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
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>{t.clearedBlocksLabel}</div>
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
                    <div className={`text-[10px] font-semibold mt-0.5 ${mutedText}`}>{t.earnedCoinsLabel}</div>
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
                      <span>{t.savingScore}</span>
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
                        {t.scoreSavedBoard}
                        {verificationResult.rank ? ` · #${verificationResult.rank}${t.rankSuffix}` : ''}
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
                        <div className="font-bold">{t.scoreSavedLocalTitle}</div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-sky-800/80' : 'text-sky-200/75'}`}>
                          {t.scoreSavedLocalDesc}
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
                        <div className="font-bold">{t.scoreUnverifiedTitle}</div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-amber-900/80' : 'text-amber-200/75'}`}>
                          {t.scoreUnverifiedDesc}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary + Secondary Actions */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => void handleStartGame(mode)}
                    className={`w-full py-3.5 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      isLight
                        ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)]'
                        : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 text-slate-950 shadow-[0_0_24px_rgba(0,240,255,0.3)]'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t.playAgainBtn}
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => void openLeaderboard(mode)}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer ${pillBtn}`}
                    >
                      <Trophy className="w-4 h-4 text-sky-500" />
                      {t.leaderboard}
                    </button>
                    <button
                      onClick={() => void handleShareScore()}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer ${pillBtn}`}
                    >
                      <Share2 className="w-4 h-4 text-emerald-500" />
                      {shareCopied ? t.scoreCopiedBtn : t.shareScoreBtn}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setSimulator(null);
                      setPhase('MENU');
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer ${pillBtn}`}
                  >
                    <Home className="w-4 h-4 opacity-75" />
                    {t.mainMenuBtn}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS (HELP, SHOP, REWARDS, LEADERBOARD, ACCOUNT, SETTINGS, INSTALL) ================= */}
      {activeModal !== 'none' && (
        <div
          onClick={() => setActiveModal('none')}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${
              activeModal === 'help'
                ? 'max-w-[1024px]'
                : activeModal === 'account' || activeModal === 'leaderboard'
                  ? 'max-w-lg'
                  : 'max-w-md'
            } rounded-3xl p-4 sm:p-6 max-h-[88dvh] overflow-y-auto custom-scroll ${
              isLight ? 'custom-scroll-light' : 'custom-scroll-dark'
            } ${cardSurface}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                {activeModal === 'help' && t.modalHelp}
                {activeModal === 'shop' && t.modalShop}
                {activeModal === 'rewards' && t.modalRewards}
                {activeModal === 'leaderboard' && t.modalLeaderboard}
                {activeModal === 'account' &&
                  (isNativeApp() ? t.modalAccountPrivacy : isSignedIn ? t.modalMyAccount : t.modalAccount)}
                {activeModal === 'settings' && t.modalSettings}
                {activeModal === 'install' && t.modalInstall}
              </h3>
              <button
                onClick={() => setActiveModal('none')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${pillBtn}`}
              >
                {t.closeBtn}
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
                    {t.helpBasicsTitle}
                  </h4>
                  <p className={mutedText}>
                    {t.helpBasicsBodyBeforeStrong}
                    <strong>{t.helpBasicsBodyStrong}</strong>
                    {t.helpBasicsBodyAfterStrong}
                  </p>
                </section>

                {/* 2. Kontroller */}
                <section
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <h4 className="font-bold text-sm mb-3">{t.helpControlsTitle}</h4>
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{t.helpRotatePolygon}</span>
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
                        <span className={`text-[11px] ${mutedText}`}>{t.orWord}</span>
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
                          {t.helpMobileTap}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{t.helpFastDrop}</span>
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
                        <span className={`text-[11px] ${mutedText}`}>{t.orWord}</span>
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
                          {t.helpMobileSwipe}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{t.helpPauseResume}</span>
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
                        <span className={`text-[11px] ${mutedText}`}>{t.orWord}</span>
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
                    {t.helpPowerupsTitle}
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#e74c3c] text-white font-bold flex items-center justify-center shrink-0">
                        B
                      </span>
                      <div>
                        <div className="font-bold">{t.powerups.bomb.title}</div>
                        <div className={mutedText}>{t.helpBombDetail}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#f1c40f] text-[#2c3e50] font-bold flex items-center justify-center shrink-0">
                        ★
                      </span>
                      <div>
                        <div className="font-bold">{t.powerups.joker.title}</div>
                        <div className={mutedText}>{t.helpJokerDetail}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#3498db] text-white font-bold flex items-center justify-center shrink-0">
                        ❄
                      </span>
                      <div>
                        <div className="font-bold">{t.powerups.freeze.title}</div>
                        <div className={mutedText}>{t.helpFreezeDetail}</div>
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
                    <h4 className="font-bold text-sm mb-1.5">{t.helpComboTitle}</h4>
                    <p className={mutedText}>
                      {t.helpComboBefore1}
                      <strong>{t.helpComboStrong1}</strong>
                      {t.helpComboMiddle}
                      <strong>x2, x3, x4...</strong>
                      {t.helpComboAfter}
                    </p>
                  </section>

                  <section
                    className={`p-4 rounded-2xl border flex-1 ${
                      isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <h4 className="font-bold text-sm mb-2">{t.helpModesTitle}</h4>
                    <ul className={`space-y-1.5 list-disc pl-4 ${mutedText}`}>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>
                          {t.helpModeClassicDailyLabel}
                        </strong>{' '}
                        {t.helpModeClassicDailyDesc}
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>
                          {t.helpModeBloomLabel}
                        </strong>{' '}
                        {t.helpModeBloomDesc}
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>
                          {t.helpModeMorphLabel}
                        </strong>{' '}
                        {t.helpModeMorphDesc}
                      </li>
                      <li>
                        <strong className={isLight ? 'text-[#2c3e50]' : 'text-white'}>
                          {t.helpModePolyLabel}
                        </strong>{' '}
                        {t.helpModePolyDesc}
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
                  <h4 className="font-bold text-sm mb-3">{t.helpMenuGuideTitle}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="flex items-start gap-2">
                      <Coins className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">GyroCoins</div>
                        <div className={mutedText}>{t.helpCoinsDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Gift className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{t.rewards}</div>
                        <div className={mutedText}>{t.helpRewardsDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Palette className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{t.modalShop}</div>
                        <div className={mutedText}>{t.helpShopDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Trophy className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{t.modalLeaderboard}</div>
                        <div className={mutedText}>{t.helpLeaderboardDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{t.modalAccount}</div>
                        <div className={mutedText}>{t.helpAccountDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{t.modalSettings}</div>
                        <div className={mutedText}>{t.helpSettingsDesc}</div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeModal === 'account' && (
              <div className="space-y-4 text-xs">
                {!isSignedIn ? (
                  <>
                    <div
                      className={`p-3 rounded-2xl border leading-relaxed ${
                        isLight
                          ? 'bg-sky-50 border-sky-200 text-sky-950'
                          : 'bg-sky-500/10 border-sky-500/25 text-sky-100'
                      }`}
                    >
                      <span className="font-bold block mb-0.5">{t.guestBannerTitle}</span>
                      <span className={isLight ? 'text-sky-900/80' : 'text-sky-200/80'}>
                        {t.guestBannerDesc}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded-2xl ${isLight ? 'bg-[#ecf0f1]' : 'bg-white/5 border border-white/10'}`}>
                      {authTab !== 'forgot' ? (
                        <>
                          <div
                            className={`grid grid-cols-2 gap-1 p-1 rounded-xl mb-3 ${
                              isLight ? 'bg-white border border-[#bdc3c7]' : 'bg-black/40 border border-white/10'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setAuthTab('register');
                                setResetStep('request');
                                setResetCodeInput('');
                                setResetDevCode(null);
                                setAccountError(null);
                                setAccountMessage(null);
                                setPasswordInput('');
                                setPasswordConfirmInput('');
                              }}
                              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                authTab === 'register'
                                  ? isLight
                                    ? 'bg-[#2c3e50] text-white'
                                    : 'bg-cyan-400 text-slate-950'
                                  : mutedText
                              }`}
                            >
                              {t.registerTab}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAuthTab('login');
                                setResetStep('request');
                                setResetCodeInput('');
                                setResetDevCode(null);
                                setAccountError(null);
                                setAccountMessage(null);
                                setPasswordInput('');
                                setPasswordConfirmInput('');
                              }}
                              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                authTab === 'login'
                                  ? isLight
                                    ? 'bg-[#2c3e50] text-white'
                                    : 'bg-cyan-400 text-slate-950'
                                  : mutedText
                              }`}
                            >
                              {t.loginTab}
                            </button>
                          </div>

                          <form onSubmit={(e) => void handleEmailAuthSubmit(e)} className="space-y-2.5">
                        {authTab === 'register' && (
                          <div>
                            <label
                              htmlFor="auth-register-name"
                              className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                            >
                              {t.playerNameField}
                            </label>
                            <input
                              id="auth-register-name"
                              type="text"
                              required
                              minLength={2}
                              maxLength={24}
                              value={registerNameInput}
                              onChange={(e) => setRegisterNameInput(e.target.value.slice(0, 24))}
                              placeholder={t.playerNamePlaceholder}
                              className={`w-full px-3 py-2 rounded-xl text-sm font-semibold focus:outline-none ${
                                isLight
                                  ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                  : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                              }`}
                            />
                          </div>
                        )}

                        <div>
                          <label htmlFor="auth-email-input" className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}>
                            {t.emailField}
                          </label>
                          <input
                            id="auth-email-input"
                            type="email"
                            autoComplete="email"
                            required
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder={t.emailPlaceholder}
                            className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                              isLight
                                ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                            }`}
                          />
                        </div>

                        <div>
                          <label htmlFor="auth-password-input" className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}>
                            {authTab === 'register' ? t.passwordFieldRegister : t.passwordField}
                          </label>
                          <input
                            id="auth-password-input"
                            type="password"
                            autoComplete={authTab === 'register' ? 'new-password' : 'current-password'}
                            minLength={6}
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="••••••"
                            className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                              isLight
                                ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                            }`}
                          />
                        </div>

                        {authTab === 'register' && (
                          <div>
                            <label
                              htmlFor="auth-password-confirm-input"
                              className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                            >
                              {t.passwordConfirmField}
                            </label>
                            <input
                              id="auth-password-confirm-input"
                              type="password"
                              autoComplete="new-password"
                              minLength={6}
                              required
                              value={passwordConfirmInput}
                              onChange={(e) => setPasswordConfirmInput(e.target.value)}
                              placeholder="••••••"
                              className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                                isLight
                                  ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                  : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                              }`}
                            />
                          </div>
                        )}

                        {authTab === 'login' && (
                          <div className="flex justify-end -mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setAuthTab('forgot');
                                setResetStep('request');
                                setResetCodeInput('');
                                setResetDevCode(null);
                                setPasswordInput('');
                                setPasswordConfirmInput('');
                                setAccountError(null);
                                setAccountMessage(null);
                              }}
                              className={`text-[11px] font-bold hover:underline cursor-pointer ${
                                isLight ? 'text-[#2980b9]' : 'text-cyan-300'
                              }`}
                            >
                              {t.forgotPasswordLink}
                            </button>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={authSubmitting}
                          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isLight
                              ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white'
                              : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950'
                          }`}
                        >
                          {authSubmitting
                            ? t.processingBtn
                            : authTab === 'register'
                              ? t.createAccountBtn
                              : t.loginBtn}
                        </button>
                      </form>

                          {facebookAuthEnabled && (
                            <div className="mt-3 space-y-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`h-px flex-1 ${isLight ? 'bg-[#bdc3c7]' : 'bg-white/15'}`} />
                                <span className={`text-[10px] font-mono uppercase ${mutedText}`}>
                                  {t.orContinueWith}
                                </span>
                                <div className={`h-px flex-1 ${isLight ? 'bg-[#bdc3c7]' : 'bg-white/15'}`} />
                              </div>

                              <button
                                type="button"
                                disabled={authSubmitting}
                                onClick={() => {
                                  setAccountError(null);
                                  setAccountMessage(null);
                                  window.location.assign(getFacebookLoginUrl());
                                }}
                                className="w-full py-2.5 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M22.675 0h-21.35C.595 0 0 .595 0 1.325v21.351C0 23.405.595 24 1.325 24h11.495v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.405 24 24 23.405 24 22.675V1.325C24 .595 23.405 0 22.675 0z" />
                                </svg>
                                <span>{t.continueWithFacebookBtn}</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-sm">{t.resetPasswordTitle}</h4>
                            <button
                              type="button"
                              onClick={() => {
                                setAuthTab('login');
                                setResetStep('request');
                                setResetCodeInput('');
                                setResetDevCode(null);
                                setPasswordInput('');
                                setPasswordConfirmInput('');
                                setAccountError(null);
                                setAccountMessage(null);
                              }}
                              className={`text-[11px] font-bold hover:underline cursor-pointer ${
                                isLight ? 'text-[#2980b9]' : 'text-cyan-300'
                              }`}
                            >
                              {t.backToLoginBtn}
                            </button>
                          </div>

                          {resetStep === 'request' ? (
                            <form onSubmit={(e) => void handleRequestPasswordReset(e)} className="space-y-2.5">
                              <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                                {t.resetPasswordIntro}
                              </p>
                              <div>
                                <label
                                  htmlFor="reset-email-input"
                                  className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                                >
                                  {t.emailField}
                                </label>
                                <input
                                  id="reset-email-input"
                                  type="email"
                                  autoComplete="email"
                                  required
                                  value={emailInput}
                                  onChange={(e) => setEmailInput(e.target.value)}
                                  placeholder={t.emailPlaceholder}
                                  className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                                    isLight
                                      ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                      : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                                  }`}
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={authSubmitting}
                                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                  isLight
                                    ? 'bg-[#2c3e50] hover:bg-[#1a252f] text-white'
                                    : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950'
                                }`}
                              >
                                {authSubmitting ? t.processingBtn : t.sendResetCodeBtn}
                              </button>
                            </form>
                          ) : (
                            <div className="space-y-2.5">
                              <div
                                className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-[11px] ${
                                  isLight
                                    ? 'bg-white border-[#bdc3c7] text-[#2c3e50]'
                                    : 'bg-black/30 border-white/10 text-slate-200'
                                }`}
                              >
                                <span className="truncate font-semibold">{emailInput.trim()}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetStep('request');
                                    setResetDevCode(null);
                                    setAccountError(null);
                                    setAccountMessage(null);
                                  }}
                                  className={`shrink-0 font-bold hover:underline cursor-pointer ${
                                    isLight ? 'text-[#2980b9]' : 'text-cyan-300'
                                  }`}
                                >
                                  {t.resendCodeBtn}
                                </button>
                              </div>

                              {resetDevCode && (
                                <div
                                  className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                                    isLight
                                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                                      : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                                  }`}
                                >
                                  <span>{t.msgResetDevCodeNotice}</span>
                                  <strong className="font-mono tracking-widest text-sm select-all">
                                    {resetDevCode}
                                  </strong>
                                </div>
                              )}

                              <form onSubmit={(e) => void handleConfirmPasswordReset(e)} className="space-y-2.5">
                                <div>
                                  <label
                                    htmlFor="reset-code-input"
                                    className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                                  >
                                    {t.resetCodeField}
                                  </label>
                                  <input
                                    id="reset-code-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    required
                                    value={resetCodeInput}
                                    onChange={(e) =>
                                      setResetCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                                    }
                                    placeholder={t.resetCodePlaceholder}
                                    className={`w-full px-3 py-2 rounded-xl text-sm font-mono tracking-[0.25em] text-center focus:outline-none ${
                                      isLight
                                        ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                        : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                                    }`}
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor="reset-new-password"
                                    className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                                  >
                                    {t.newPasswordField}
                                  </label>
                                  <input
                                    id="reset-new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={6}
                                    required
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    placeholder="••••••"
                                    className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                                      isLight
                                        ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                        : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                                    }`}
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor="reset-confirm-password"
                                    className={`text-[10px] font-mono uppercase block mb-1 ${mutedText}`}
                                  >
                                    {t.confirmNewPasswordField}
                                  </label>
                                  <input
                                    id="reset-confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={6}
                                    required
                                    value={passwordConfirmInput}
                                    onChange={(e) => setPasswordConfirmInput(e.target.value)}
                                    placeholder="••••••"
                                    className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none ${
                                      isLight
                                        ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                                        : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                                    }`}
                                  />
                                </div>

                                <button
                                  type="submit"
                                  disabled={authSubmitting}
                                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isLight
                                      ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white'
                                      : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950'
                                  }`}
                                >
                                  {authSubmitting ? t.processingBtn : t.resetPasswordSubmitBtn}
                                </button>
                              </form>

                              <button
                                type="button"
                                disabled={authSubmitting}
                                onClick={() => void handleRequestPasswordReset()}
                                className={`w-full py-2 px-3 rounded-xl font-bold text-[11px] transition-all cursor-pointer disabled:opacity-50 ${pillBtn}`}
                              >
                                {t.resendCodeBtn}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-black/30 border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setAccountTab('profile')}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          accountTab === 'profile'
                            ? isLight
                              ? 'bg-[#2c3e50] text-white'
                              : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                            : mutedText
                        }`}
                      >
                        <User className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span>{t.accountProfileTab}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAccountError(null);
                          setAccountMessage(null);
                          setAccountTab('avatar');
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          accountTab === 'avatar'
                            ? isLight
                              ? 'bg-[#2c3e50] text-white'
                              : 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/40'
                            : mutedText
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>{t.modalAvatar}</span>
                      </button>
                    </div>

                    {accountTab === 'avatar' ? (
                      <AvatarPickerModal
                        currentAvatarUrl={avatarUrl}
                        currentFrameId={avatarFrame}
                        unlockedItems={Array.from(new Set([...unlockedServerItems, ...unlockedThemes]))}
                        isLight={isLight}
                        t={t}
                        onSave={handleSaveAvatar}
                        onCancel={() => setAccountTab('profile')}
                      />
                    ) : (
                      <>
                    {/* Profil Özet Kartı */}
                    <div className={`p-3.5 rounded-2xl ${isLight ? 'bg-[#ecf0f1]' : 'bg-white/5 border border-white/10'}`}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAccountError(null);
                              setAccountMessage(null);
                              setAccountTab('avatar');
                            }}
                            title={t.changeAvatarAction}
                            aria-label={t.changeAvatarAction}
                            className="relative group shrink-0 cursor-pointer"
                          >
                            <PlayerAvatar
                              avatarUrl={avatarUrl}
                              frameId={avatarFrame}
                              size="md"
                              isLight={isLight}
                            />
                            <span
                              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border flex items-center justify-center shadow ${
                                isLight
                                  ? 'bg-[#2c3e50] border-white text-white'
                                  : 'bg-cyan-400 border-slate-900 text-slate-950'
                              }`}
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </span>
                          </button>
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{playerName}</div>
                            {playerEmail ? (
                              <div className={`text-[11px] truncate flex items-center gap-1 ${mutedText}`}>
                                <Mail className="w-3 h-3 shrink-0 text-sky-500" />
                                <span className="truncate">{playerEmail}</span>
                              </div>
                            ) : linkedProviders.facebook ? (
                              <div className={`text-[11px] truncate flex items-center gap-1.5 ${mutedText}`}>
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-[#1877F2] text-white text-[9px] font-extrabold leading-none shrink-0">
                                  f
                                </span>
                                <span className="truncate">{t.facebookConnectedLabel}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 font-mono text-[11px] font-bold shrink-0">
                          {t.registeredBadge}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div
                          className={`p-2 rounded-xl text-center border ${
                            isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
                          }`}
                        >
                          <div className="font-extrabold text-sm text-amber-500">{coins}</div>
                          <div className={`text-[10px] ${mutedText}`}>GyroCoins</div>
                        </div>
                        <div
                          className={`p-2 rounded-xl text-center border ${
                            isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
                          }`}
                        >
                          <div className="font-extrabold text-sm text-emerald-500">
                            {streakCount} {t.daysUnit}
                          </div>
                          <div className={`text-[10px] ${mutedText}`}>{t.loginStreakLabel}</div>
                        </div>
                        <div
                          className={`p-2 rounded-xl text-center border ${
                            isLight ? 'bg-white border-[#d5dbdb]' : 'bg-black/30 border-white/10'
                          }`}
                        >
                          <div className="font-extrabold text-sm text-purple-500">
                            {unlockedThemes.length}/{Object.keys(THEMES).length}
                          </div>
                          <div className={`text-[10px] ${mutedText}`}>{t.unlockedThemesLabel}</div>
                        </div>
                      </div>
                    </div>

                    {renderPlayerStatsSection()}

                    {/* Oyuncu Adını Değiştir */}
                    <form
                      onSubmit={(e) => void handleSaveDisplayName(e)}
                      className={`p-3.5 rounded-2xl ${isLight ? 'bg-[#ecf0f1]' : 'bg-white/5 border border-white/10'}`}
                    >
                      <label
                        htmlFor="profile-player-name"
                        className={`text-[10px] font-mono uppercase block mb-1.5 ${mutedText}`}
                      >
                        {t.playerNameField}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="profile-player-name"
                          type="text"
                          minLength={2}
                          maxLength={24}
                          value={displayNameDraft}
                          onChange={(e) => setDisplayNameDraft(e.target.value.slice(0, 24))}
                          placeholder={t.changeNamePlaceholder}
                          className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold focus:outline-none ${
                            isLight
                              ? 'bg-white text-[#2c3e50] border border-[#bdc3c7] focus:border-[#3498db]'
                              : 'bg-black/40 text-white border border-white/15 focus:border-cyan-400'
                          }`}
                        />
                        <button
                          type="submit"
                          disabled={
                            savingDisplayName ||
                            displayNameDraft.trim().length < 2 ||
                            displayNameDraft.trim() === playerName
                          }
                          className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                            isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400 text-slate-950'
                          }`}
                        >
                          {savingDisplayName ? t.savingBtn : t.saveBtn}
                        </button>
                      </div>
                    </form>

                    <button
                      type="button"
                      onClick={() => void handleLogoutAccount()}
                      disabled={authSubmitting}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${pillBtn}`}
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{authSubmitting ? t.loggingOutBtn : t.logoutBtn}</span>
                    </button>
                      </>
                    )}
                  </>
                )}

                {accountError && (
                  <p
                    className={`p-2.5 rounded-xl border font-semibold ${
                      isLight
                        ? 'bg-rose-100 border-rose-300 text-rose-900'
                        : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                    }`}
                  >
                    {accountError}
                  </p>
                )}
                {accountMessage && (
                  <p
                    className={`p-2.5 rounded-xl border font-semibold ${
                      isLight
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                        : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                    }`}
                  >
                    {accountMessage}
                  </p>
                )}

                {isNativeApp() && (
                  <>
                    <div className="flex items-center justify-between pt-2 border-t border-current/10 text-[11px]">
                      <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">
                        {t.privacyPolicy}
                      </a>
                      <a href="/terms.html" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">
                        {t.termsOfUse}
                      </a>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/35">
                      <div className="font-bold text-rose-500 mb-1 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4" />
                        {t.deleteAccountTitle}
                      </div>
                      <p className={`text-[11px] mb-3 ${mutedText}`}>
                        {t.deleteAccountDesc}
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
                          {t.deleteAccountBtn}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleDeleteAccount()}
                            className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold cursor-pointer"
                          >
                            {t.deleteAccountConfirmBtn}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${pillBtn}`}
                          >
                            {t.cancelBtn}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeModal === 'rewards' && (
              <div>
                <div
                  className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border mb-4 ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-black/30 border-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setRewardsTab('quests')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      rewardsTab === 'quests'
                        ? isLight
                          ? 'bg-[#2c3e50] text-white'
                          : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                        : mutedText
                    }`}
                  >
                    <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{t.dailyQuestsTab}</span>
                    {claimableQuestsCount > 0 && (
                      <span className="min-w-4 h-4 px-1 rounded-full bg-[#e74c3c] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {claimableQuestsCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRewardsTab('streak')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      rewardsTab === 'streak'
                        ? isLight
                          ? 'bg-[#2c3e50] text-white'
                          : 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                        : mutedText
                    }`}
                  >
                    <CalendarCheck2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{t.sevenDayStreakTab}</span>
                    {canClaimStreakToday && (
                      <span className="w-2 h-2 rounded-full bg-[#e74c3c] shrink-0" />
                    )}
                  </button>
                </div>

                {rewardsTab === 'quests' ? (
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
                            <span className="font-bold text-sm">{t.quests[q.id] ?? q.title}</span>
                            <span className="text-xs font-mono text-amber-500">
                              +{q.rewardCoins} {t.coinUnit}
                            </span>
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
                                <CheckCircle2 className="w-3.5 h-3.5" /> {t.claimedBtn}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void claimQuest(q.id)}
                                disabled={!done}
                                className="px-3 py-1 rounded-lg bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                              >
                                {t.claimRewardBtn}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <p className={`text-xs mb-4 ${mutedText}`}>
                      {t.streakIntroDesc}
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
                            <div className={`text-[10px] font-mono ${mutedText}`}>
                              {t.dayUpperPrefix} {dayNum}
                            </div>
                            <div className="font-bold text-sm text-amber-500 mt-0.5">+{reward}</div>
                            <div className={`text-[10px] ${mutedText}`}>
                              {completed ? `✓ ${t.claimedBtn}` : isNext ? t.readyExcl : t.coinUnit}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClaimStreak()}
                      disabled={!canClaimStreakToday}
                      className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {canClaimStreakToday
                        ? `${t.claimDayRewardPrefix} ${(streakCount % 7) + 1}${t.claimDayRewardMid ? ` ${t.claimDayRewardMid}` : ''} (+${streakRewards[streakCount % 7] ?? 25} ${t.coinUnit})`
                        : t.todayRewardClaimedBtn}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeModal === 'shop' && (
              <div className="space-y-3">
                {(Object.keys(THEMES) as ThemeId[]).map((tid) => {
                  const themeItem = THEMES[tid];
                  const themeText = t.themes[tid];
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
                            {themeText.badge}
                          </span>
                          <div className="font-bold text-sm">{themeText.name}</div>
                          <div className={`text-xs ${mutedText}`}>{themeText.subtitle}</div>
                        </div>
                        <button
                          onClick={() => void handleBuyOrEquipTheme(tid)}
                          disabled={!unlocked && coins < themeItem.price}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer disabled:cursor-not-allowed ${
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
                          {equipped ? t.equippedBtn : unlocked ? t.equipBtn : `${themeItem.price} ${t.coinUnit}`}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-md border border-black/15"
                          style={{ backgroundColor: themeItem.canvasBg }}
                          title={t.backgroundTitle}
                        />
                        {themeItem.palette.map((c) => (
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

            {activeModal === 'leaderboard' && (
              <LeaderboardModalContent
                lbBoard={lbBoard}
                leaderboardData={leaderboardData}
                playerName={playerName}
                avatarUrl={avatarUrl}
                avatarFrame={avatarFrame}
                periodLabel={
                  leaderboardData
                    ? formatLeaderboardPeriod(leaderboardData.board, leaderboardData.periodKey, lang)
                    : ''
                }
                isLight={isLight}
                locale={locale}
                t={t}
                onSelectBoard={(board) => void openLeaderboard(board)}
              />
            )}

            {activeModal === 'settings' && (
              <div className="space-y-3 text-xs">
                {/* Language Switcher Card */}
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isLight
                      ? 'bg-[#ecf0f1] border-[#bdc3c7]'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-sky-500/15 text-sky-600'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                      }`}
                    >
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{t.languageSelectTitle}</div>
                      <div className={mutedText}>{t.languageSelectDesc}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    {LANGUAGE_OPTIONS.map((opt) => {
                      const activeLang = opt.code === lang;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => handleSelectLanguage(opt.code)}
                          className={`py-2 px-1.5 sm:px-2 rounded-xl font-bold text-[11px] sm:text-xs whitespace-nowrap flex items-center justify-center gap-1 sm:gap-1.5 border transition-all cursor-pointer ${
                            activeLang
                              ? isLight
                                ? 'bg-[#2c3e50] border-[#2c3e50] text-white'
                                : 'bg-cyan-400 border-cyan-300 text-slate-950'
                              : isLight
                                ? 'bg-white border-[#bdc3c7] text-[#2c3e50] hover:bg-slate-50'
                                : 'bg-black/30 border-white/10 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <span>{opt.flag}</span>
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleSound}
                  className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-[#ecf0f1] hover:bg-[#dfe6e9] border-[#bdc3c7]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        soundOn
                          ? isLight
                            ? 'bg-sky-500/15 text-sky-600'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                          : isLight
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{t.soundEffectsTitle}</div>
                      <div className={mutedText}>{t.soundEffectsDesc}</div>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1.5 rounded-xl font-bold shrink-0 ${
                      soundOn
                        ? 'bg-emerald-500 text-white'
                        : isLight
                          ? 'bg-slate-300 text-slate-700'
                          : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {soundOn ? t.soundOn : t.soundOff}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('help')}
                  className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-[#ecf0f1] hover:bg-[#dfe6e9] border-[#bdc3c7]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-[#2c3e50]/10 text-[#2c3e50]'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                      }`}
                    >
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{t.guideCardTitle}</div>
                      <div className={mutedText}>{t.guideCardDesc}</div>
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 rounded-xl font-bold shrink-0 ${pillBtn}`}>{t.openBtn}</span>
                </button>

                {!isNativeApp() && !pwaState.isInstalled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (pwaState.canPromptInstall) {
                        setActiveModal('none');
                        void handleInstallPwa();
                      } else {
                        setActiveModal('install');
                      }
                    }}
                    className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-400/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isLight ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        <Download className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{t.installCardTitle}</div>
                        <div className={mutedText}>{t.installCardDesc}</div>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl font-bold shrink-0 bg-emerald-500 text-white">
                      {t.installShortBtn}
                    </span>
                  </button>
                )}
              </div>
            )}

            {activeModal === 'install' && (
              <div className="space-y-4 text-xs">
                <div
                  className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400/20 border border-cyan-400/40 text-cyan-300'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm mb-1">{t.installPlayLikeApp}</div>
                    <p className={`leading-relaxed ${mutedText}`}>
                      {t.installIntroDesc}
                    </p>
                  </div>
                </div>

                {pwaState.canPromptInstall ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal('none');
                      void handleInstallPwa();
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                      isLight
                        ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white'
                        : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>{t.installNowBtn}</span>
                  </button>
                ) : pwaState.isIosSafari ? (
                  <div className="space-y-2.5">
                    <div
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div className="leading-relaxed">
                        <div className="font-bold mb-0.5 flex items-center gap-1.5">
                          <Share className="w-3.5 h-3.5 text-sky-500" />
                          <span>{t.iosStep1Title}</span>
                        </div>
                        <span className={mutedText}>
                          {t.iosStep1Before}
                          <strong>{t.iosStep1Strong}</strong>
                          {t.iosStep1After}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div className="leading-relaxed">
                        <div className="font-bold mb-0.5 flex items-center gap-1.5">
                          <PlusSquare className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{t.iosStep2Title}</span>
                        </div>
                        <span className={mutedText}>
                          {t.iosStep2Before}
                          <strong>{t.iosStep2Title}</strong>
                          {t.iosStep2Mid}
                          <strong>{t.iosStep2Strong}</strong>
                          {t.iosStep2After}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div className="leading-relaxed">
                        <div className="font-bold mb-0.5">{t.webStep1Title}</div>
                        <span className={mutedText}>
                          {t.webStep1Before}
                          <strong>{t.webStep1Strong}</strong>
                          {t.webStep1After}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                        isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div className="leading-relaxed">
                        <div className="font-bold mb-0.5">{t.webStep2Title}</div>
                        <span className={mutedText}>
                          {t.webStep2Before}
                          <strong>{t.webStep2Strong1}</strong>
                          {t.webStep2Or}
                          <strong>{t.webStep2Strong2}</strong>
                          {t.webStep2After}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {pwaState.offlineReady && (
                  <div className="text-[11px] font-semibold text-emerald-500 flex items-center justify-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.offlineCacheReady}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BANNED ACCOUNT OVERLAY */}
      {banInfo?.isBanned && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl ${cardSurface}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-rose-500">{t.bannedTitle}</h3>
                <p className={`text-xs ${mutedText}`}>
                  {banInfo.isPermanent
                    ? t.bannedPermDesc
                    : banInfo.bannedUntil
                      ? `${t.bannedUntilPrefix} ${new Date(banInfo.bannedUntil).toLocaleString(locale)}`
                      : t.bannedTempDesc}
                </p>
              </div>
            </div>

            <div
              className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="font-bold mb-1">{t.bannedDetailHeading}</div>
              <div>
                {banInfo.banReason
                  ? banInfo.banReason
                  : t.bannedDefaultReason}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await fetchPlayerProfile();
                  if (res?.player) {
                    applyServerPlayerProfile(res.player, {
                      syncDisplayName: Boolean(
                        res.player.email ||
                          res.player.linkedProviders?.facebook ||
                          res.player.linkedProviders?.google ||
                          res.player.linkedProviders?.apple
                      )
                    });
                  }
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs cursor-pointer ${
                  isLight
                    ? 'bg-[#2c3e50] hover:bg-[#1a252f] text-white'
                    : 'bg-cyan-400 text-slate-950'
                }`}
              >
                {t.recheckStatusBtn}
              </button>
              {isSignedIn && (
                <button
                  type="button"
                  onClick={() => void handleLogoutAccount()}
                  className={`py-2.5 px-4 rounded-xl font-bold text-xs cursor-pointer ${pillBtn}`}
                >
                  {t.logoutBtn}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
