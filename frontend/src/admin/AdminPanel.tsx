import { DEFAULT_SIDES, PolygonSides, SUPPORTED_SIDES } from '@gyrogon/game-core';
import {
  Award,
  Ban,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Gift,
  Globe,
  Home,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Trophy,
  UserCheck,
  Users
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { AdminSelect } from './AdminSelect';
import { LeaderboardBoard, LeaderboardData } from '../services/api';
import { THEMES, ThemeId } from '../themes/themes';
import {
  AdminAuthError,
  AdminOverviewResponse,
  AdminPlayerDetailDTO,
  AdminPlayerListResponse,
  AdminRewardRecordDTO,
  AdminScoreListResponse,
  AdminSettingsDTO,
  adminLogin,
  adminLogout,
  changeAdminPassword,
  deleteAdminScore,
  fetchAdminLeaderboard,
  fetchAdminOverview,
  fetchAdminPlayerDetail,
  fetchAdminPlayers,
  fetchAdminRewards,
  fetchAdminScores,
  fetchAdminSettings,
  grantAdminReward,
  hasAdminToken,
  unbanAdminPlayer
} from './adminApi';
import { ADMIN_BASE_PATH } from './adminRoute';
import { AnalyticsTab } from './AnalyticsTab';
import { PlayerDetailModal } from './PlayerDetailModal';

type AdminTab =
  | 'overview'
  | 'analytics'
  | 'players'
  | 'scores'
  | 'leaderboard'
  | 'moderation'
  | 'settings';
type TrendMetric = 'games' | 'newUsers' | 'activePlayers';

function formatShortDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '-';
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00.000Z` : isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function csvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export const AdminPanel: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean>(() => hasAdminToken());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('games');
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Overview state
  const [overviewData, setOverviewData] = useState<AdminOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [analyticsRefreshSignal, setAnalyticsRefreshSignal] = useState(0);

  // Players state
  const [playerQuery, setPlayerQuery] = useState('');
  const [debouncedPlayerQuery, setDebouncedPlayerQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'registered' | 'guest' | 'banned'>('all');
  const [playerSort, setPlayerSort] = useState<
    'newest' | 'best_score' | 'most_games' | 'most_coins' | 'last_active'
  >('newest');
  const [playerPage, setPlayerPage] = useState(1);
  const [playersData, setPlayersData] = useState<AdminPlayerListResponse | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Moderation & Rewards tab state
  const [rewardScope, setRewardScope] = useState<'single' | 'registered' | 'all'>('single');
  const [rewardTargetUserId, setRewardTargetUserId] = useState('');
  const [rewardCoins, setRewardCoins] = useState('250');
  const [rewardTheme, setRewardTheme] = useState('');
  const [rewardReason, setRewardReason] = useState('');
  const [rewardSubmitting, setRewardSubmitting] = useState(false);
  const [rewardFeedback, setRewardFeedback] = useState<string | null>(null);
  const [rewardsHistory, setRewardsHistory] = useState<AdminRewardRecordDTO[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<AdminPlayerListResponse | null>(null);
  const [moderationPlayersList, setModerationPlayersList] = useState<AdminPlayerListResponse | null>(null);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  // Settings & Security tab state
  const [adminSettings, setAdminSettings] = useState<AdminSettingsDTO | null>(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [copiedSecretUrl, setCopiedSecretUrl] = useState(false);

  // Scores state
  const [scoreQuery, setScoreQuery] = useState('');
  const [debouncedScoreQuery, setDebouncedScoreQuery] = useState('');
  const [scoreMode, setScoreMode] = useState<'all' | 'classic' | 'daily'>('all');
  const [scoreSides, setScoreSides] = useState<PolygonSides | 'all'>('all');
  const [scoreSort, setScoreSort] = useState<'newest' | 'score' | 'blocks' | 'combo'>('newest');
  const [scorePage, setScorePage] = useState(1);
  const [scoresData, setScoresData] = useState<AdminScoreListResponse | null>(null);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [confirmScoreId, setConfirmScoreId] = useState<string | null>(null);
  const [deletingScoreId, setDeletingScoreId] = useState<string | null>(null);

  // Leaderboard tab state
  const [lbBoard, setLbBoard] = useState<LeaderboardBoard>('classic');
  const [lbSides, setLbSides] = useState<PolygonSides>(DEFAULT_SIDES);
  const [lbData, setLbData] = useState<LeaderboardData | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Player detail modal state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<AdminPlayerDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const handleAuthExpired = useCallback((err: AdminAuthError) => {
    setAuthenticated(false);
    setSelectedUserId(null);
    setDetailData(null);
    setAuthError(err.message);
  }, []);

  // Debounce search inputs
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedPlayerQuery(playerQuery.trim());
      setPlayerPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [playerQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedScoreQuery(scoreQuery.trim());
      setScorePage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [scoreQuery]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setGlobalError(null);
    try {
      const res = await fetchAdminOverview();
      setOverviewData(res);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Genel bakış verileri alınamadı.');
    } finally {
      setOverviewLoading(false);
    }
  }, [handleAuthExpired]);

  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true);
    setGlobalError(null);
    try {
      const res = await fetchAdminPlayers({
        q: debouncedPlayerQuery || undefined,
        accountType: accountFilter,
        sort: playerSort,
        page: playerPage,
        pageSize: 20
      });
      setPlayersData(res);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Oyuncu listesi alınamadı.');
    } finally {
      setPlayersLoading(false);
    }
  }, [accountFilter, debouncedPlayerQuery, handleAuthExpired, playerPage, playerSort]);

  const loadScores = useCallback(async () => {
    setScoresLoading(true);
    setGlobalError(null);
    try {
      const res = await fetchAdminScores({
        q: debouncedScoreQuery || undefined,
        mode: scoreMode,
        sides: scoreSides === 'all' ? undefined : scoreSides,
        sort: scoreSort,
        page: scorePage,
        pageSize: 25
      });
      setScoresData(res);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Oyun geçmişi alınamadı.');
    } finally {
      setScoresLoading(false);
    }
  }, [debouncedScoreQuery, handleAuthExpired, scoreMode, scorePage, scoreSides, scoreSort]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    setGlobalError(null);
    try {
      const res = await fetchAdminLeaderboard(lbBoard, lbSides, 50);
      setLbData(res);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Liderlik tablosu alınamadı.');
    } finally {
      setLbLoading(false);
    }
  }, [lbBoard, lbSides]);

  const loadModeration = useCallback(async () => {
    setModerationLoading(true);
    setGlobalError(null);
    try {
      const [rewardsRes, bannedRes, playersRes] = await Promise.all([
        fetchAdminRewards(),
        fetchAdminPlayers({ accountType: 'banned', sort: 'last_active', page: 1, pageSize: 100 }),
        fetchAdminPlayers({ sort: 'newest', page: 1, pageSize: 100 })
      ]);
      setRewardsHistory(rewardsRes.items);
      setBannedPlayers(bannedRes);
      setModerationPlayersList(playersRes);
      if (!rewardTargetUserId && playersRes.items[0]) {
        setRewardTargetUserId(playersRes.items[0].id);
      }
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Ödül ve ban verileri alınamadı.');
    } finally {
      setModerationLoading(false);
    }
  }, [handleAuthExpired, rewardTargetUserId]);

  const loadSettings = useCallback(async () => {
    setGlobalError(null);
    try {
      const res = await fetchAdminSettings();
      setAdminSettings(res);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Ayarlar alınamadı.');
    }
  }, [handleAuthExpired]);

  useEffect(() => {
    if (!authenticated) return;
    void loadOverview();
  }, [authenticated, loadOverview]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'players') return;
    void loadPlayers();
  }, [activeTab, authenticated, loadPlayers]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'scores') return;
    void loadScores();
  }, [activeTab, authenticated, loadScores]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'leaderboard') return;
    void loadLeaderboard();
  }, [activeTab, authenticated, loadLeaderboard]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'moderation') return;
    void loadModeration();
  }, [activeTab, authenticated, loadModeration]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'settings') return;
    void loadSettings();
  }, [activeTab, authenticated, loadSettings]);

  const handleOpenPlayer = async (userId: string) => {
    setSelectedUserId(userId);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetchAdminPlayerDetail(userId);
      setDetailData(res);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setDetailError(err instanceof Error ? err.message : 'Oyuncu detayı alınamadı.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRefreshActive = () => {
    void loadOverview();
    if (activeTab === 'analytics') setAnalyticsRefreshSignal((n) => n + 1);
    if (activeTab === 'players') void loadPlayers();
    if (activeTab === 'scores') void loadScores();
    if (activeTab === 'leaderboard') void loadLeaderboard();
    if (activeTab === 'moderation') void loadModeration();
    if (activeTab === 'settings') void loadSettings();
  };

  const handleGrantBulkReward = async (e: React.FormEvent) => {
    e.preventDefault();
    const coins = Number.parseInt(rewardCoins, 10) || 0;
    if (coins <= 0 && !rewardTheme) {
      setGlobalError('Ödül olarak coin miktarı veya tema seçmelisin.');
      return;
    }
    if (rewardScope === 'single' && !rewardTargetUserId) {
      setGlobalError('Ödül verilecek oyuncuyu seçmelisin.');
      return;
    }

    setRewardSubmitting(true);
    setGlobalError(null);
    setRewardFeedback(null);
    try {
      const res = await grantAdminReward({
        scope: rewardScope,
        userId: rewardScope === 'single' ? rewardTargetUserId : undefined,
        coinsAmount: Math.max(0, coins),
        themeCode: rewardTheme || undefined,
        reason: rewardReason.trim() || undefined
      });
      setRewardFeedback(
        `${res.affectedCount} oyuncuya ödül başarıyla gönderildi (${res.reward.recipientName}).`
      );
      setRewardTheme('');
      setRewardReason('');
      void loadOverview();
      void loadModeration();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Ödül gönderilemedi.');
    } finally {
      setRewardSubmitting(false);
    }
  };

  const handleQuickUnban = async (userId: string) => {
    setUnbanningId(userId);
    setGlobalError(null);
    try {
      await unbanAdminPlayer(userId);
      void loadOverview();
      void loadModeration();
      if (activeTab === 'players') void loadPlayers();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Yasak kaldırılamadı.');
    } finally {
      setUnbanningId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordFeedback(null);
    if (!currentPasswordInput) {
      setPasswordError('Mevcut şifreni girmelisin.');
      return;
    }
    if (newPasswordInput.length < 8) {
      setPasswordError('Yeni şifre en az 8 karakter olmalıdır.');
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPasswordError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await changeAdminPassword(currentPasswordInput, newPasswordInput);
      setAdminSettings((prev) =>
        prev
          ? { ...prev, passwordSource: res.passwordSource }
          : { passwordSource: res.passwordSource, isProduction: false }
      );
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setPasswordFeedback(
        'Yönetici şifresi güncellendi ve veritabanına şifrelenerek kaydedildi. Oturumun yeni anahtarla yenilendi.'
      );
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setPasswordError(err instanceof Error ? err.message : 'Şifre değiştirilemedi.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setAuthError('Lütfen yönetici şifresini gir.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await adminLogin(password);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Giriş başarısız.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    adminLogout();
    setAuthenticated(false);
    setOverviewData(null);
    setPlayersData(null);
    setScoresData(null);
    setSelectedUserId(null);
    setDetailData(null);
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await fetchAdminPlayers({
        q: debouncedPlayerQuery || undefined,
        accountType: accountFilter,
        sort: playerSort,
        page: 1,
        pageSize: 100
      });
      const header = [
        'UUID',
        'Oyuncu Adi',
        'E-posta',
        'Tur',
        'Cihaz Kimligi',
        'GyroCoins',
        'En Yuksek Skor',
        'Klasik Rekor',
        'Gunluk Rekor',
        'Oynanan Oyun',
        'Patlatilan Cubuk',
        'En Iyi Kombo',
        'Giris Serisi',
        'Aktif Tema',
        'Acik Tema Sayisi',
        'Katilim Tarihi'
      ];
      const rows = res.items.map((p) =>
        [
          p.id,
          p.displayName,
          p.email ?? '',
          p.accountType === 'registered' ? 'Kayitli' : 'Misafir',
          p.guestDeviceId,
          p.hexaCoins,
          p.bestScore,
          p.highScoreClassic,
          p.highScoreDaily,
          p.totalGames,
          p.totalBlocksCleared,
          p.bestCombo,
          p.streakCount,
          THEMES[p.equippedTheme as ThemeId]?.name ?? p.equippedTheme,
          p.unlockedThemesCount,
          p.createdAt
        ]
          .map(csvCell)
          .join(',')
      );
      const csv = `\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gyrogon-oyuncular-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'CSV dışa aktarılamadı.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleDeleteScoreRow = async (scoreId: string) => {
    setDeletingScoreId(scoreId);
    try {
      await deleteAdminScore(scoreId);
      setConfirmScoreId(null);
      void loadScores();
      void loadOverview();
      if (activeTab === 'players') void loadPlayers();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        handleAuthExpired(err);
        return;
      }
      setGlobalError(err instanceof Error ? err.message : 'Skor kaydı silinemedi.');
    } finally {
      setDeletingScoreId(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="fixed inset-0 h-dvh w-screen overflow-y-auto select-text custom-scroll custom-scroll-dark bg-[#070b14] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-[#0d1424] border border-white/12 shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight">GYROGON Admin</h1>
                <span className="px-2 py-0.5 rounded-md bg-cyan-400/15 border border-cyan-400/35 text-cyan-300 text-[10px] font-mono font-bold">
                  YÖNETİM
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Oyuncu istatistikleri, oyun geçmişi ve sistem kontrol paneli
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password-input"
                className="text-[11px] font-mono uppercase text-slate-400 block mb-1.5"
              >
                YÖNETİCİ ŞİFRESİ
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <p className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-semibold">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-extrabold text-sm cursor-pointer disabled:opacity-50"
            >
              {authLoading ? 'Doğrulanıyor...' : 'Panele Giriş Yap'}
            </button>
          </form>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>Güvenli Yönetici Oturumu</span>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 font-semibold"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Oyuna Dön</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const ov = overviewData?.overview;
  const maxTrendVal = ov
    ? Math.max(1, ...ov.dailyTrend.map((d) => d[trendMetric]))
    : 1;
  const maxThemeUnlocked = ov
    ? Math.max(1, ...ov.themes.map((t) => t.unlockedCount))
    : 1;

  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-y-auto select-text custom-scroll custom-scroll-dark bg-[#070b14] text-slate-100">
      {/* Top Sticky Navbar */}
      <header className="sticky top-0 z-30 bg-[#070b14]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight">GYROGON Admin</span>
                {overviewData?.system && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono">
                    {overviewData.system.store} · {overviewData.system.leaderboard}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Oyuncu Analitiği &amp; Canlı Yönetim Paneli</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshActive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  overviewLoading || playersLoading || scoresLoading || lbLoading || moderationLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />
              <span>Yenile</span>
            </button>

            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold"
            >
              <Home className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Oyuna Dön</span>
            </a>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
          {[
            {
              id: 'overview' as const,
              label: 'Genel Bakış',
              icon: <BarChart3 className="w-4 h-4" />
            },
            {
              id: 'analytics' as const,
              label: 'Trafik & Analitik',
              icon: <Globe className="w-4 h-4" />
            },
            {
              id: 'players' as const,
              label: 'Oyuncular',
              badge: ov?.totalUsers,
              icon: <Users className="w-4 h-4" />
            },
            {
              id: 'scores' as const,
              label: 'Oyun Geçmişi',
              badge: ov?.totalGames,
              icon: <Gamepad2 className="w-4 h-4" />
            },
            {
              id: 'moderation' as const,
              label: 'Ödüller & Ban',
              badge: ov?.bannedUsers,
              icon: <Gift className="w-4 h-4" />
            },
            {
              id: 'leaderboard' as const,
              label: 'Liderlik & Mağaza',
              icon: <Trophy className="w-4 h-4" />
            },
            {
              id: 'settings' as const,
              label: 'Ayarlar & Güvenlik',
              icon: <KeyRound className="w-4 h-4" />
            }
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                      active
                        ? 'bg-slate-950/20 text-slate-950'
                        : tab.id === 'moderation' && tab.badge > 0
                          ? 'bg-rose-500/30 text-rose-200'
                          : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {tab.badge.toLocaleString('tr-TR')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {globalError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs font-semibold">
            {globalError}
          </div>
        )}

        {/* ==================== TAB 1.5: TRAFİK & ANALİTİK ==================== */}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            onOpenPlayer={(userId) => void handleOpenPlayer(userId)}
            onAuthExpired={handleAuthExpired}
            refreshSignal={analyticsRefreshSignal}
          />
        )}

        {/* ==================== TAB 1: GENEL BAKIŞ ==================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {!ov && overviewLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">
                Sistem ve oyuncu istatistikleri yükleniyor...
              </div>
            ) : ov ? (
              <>
                {/* 6 KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  {[
                    {
                      label: 'Toplam Oyuncu',
                      value: ov.totalUsers.toLocaleString('tr-TR'),
                      sub: `Kayıtlı ${ov.registeredUsers} · Misafir ${ov.guestUsers} · Ban ${ov.bannedUsers}`,
                      icon: <Users className="w-4 h-4 text-cyan-400" />
                    },
                    {
                      label: 'Yeni Katılım (7g)',
                      value: `+${ov.newUsers7d.toLocaleString('tr-TR')}`,
                      sub: `Son 24 saat: +${ov.newUsers24h}`,
                      icon: <UserCheck className="w-4 h-4 text-emerald-400" />
                    },
                    {
                      label: 'Aktif Oyuncu (7g)',
                      value: ov.activePlayers7d.toLocaleString('tr-TR'),
                      sub: `Bugün oynayan: ${ov.activePlayersToday}`,
                      icon: <Flame className="w-4 h-4 text-rose-400" />
                    },
                    {
                      label: 'Tamamlanan Oyun',
                      value: ov.totalGames.toLocaleString('tr-TR'),
                      sub: `Bugün ${ov.gamesToday} · Son 7g ${ov.games7d}`,
                      icon: <Gamepad2 className="w-4 h-4 text-sky-400" />
                    },
                    {
                      label: 'Patlatılan Çubuk',
                      value: ov.totalBlocksCleared.toLocaleString('tr-TR'),
                      sub: `Ort. skor ${ov.averageScore.toLocaleString('tr-TR')} · Max x${ov.bestCombo}`,
                      icon: <Layers className="w-4 h-4 text-emerald-400" />
                    },
                    {
                      label: 'Dolaşımdaki Coin',
                      value: ov.totalCoinsInCirculation.toLocaleString('tr-TR'),
                      sub: `Maç kazancı: ${ov.totalCoinsEarnedFromGames.toLocaleString('tr-TR')}`,
                      icon: <Coins className="w-4 h-4 text-amber-400" />
                    }
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{kpi.label}</span>
                        {kpi.icon}
                      </div>
                      <div className="text-2xl font-extrabold tracking-tight">{kpi.value}</div>
                      <div className="text-[11px] text-slate-400 truncate">{kpi.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Secondary Quick Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-slate-400">Tüm Zamanlar En Yüksek Skor</div>
                      <div className="text-lg font-extrabold text-amber-300 mt-0.5">
                        {ov.highestScore.toLocaleString('tr-TR')} puan
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Rekortmen: {ov.highestScorePlayer ?? '-'}
                      </div>
                    </div>
                    <Trophy className="w-7 h-7 text-amber-400/75 shrink-0" />
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-slate-400">Mod &amp; Oturum Doğrulama</div>
                      <div className="text-lg font-extrabold text-sky-300 mt-0.5">
                        {ov.classicGames} Klasik · {ov.dailyGames} Günlük
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Doğrulanan oturum: {ov.verifiedSessions} / {ov.totalSessions}
                      </div>
                    </div>
                    <ShieldCheck className="w-7 h-7 text-sky-400/75 shrink-0" />
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-slate-400">Görev &amp; Mağaza Etkileşimi</div>
                      <div className="text-lg font-extrabold text-emerald-300 mt-0.5">
                        {ov.questsCompletedTotal} Tamamlanan Görev
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Ücretli tema açma sayısı: {ov.paidThemesUnlockedTotal}
                      </div>
                    </div>
                    <Award className="w-7 h-7 text-emerald-400/75 shrink-0" />
                  </div>
                </div>

                {/* 14-Day Activity Chart */}
                <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-base">Son 14 Günlük Aktivite Trendi (UTC)</h2>
                      <p className="text-xs text-slate-400">
                        Günlük oynanan oyunlar, yeni katılan kullanıcılar ve tekil aktif oyuncular
                      </p>
                    </div>
                    <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                      {(
                        [
                          ['games', 'Oynanan Oyun'],
                          ['newUsers', 'Yeni Oyuncu'],
                          ['activePlayers', 'Aktif Oyuncu']
                        ] as const
                      ).map(([metric, label]) => (
                        <button
                          key={metric}
                          type="button"
                          onClick={() => setTrendMetric(metric)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            trendMetric === metric
                              ? 'bg-cyan-400 text-slate-950'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-14 gap-1.5 sm:gap-2 items-end h-44 pt-4">
                    {ov.dailyTrend.map((point) => {
                      const val = point[trendMetric];
                      const heightPct = val > 0 ? Math.max(8, Math.round((val / maxTrendVal) * 100)) : 2;
                      return (
                        <div key={point.date} className="flex flex-col items-center h-full justify-end group">
                          <span className="text-[10px] font-mono text-slate-300 mb-1 opacity-80 group-hover:opacity-100">
                            {val > 0 ? val : ''}
                          </span>
                          <div className="w-full flex-1 flex items-end">
                            <div
                              className={`w-full rounded-t-lg transition-all ${
                                val > 0
                                  ? trendMetric === 'games'
                                    ? 'bg-gradient-to-t from-cyan-500/70 to-sky-400'
                                    : trendMetric === 'newUsers'
                                      ? 'bg-gradient-to-t from-emerald-500/70 to-emerald-400'
                                      : 'bg-gradient-to-t from-purple-500/70 to-fuchsia-400'
                                  : 'bg-white/10'
                              }`}
                              style={{ height: `${heightPct}%` }}
                              title={`${point.date}: ${point.games} oyun, ${point.newUsers} yeni oyuncu, ${point.activePlayers} aktif`}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-slate-400 mt-1.5 truncate max-w-full">
                            {formatShortDate(point.date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Polygon Sides Table + Theme Stats & System Health */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Polygon Breakdown */}
                  <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
                    <h2 className="font-bold text-base">Çokgen Kenar Dağılımı (3G – 8G)</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                            <th className="py-2 pr-3">Kenar</th>
                            <th className="py-2 pr-3 text-right">Oyun</th>
                            <th className="py-2 pr-3 text-right">Ort. Skor</th>
                            <th className="py-2 pr-3 text-right">Rekor</th>
                            <th className="py-2 text-right">Toplam Blok</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {ov.bySides.map((row) => (
                            <tr key={row.sides} className="hover:bg-white/5">
                              <td className="py-2.5 pr-3 font-mono font-bold text-cyan-300">
                                {row.sides} Kenar ({row.sides}G)
                              </td>
                              <td className="py-2.5 pr-3 text-right font-semibold">
                                {row.games.toLocaleString('tr-TR')}
                              </td>
                              <td className="py-2.5 pr-3 text-right text-slate-300">
                                {row.averageScore.toLocaleString('tr-TR')}
                              </td>
                              <td className="py-2.5 pr-3 text-right font-bold text-amber-300">
                                {row.bestScore.toLocaleString('tr-TR')}
                              </td>
                              <td className="py-2.5 text-right text-emerald-300">
                                {row.totalBlocksCleared.toLocaleString('tr-TR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Theme Popularity + System Info */}
                  <div className="space-y-5">
                    <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-base">
                        <Palette className="w-4 h-4 text-purple-400" />
                        <span>Tema Popülerliği</span>
                      </div>
                      <div className="space-y-2.5">
                        {ov.themes.map((t) => {
                          const pct = Math.round((t.unlockedCount / maxThemeUnlocked) * 100);
                          return (
                            <div key={t.code} className="space-y-1 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold truncate">
                                  {t.name}{' '}
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({t.price === 0 ? 'Ücretsiz' : `${t.price} Coin`})
                                  </span>
                                </span>
                                <span className="text-[11px] font-mono text-slate-300 shrink-0">
                                  {t.unlockedCount} sahip · {t.equippedCount} seçili
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                                  style={{ width: `${Math.max(4, pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {overviewData?.dailySeed && overviewData?.system && (
                      <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-2 text-xs">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <Server className="w-4 h-4 text-emerald-400" />
                          <span>Günlük Seed &amp; Sistem Durumu</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                            <span className="text-[10px] text-slate-400 block">Günün Tarihi (UTC)</span>
                            <span className="font-mono font-bold">{overviewData.dailySeed.date}</span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                            <span className="text-[10px] text-slate-400 block">Veri &amp; Sıralama</span>
                            <span className="font-mono font-bold text-emerald-300">
                              {overviewData.system.store} / {overviewData.system.leaderboard}
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                          <span className="text-[10px] text-slate-400 block">Günlük Seed</span>
                          <span className="font-mono text-cyan-300 break-all">
                            {overviewData.dailySeed.seed}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ==================== TAB 2: OYUNCULAR ==================== */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={playerQuery}
                    onChange={(e) => setPlayerQuery(e.target.value)}
                    placeholder="Ad, e-posta veya cihaz kimliği ara..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                  {(
                    [
                      ['all', 'Tümü'],
                      ['registered', 'Kayıtlı'],
                      ['guest', 'Misafir'],
                      ['banned', 'Yasaklılar']
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setAccountFilter(val);
                        setPlayerPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        accountFilter === val
                          ? val === 'banned'
                            ? 'bg-rose-500 text-white'
                            : 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AdminSelect
                  value={playerSort}
                  onChange={(e) => {
                    setPlayerSort(e.target.value as typeof playerSort);
                    setPlayerPage(1);
                  }}
                  className="pl-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="newest">
                    Sıralama: En Yeni Katılım
                  </option>
                  <option value="best_score">
                    Sıralama: En Yüksek Skor
                  </option>
                  <option value="most_games">
                    Sıralama: En Çok Oyun
                  </option>
                  <option value="most_coins">
                    Sıralama: En Çok Coin
                  </option>
                  <option value="last_active">
                    Sıralama: Son Aktif
                  </option>
                </AdminSelect>

                <button
                  type="button"
                  disabled={exportingCsv}
                  onClick={() => void handleExportCsv()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingCsv ? 'Hazırlanıyor...' : 'CSV İndir'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0d1424] border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10 bg-white/[0.02]">
                      <th className="py-3 px-4">Oyuncu</th>
                      <th className="py-3 px-3">Tür</th>
                      <th className="py-3 px-3 text-right">Coin</th>
                      <th className="py-3 px-3 text-right">En Yüksek</th>
                      <th className="py-3 px-3 text-right">Oyun</th>
                      <th className="py-3 px-3 text-right">Blok</th>
                      <th className="py-3 px-3 text-right">Kombo</th>
                      <th className="py-3 px-3 text-right">Seri</th>
                      <th className="py-3 px-3">Tema</th>
                      <th className="py-3 px-3">Katılım</th>
                      <th className="py-3 px-4 text-right">Detay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {playersLoading && !playersData ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          Oyuncular yükleniyor...
                        </td>
                      </tr>
                    ) : playersData && playersData.items.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          Arama kriterlerine uyan oyuncu bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      playersData?.items.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => void handleOpenPlayer(p.id)}
                          className="hover:bg-white/[0.06] cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400/25 to-sky-500/25 border border-cyan-400/30 text-cyan-200 font-bold flex items-center justify-center shrink-0">
                                {(p.displayName.trim()[0] || 'G').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-100 truncate max-w-[160px]">
                                  {p.displayName}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
                                  {p.email ?? p.guestDeviceId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-1">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  p.accountType === 'registered'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-white/10 text-slate-300'
                                }`}
                              >
                                {p.accountType === 'registered' ? 'Kayıtlı' : 'Misafir'}
                              </span>
                              {p.isBanned && (
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/35"
                                  title={
                                    p.isPermanentBan
                                      ? 'Süresiz Yasak'
                                      : p.bannedUntil
                                        ? `Bitiş: ${formatDateTime(p.bannedUntil)}`
                                        : 'Yasaklı'
                                  }
                                >
                                  {p.isPermanentBan ? 'Süresiz Ban' : 'Yasaklı'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                            {p.hexaCoins.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-cyan-300">
                            {p.bestScore.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold">{p.totalGames}</td>
                          <td className="py-3 px-3 text-right text-emerald-300">
                            {p.totalBlocksCleared.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-300">
                            {p.bestCombo > 0 ? `x${p.bestCombo}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right">{p.streakCount}g</td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                            {THEMES[p.equippedTheme as ThemeId]?.name.replace(/^Tema \d+ · /, '') ??
                              p.equippedTheme}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                            {formatShortDate(p.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-semibold text-cyan-300">
                              İncele <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {playersData && playersData.total > 0 && (
                <div className="px-4 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Toplam <strong className="text-slate-200">{playersData.total}</strong> oyuncu · Sayfa{' '}
                    <strong className="text-slate-200">
                      {playersData.page} / {playersData.totalPages}
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={playersData.page <= 1}
                      onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Önceki
                    </button>
                    <button
                      type="button"
                      disabled={playersData.page >= playersData.totalPages}
                      onClick={() => setPlayerPage((p) => p + 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer disabled:opacity-40"
                    >
                      Sonraki <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: OYUN GEÇMİŞİ ==================== */}
        {activeTab === 'scores' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scoreQuery}
                    onChange={(e) => setScoreQuery(e.target.value)}
                    placeholder="Oyuncu adı veya e-posta ara..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                  {(
                    [
                      ['all', 'Tümü'],
                      ['classic', 'Klasik'],
                      ['daily', 'Günlük']
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setScoreMode(m);
                        setScorePage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        scoreMode === m
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AdminSelect
                  value={scoreSides}
                  onChange={(e) => {
                    const val = e.target.value;
                    setScoreSides(val === 'all' ? 'all' : (Number(val) as PolygonSides));
                    setScorePage(1);
                  }}
                  className="pl-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">
                    Çokgen: Tümü (3G–8G)
                  </option>
                  {SUPPORTED_SIDES.map((s) => (
                    <option key={s} value={s}>
                      {s} Kenar ({s}G)
                    </option>
                  ))}
                </AdminSelect>

                <AdminSelect
                  value={scoreSort}
                  onChange={(e) => {
                    setScoreSort(e.target.value as typeof scoreSort);
                    setScorePage(1);
                  }}
                  className="pl-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="newest">
                    Sıralama: En Yeni
                  </option>
                  <option value="score">
                    Sıralama: En Yüksek Skor
                  </option>
                  <option value="blocks">
                    Sıralama: En Çok Blok
                  </option>
                  <option value="combo">
                    Sıralama: En Yüksek Kombo
                  </option>
                </AdminSelect>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0d1424] border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10 bg-white/[0.02]">
                      <th className="py-3 px-4">Tarih</th>
                      <th className="py-3 px-3">Oyuncu</th>
                      <th className="py-3 px-3">Mod</th>
                      <th className="py-3 px-3">Kenar</th>
                      <th className="py-3 px-3 text-right">Skor</th>
                      <th className="py-3 px-3 text-right">Blok</th>
                      <th className="py-3 px-3 text-right">Kombo</th>
                      <th className="py-3 px-3 text-right">Coin</th>
                      <th className="py-3 px-3">Replay Özeti</th>
                      <th className="py-3 px-4 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {scoresLoading && !scoresData ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          Oyun kayıtları yükleniyor...
                        </td>
                      </tr>
                    ) : scoresData && scoresData.items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          Seçili filtrelere ait oyun kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      scoresData?.items.map((item) => (
                        <tr key={item.id} className="hover:bg-white/[0.04]">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="py-3 px-3">
                            {item.userId ? (
                              <button
                                type="button"
                                onClick={() => void handleOpenPlayer(item.userId!)}
                                className="text-left group cursor-pointer"
                              >
                                <div className="font-bold text-cyan-300 group-hover:underline">
                                  {item.playerName}
                                </div>
                                {item.userEmail && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {item.userEmail}
                                  </div>
                                )}
                              </button>
                            ) : (
                              <span className="font-semibold text-slate-200">{item.playerName}</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.mode === 'daily'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-white/10 text-slate-200'
                              }`}
                            >
                              {item.mode === 'daily' ? 'Günlük' : 'Klasik'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold">{item.sides}G</td>
                          <td className="py-3 px-3 text-right font-extrabold text-cyan-300">
                            {item.score.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-300">
                            {item.blocksCleared.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-300">x{item.maxCombo}</td>
                          <td className="py-3 px-3 text-right text-amber-300">+{item.coinsEarned}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                            {item.moveHash.slice(0, 12)}…
                          </td>
                          <td className="py-3 px-4 text-right">
                            {confirmScoreId === item.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingScoreId === item.id}
                                  onClick={() => void handleDeleteScoreRow(item.id)}
                                  className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Onayla
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmScoreId(null)}
                                  className="px-2 py-1 rounded bg-white/10 text-slate-200 text-[10px] cursor-pointer"
                                >
                                  İptal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmScoreId(item.id)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                                title="Skor Kaydını Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {scoresData && scoresData.total > 0 && (
                <div className="px-4 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Toplam <strong className="text-slate-200">{scoresData.total}</strong> oyun kaydı · Sayfa{' '}
                    <strong className="text-slate-200">
                      {scoresData.page} / {scoresData.totalPages}
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={scoresData.page <= 1}
                      onClick={() => setScorePage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Önceki
                    </button>
                    <button
                      type="button"
                      disabled={scoresData.page >= scoresData.totalPages}
                      onClick={() => setScorePage((p) => p + 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer disabled:opacity-40"
                    >
                      Sonraki <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: LİDERLİK & MAĞAZA ==================== */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-5">
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-sky-400" />
                    <span>Canlı Liderlik Tablosu</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Oyuncu adına tıklayarak profil ve istatistik penceresini açabilirsin
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                    {(
                      [
                        ['classic', 'Tüm Zamanlar'],
                        ['weekly', 'Haftalık'],
                        ['daily', 'Günlük']
                      ] as const
                    ).map(([b, label]) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setLbBoard(b)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                          lbBoard === b
                            ? 'bg-cyan-400 text-slate-950'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                    {SUPPORTED_SIDES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLbSides(s)}
                        className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold cursor-pointer ${
                          lbSides === s
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {s}G
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {lbLoading && !lbData ? (
                <div className="py-10 text-center text-xs text-slate-400">Liderlik yükleniyor...</div>
              ) : lbData && lbData.entries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Bu kategori için henüz doğrulanmış liderlik kaydı yok.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                        <th className="py-2 pr-3">Sıra</th>
                        <th className="py-2 pr-3">Oyuncu</th>
                        <th className="py-2 pr-3 text-right">Skor</th>
                        <th className="py-2 pr-3 text-right">Max Kombo</th>
                        <th className="py-2 pr-3 text-right">Blok</th>
                        <th className="py-2 text-right">Güncelleme</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {lbData?.entries.map((entry) => (
                        <tr key={`${entry.memberId}-${entry.rank}`} className="hover:bg-white/5">
                          <td className="py-2.5 pr-3 font-mono font-extrabold text-amber-300">
                            #{entry.rank}
                          </td>
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              onClick={() => void handleOpenPlayer(entry.memberId)}
                              className="font-bold text-cyan-300 hover:underline cursor-pointer"
                            >
                              {entry.playerName}
                            </button>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-extrabold">
                            {entry.score.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-rose-300">x{entry.maxCombo}</td>
                          <td className="py-2.5 pr-3 text-right text-emerald-300">
                            {entry.blocksCleared}
                          </td>
                          <td className="py-2.5 text-right text-slate-400">
                            {formatDateTime(entry.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {overviewData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
                  <div className="font-bold text-sm">Günlük Bulmaca Hedefleri</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-600/30 text-center">
                      <div className="text-[10px] text-amber-400 uppercase font-mono">Bronz</div>
                      <div className="font-extrabold text-sm mt-0.5">
                        {overviewData.dailySeed.targets.bronze.toLocaleString('tr-TR')}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-400/10 border border-slate-400/30 text-center">
                      <div className="text-[10px] text-slate-300 uppercase font-mono">Gümüş</div>
                      <div className="font-extrabold text-sm mt-0.5">
                        {overviewData.dailySeed.targets.silver.toLocaleString('tr-TR')}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-500/15 border border-yellow-500/40 text-center">
                      <div className="text-[10px] text-yellow-300 uppercase font-mono">Altın</div>
                      <div className="font-extrabold text-sm mt-0.5">
                        {overviewData.dailySeed.targets.gold.toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-2.5">
                  <div className="font-bold text-sm">Mağaza Envanteri Özeti</div>
                  <div className="divide-y divide-white/10">
                    {overviewData.overview.themes.map((t) => (
                      <div key={t.code} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold">{t.name}</span>
                          <span className="ml-2 text-[10px] font-mono text-slate-400">
                            {t.price === 0 ? 'Ücretsiz' : `${t.price} Coin`}
                          </span>
                        </div>
                        <div className="font-mono text-slate-300">
                          {t.unlockedCount} açık · {t.equippedCount} seçili
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 5: ÖDÜLLER & BAN ==================== */}
        {activeTab === 'moderation' && (
          <div className="space-y-6">
            {/* Ödül Dağıtım Merkezi */}
            <form
              onSubmit={(e) => void handleGrantBulkReward(e)}
              className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-400" />
                    <span>Ödül Dağıtım Merkezi</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tek bir oyuncuya veya tüm oyunculara GyroCoins / tema hediyesi tanımla
                  </p>
                </div>
                <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 gap-1">
                  {(
                    [
                      ['single', 'Tek Oyuncu'],
                      ['registered', 'Tüm Kayıtlılar'],
                      ['all', 'Tüm Oyuncular']
                    ] as const
                  ).map(([scopeVal, label]) => (
                    <button
                      key={scopeVal}
                      type="button"
                      onClick={() => setRewardScope(scopeVal)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        rewardScope === scopeVal
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {rewardScope === 'single' ? (
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Hedef Oyuncu
                  </label>
                  <AdminSelect
                    wrapperClassName="w-full"
                    value={rewardTargetUserId}
                    onChange={(e) => setRewardTargetUserId(e.target.value)}
                    className="w-full pl-3 py-2.5 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-emerald-400"
                  >
                    {moderationPlayersList?.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.email ?? p.guestDeviceId}) — {p.hexaCoins} Coin
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Toplu gönderim seçili: Onayladığında{' '}
                    <strong>
                      {rewardScope === 'registered'
                        ? 'kayıtlı tüm oyunculara'
                        : 'kayıtlı ve misafir TÜM oyunculara'}
                    </strong>{' '}
                    aynı anda ödül tanımlanacaktır.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400 mr-1">Hızlı Miktar:</span>
                {['50', '100', '250', '500', '1000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRewardCoins(preset)}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] cursor-pointer border ${
                      rewardCoins === preset
                        ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                        : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    +{preset} Coin
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Coin Miktarı
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={rewardCoins}
                    onChange={(e) => setRewardCoins(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-amber-300 font-mono text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Tema Hediyesi (Opsiyonel)
                  </label>
                  <AdminSelect
                    wrapperClassName="w-full"
                    value={rewardTheme}
                    onChange={(e) => setRewardTheme(e.target.value)}
                    className="w-full pl-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">
                      Tema Yok
                    </option>
                    {(Object.keys(THEMES) as ThemeId[]).map((code) => (
                      <option key={code} value={code}>
                        {THEMES[code].name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Sebep / Ödül Notu
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={rewardReason}
                    onChange={(e) => setRewardReason(e.target.value)}
                    placeholder="Örn: Hafta sonu etkinliği hediyesi"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {rewardFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{rewardFeedback}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={rewardSubmitting}
                className="py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Gift className="w-4 h-4" />
                <span>{rewardSubmitting ? 'Gönderiliyor...' : 'Ödülü Gönder'}</span>
              </button>
            </form>

            {/* Aktif Yasaklı Oyuncular */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-400" />
                  <span>Aktif Yasaklı Oyuncular</span>
                </h2>
                <span className="text-xs text-slate-400">
                  Oyuncular sekmesinden veya detaydan yeni yasak uygulayabilirsin
                </span>
              </div>

              {moderationLoading && !bannedPlayers ? (
                <div className="py-8 text-center text-xs text-slate-400">Yükleniyor...</div>
              ) : !bannedPlayers || bannedPlayers.items.length === 0 ? (
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 text-center text-xs text-slate-400">
                  Şu anda aktif yasağı bulunan oyuncu yok.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                        <th className="py-2 pr-3">Oyuncu</th>
                        <th className="py-2 pr-3">Tür</th>
                        <th className="py-2 pr-3">Yasak Süresi</th>
                        <th className="py-2 pr-3">Sebep</th>
                        <th className="py-2 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {bannedPlayers.items.map((p) => (
                        <tr key={p.id} className="hover:bg-white/5">
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              onClick={() => void handleOpenPlayer(p.id)}
                              className="font-bold text-cyan-300 hover:underline cursor-pointer text-left"
                            >
                              {p.displayName}
                              <span className="block text-[10px] font-mono text-slate-400 font-normal">
                                {p.email ?? p.guestDeviceId}
                              </span>
                            </button>
                          </td>
                          <td className="py-2.5 pr-3">
                            {p.accountType === 'registered' ? 'Kayıtlı' : 'Misafir'}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                              {p.isPermanentBan
                                ? 'Süresiz'
                                : p.bannedUntil
                                  ? formatDateTime(p.bannedUntil)
                                  : 'Süreli'}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-300 max-w-[260px] truncate">
                            {p.banReason || '-'}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() => void handleOpenPlayer(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs cursor-pointer"
                            >
                              Detay
                            </button>
                            <button
                              type="button"
                              disabled={unbanningId === p.id}
                              onClick={() => void handleQuickUnban(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold text-xs cursor-pointer disabled:opacity-50"
                            >
                              {unbanningId === p.id ? 'Kaldırılıyor...' : 'Yasağı Kaldır'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Son Verilen Ödüller Geçmişi */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base">Son Verilen Ödüller Geçmişi</h2>
                <span className="text-xs text-slate-400">{rewardsHistory.length} kayıt</span>
              </div>
              {rewardsHistory.length === 0 ? (
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 text-center text-xs text-slate-400">
                  Henüz yönetici tarafından gönderilmiş ödül kaydı yok.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                        <th className="py-2 pr-3">Tarih</th>
                        <th className="py-2 pr-3">Alıcı / Kapsam</th>
                        <th className="py-2 pr-3 text-right">Coin</th>
                        <th className="py-2 pr-3">Tema</th>
                        <th className="py-2">Sebep / Not</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rewardsHistory.map((r) => (
                        <tr key={r.id} className="hover:bg-white/5">
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-300">
                            {formatDateTime(r.createdAt)}
                          </td>
                          <td className="py-2 pr-3">
                            {r.userId ? (
                              <button
                                type="button"
                                onClick={() => void handleOpenPlayer(r.userId!)}
                                className="font-bold text-cyan-300 hover:underline cursor-pointer"
                              >
                                {r.recipientName}
                              </button>
                            ) : (
                              <span className="font-bold text-emerald-300">{r.recipientName}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-bold text-amber-300">
                            {r.coinsAmount > 0 ? `+${r.coinsAmount}` : '-'}
                          </td>
                          <td className="py-2 pr-3">
                            {r.themeCode
                              ? (THEMES[r.themeCode as ThemeId]?.name ?? r.themeCode)
                              : '-'}
                          </td>
                          <td className="py-2 text-slate-300">{r.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 6: AYARLAR & GÜVENLİK ==================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            {/* Admin Şifresi Değiştir */}
            <form
              onSubmit={(e) => void handleChangePassword(e)}
              className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4"
            >
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>Yönetici Şifresini Değiştir</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Buradan değiştirilen şifre scrypt ile hashlenerek veritabanında kalıcı saklanır.
                </p>
              </div>

              {adminSettings && (
                <div className="p-3 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">Aktif Şifre Kaynağı</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-cyan-400/15 border border-cyan-400/35 text-cyan-200 font-semibold">
                    {adminSettings.passwordSource === 'database'
                      ? 'Veritabanı (Panelden Güncellendi)'
                      : adminSettings.passwordSource === 'env'
                        ? 'Ortam Değişkeni (ADMIN_PASSWORD)'
                        : 'Geliştirme Varsayılanı'}
                  </span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Mevcut Yönetici Şifresi
                </label>
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Yeni Şifre (En Az 8 Karakter)
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Yeni Şifre Tekrar
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={confirmNewPasswordInput}
                  onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              {passwordError && (
                <p className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 font-semibold">
                  {passwordError}
                </p>
              )}
              {passwordFeedback && (
                <p className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{passwordFeedback}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={passwordSaving}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
              >
                {passwordSaving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </button>
            </form>

            {/* Gizli Panel Adresi & Ortam Değişkenleri */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-400" />
                  <span>Gizli Panel Adresi &amp; Güvenlik Notları</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tahmin edilebilir /admin adresi yerine yalnızca senin bildiğin gizli rota kullanılır.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/15 space-y-2">
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  AKTİF GİZLİ YÖNETİM ADRESİ
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs sm:text-sm text-cyan-300 break-all">
                    {`${window.location.origin}${ADMIN_BASE_PATH}`}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${window.location.origin}${ADMIN_BASE_PATH}`)
                        .then(() => {
                          setCopiedSecretUrl(true);
                          setTimeout(() => setCopiedSecretUrl(false), 1800);
                        })
                        .catch(() => undefined);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedSecretUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Kopyalandı</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 leading-relaxed text-slate-300">
                <div className="font-bold text-slate-100">Adresi veya Ortam Değişkenini Değiştirme</div>
                <ul className="list-disc pl-4 space-y-1.5 text-slate-400">
                  <li>
                    Gizli panel yolunu değiştirmek için <code>.env</code> veya Dokploy build argümanlarında{' '}
                    <code className="text-cyan-300">VITE_ADMIN_PATH=/yeni-gizli-yol</code> tanımlayıp frontend
                    paketini yeniden derle.
                  </li>
                  <li>
                    Sunucu ilk kurulum şifresi <code className="text-cyan-300">ADMIN_PASSWORD</code> ortam
                    değişkeninden okunur; soldaki formdan güncellediğinde ise veritabanındaki şifre öncelikli
                    olur.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedUserId && (
        <PlayerDetailModal
          detail={detailData}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setSelectedUserId(null);
            setDetailData(null);
          }}
          onUpdated={(updated) => {
            setDetailData(updated);
            void loadOverview();
            if (activeTab === 'players') void loadPlayers();
            if (activeTab === 'moderation') void loadModeration();
          }}
          onDeleted={() => {
            setSelectedUserId(null);
            setDetailData(null);
            void loadOverview();
            if (activeTab === 'players') void loadPlayers();
            if (activeTab === 'scores') void loadScores();
            if (activeTab === 'leaderboard') void loadLeaderboard();
            if (activeTab === 'moderation') void loadModeration();
          }}
          onScoreDeleted={() => {
            if (selectedUserId) {
              void fetchAdminPlayerDetail(selectedUserId)
                .then(setDetailData)
                .catch(() => undefined);
            }
            void loadOverview();
            if (activeTab === 'players') void loadPlayers();
            if (activeTab === 'scores') void loadScores();
            if (activeTab === 'moderation') void loadModeration();
          }}
          onAuthExpired={handleAuthExpired}
        />
      )}
    </div>
  );
};

export default AdminPanel;
