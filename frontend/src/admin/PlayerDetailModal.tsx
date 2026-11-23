import { SUPPORTED_SIDES } from '@gyrogon/game-core';
import {
  Award,
  Ban,
  BarChart3,
  Check,
  Clock,
  Coins,
  Copy,
  Flame,
  Gamepad2,
  Gift,
  Globe,
  Layers,
  Mail,
  MapPin,
  Monitor,
  Palette,
  Save,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Target,
  Trash2,
  Trophy,
  UserCheck,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AdminSelect } from './AdminSelect';
import { THEMES, ThemeId } from '../themes/themes';
import {
  AdminAuthError,
  AdminPlayerDetailDTO,
  banAdminPlayer,
  deleteAdminPlayer,
  deleteAdminScore,
  grantAdminReward,
  unbanAdminPlayer,
  updateAdminPlayer
} from './adminApi';
import { formatCountryTr, formatDurationTr } from './AnalyticsTab';

interface PlayerDetailModalProps {
  detail: AdminPlayerDetailDTO | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onUpdated: (updated: AdminPlayerDetailDTO) => void;
  onDeleted: (userId: string) => void;
  onScoreDeleted: (scoreId: string) => void;
  onAuthExpired: (err: AdminAuthError) => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  detail,
  loading,
  error,
  onClose,
  onUpdated,
  onDeleted,
  onScoreDeleted,
  onAuthExpired
}) => {
  const [displayName, setDisplayName] = useState('');
  const [coinsValue, setCoinsValue] = useState('0');
  const [streakValue, setStreakValue] = useState('0');
  const [equippedTheme, setEquippedTheme] = useState('cyberpunk');
  const [unlockCode, setUnlockCode] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [confirmScoreId, setConfirmScoreId] = useState<string | null>(null);
  const [deletingScoreId, setDeletingScoreId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [rewardCoins, setRewardCoins] = useState('250');
  const [rewardTheme, setRewardTheme] = useState('');
  const [rewardReason, setRewardReason] = useState('');
  const [rewardLoading, setRewardLoading] = useState(false);

  const [banPreset, setBanPreset] = useState<
    '1' | '6' | '24' | '72' | '168' | '720' | 'custom' | 'permanent'
  >('24');
  const [customBanHours, setCustomBanHours] = useState('48');
  const [banReasonInput, setBanReasonInput] = useState('');
  const [banRemoveLb, setBanRemoveLb] = useState(true);
  const [banLoading, setBanLoading] = useState(false);

  useEffect(() => {
    if (!detail) return;
    setDisplayName(detail.player.displayName);
    setCoinsValue(String(detail.player.hexaCoins));
    setStreakValue(String(detail.player.streakCount));
    setEquippedTheme(detail.player.equippedTheme);
    const locked = (Object.keys(THEMES) as ThemeId[]).filter(
      (code) => !detail.player.unlockedItems.includes(code)
    );
    setUnlockCode(locked[0] ?? '');
    setRewardCoins('250');
    setRewardTheme('');
    setRewardReason('');
    setBanReasonInput(detail.player.banInfo?.banReason ?? '');
    setSaveMessage(null);
    setSaveError(null);
    setConfirmDeleteUser(false);
    setConfirmScoreId(null);
  }, [detail]);

  const handleCopy = async (key: string, text: string | null | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // clipboard blocked
    }
  };

  const handleQuickCoinDelta = async (delta: number) => {
    if (!detail) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updated = await updateAdminPlayer(detail.player.id, { coinsDelta: delta });
      onUpdated(updated);
      setSaveMessage(
        delta >= 0
          ? `Oyuncuya +${delta} GyroCoins eklendi.`
          : `Oyuncudan ${Math.abs(delta)} GyroCoins düşüldü.`
      );
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Coin güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const parsedCoins = Number.parseInt(coinsValue, 10);
    const parsedStreak = Number.parseInt(streakValue, 10);
    if (!Number.isFinite(parsedCoins) || parsedCoins < 0) {
      setSaveError('Geçerli bir GyroCoins bakiyesi gir (>= 0).');
      return;
    }
    if (!Number.isFinite(parsedStreak) || parsedStreak < 0 || parsedStreak > 365) {
      setSaveError('Giriş serisi 0 ile 365 arasında olmalıdır.');
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updated = await updateAdminPlayer(detail.player.id, {
        displayName: displayName.trim() || detail.player.displayName,
        hexaCoins: parsedCoins,
        streakCount: parsedStreak,
        equippedTheme
      });
      onUpdated(updated);
      setSaveMessage('Oyuncu bilgileri kaydedildi.');
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Güncelleme başarısız oldu.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlockTheme = async () => {
    if (!detail || !unlockCode) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updated = await updateAdminPlayer(detail.player.id, { unlockThemeCode: unlockCode });
      onUpdated(updated);
      setSaveMessage(`${THEMES[unlockCode as ThemeId]?.name ?? unlockCode} teması açıldı.`);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Tema kilidi açılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!detail) return;
    setDeletingUser(true);
    setSaveError(null);
    try {
      const res = await deleteAdminPlayer(detail.player.id);
      if (res.deleted) {
        onDeleted(detail.player.id);
      }
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Oyuncu silinemedi.');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleDeleteScore = async (scoreId: string) => {
    setDeletingScoreId(scoreId);
    setSaveError(null);
    try {
      await deleteAdminScore(scoreId);
      setConfirmScoreId(null);
      onScoreDeleted(scoreId);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Skor kaydı silinemedi.');
    } finally {
      setDeletingScoreId(null);
    }
  };

  const handleSendReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const coins = Number.parseInt(rewardCoins, 10) || 0;
    if (coins <= 0 && !rewardTheme) {
      setSaveError('Ödül olarak coin miktarı veya tema seçmelisin.');
      return;
    }
    setRewardLoading(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const res = await grantAdminReward({
        scope: 'single',
        userId: detail.player.id,
        coinsAmount: Math.max(0, coins),
        themeCode: rewardTheme || undefined,
        reason: rewardReason.trim() || undefined
      });
      if (res.playerDetail) {
        onUpdated(res.playerDetail);
      }
      setRewardTheme('');
      setRewardReason('');
      setSaveMessage('Ödül oyuncunun hesabına tanımlandı.');
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Ödül gönderilemedi.');
    } finally {
      setRewardLoading(false);
    }
  };

  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const isPermanent = banPreset === 'permanent';
    const durationHours = isPermanent
      ? undefined
      : banPreset === 'custom'
        ? Number.parseFloat(customBanHours)
        : Number.parseFloat(banPreset);

    if (!isPermanent && (!Number.isFinite(durationHours) || (durationHours ?? 0) <= 0)) {
      setSaveError('Geçerli bir yasaklama süresi (saat) gir.');
      return;
    }

    setBanLoading(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updated = await banAdminPlayer(detail.player.id, {
        permanent: isPermanent,
        durationHours,
        reason: banReasonInput.trim() || undefined,
        removeFromLeaderboard: banRemoveLb
      });
      onUpdated(updated);
      setSaveMessage(isPermanent ? 'Oyuncu süresiz yasaklandı.' : 'Oyuncu süreli olarak yasaklandı.');
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Yasaklama işlemi başarısız oldu.');
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnban = async () => {
    if (!detail) return;
    setBanLoading(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updated = await unbanAdminPlayer(detail.player.id);
      onUpdated(updated);
      setSaveMessage('Oyuncunun hesap yasağı kaldırıldı.');
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onAuthExpired(err);
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Yasak kaldırılamadı.');
    } finally {
      setBanLoading(false);
    }
  };

  const themeIds = Object.keys(THEMES) as ThemeId[];
  const lockedThemes = detail
    ? themeIds.filter((code) => !detail.player.unlockedItems.includes(code))
    : [];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl bg-[#0d1424] border border-white/12 text-slate-100 shadow-2xl"
      >
        {/* Top Modal Header */}
        <header className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 font-extrabold text-xl flex items-center justify-center shrink-0">
              {(detail?.player.displayName.trim()[0] || 'G').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold truncate">
                  {detail ? detail.player.displayName : 'Oyuncu Detayı'}
                </h2>
                {detail && (
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                      detail.player.email
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                        : 'bg-slate-500/20 text-slate-300 border border-white/10'
                    }`}
                  >
                    {detail.player.email ? 'Kayıtlı Hesap' : 'Misafir'}
                  </span>
                )}
              </div>
              {detail && (
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {detail.player.email ?? 'E-posta bağlı değil (tarayıcı/cihaz misafiri)'}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll custom-scroll-dark p-5 sm:p-6 space-y-5">
        {loading && !detail ? (
          <div className="py-12 text-center text-sm text-slate-400">Oyuncu verileri yükleniyor...</div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-sm">
            {error}
          </div>
        ) : detail ? (
          <>
            {detail.player.banInfo?.isBanned && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-extrabold text-sm text-rose-200 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      HESAP YASAKLI (
                      {detail.player.banInfo.isPermanent
                        ? 'Süresiz Yasak'
                        : `Bitiş: ${formatDateTime(detail.player.banInfo.bannedUntil)}`}
                      )
                    </span>
                  </div>
                  {detail.player.banInfo.banReason && (
                    <div className="text-rose-200/85">Sebep: {detail.player.banInfo.banReason}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={banLoading}
                  onClick={() => void handleUnban()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {banLoading ? 'Kaldırılıyor...' : 'Yasağı Kaldır'}
                </button>
              </div>
            )}

            {/* Identifiers & Providers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Oyuncu UUID</div>
                  <div className="font-mono text-[11px] text-slate-200 truncate">{detail.player.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('uuid', detail.player.id)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 cursor-pointer shrink-0"
                  title="UUID Kopyala"
                >
                  {copiedKey === 'uuid' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Cihaz Kimliği</div>
                  <div className="font-mono text-[11px] text-slate-200 truncate">
                    {detail.player.guestDeviceId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('device', detail.player.guestDeviceId)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 cursor-pointer shrink-0"
                  title="Cihaz Kimliği Kopyala"
                >
                  {copiedKey === 'device' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">Bağlı Hesaplar</div>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 ${
                      detail.player.linkedProviders?.email
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    <Mail className="w-3 h-3" /> E-posta
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 ${
                      detail.player.linkedProviders?.google
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    <Smartphone className="w-3 h-3" /> Google
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 ${
                      detail.player.linkedProviders?.facebook
                        ? 'bg-[#1877F2]/25 text-blue-200'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    <span className="font-extrabold leading-none">f</span> Facebook
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 ${
                      detail.player.linkedProviders?.apple
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" /> Apple
                  </span>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                <span className="text-[10px] text-slate-400 block">Kayıt / İlk Giriş</span>
                <span className="font-semibold text-slate-200">{formatDateTime(detail.createdAt)}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                <span className="text-[10px] text-slate-400 block">Son Güncelleme</span>
                <span className="font-semibold text-slate-200">{formatDateTime(detail.updatedAt)}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                <span className="text-[10px] text-slate-400 block">Son Giriş Günü</span>
                <span className="font-semibold text-slate-200">{detail.lastLoginDate ?? '-'}</span>
              </div>
            </div>

            {detail.visitSummary && detail.visitSummary.totalVisits > 0 && (
              <div className="p-4 rounded-2xl bg-cyan-500/[0.06] border border-cyan-400/20 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-cyan-200">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Ziyaret, Konum &amp; Süre Özeti</span>
                  </div>
                  <span className="font-mono text-[11px] text-cyan-300">
                    {detail.visitSummary.totalVisits} oturum
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">Son Konum</span>
                    <span className="font-semibold text-slate-100 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                      <span className="truncate">
                        {detail.visitSummary.lastCity
                          ? `${detail.visitSummary.lastCity}, ${detail.visitSummary.lastCountryCode}`
                          : formatCountryTr(detail.visitSummary.lastCountryCode)}
                      </span>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">Sitede Geçirdiği Süre</span>
                    <span className="font-bold font-mono text-sky-300 mt-0.5 block">
                      {formatDurationTr(detail.visitSummary.totalSiteDurationSec)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">Oyunda Geçirdiği Süre</span>
                    <span className="font-bold font-mono text-amber-300 mt-0.5 block">
                      {formatDurationTr(detail.visitSummary.totalPlayDurationSec)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">Cihaz &amp; Tarayıcı</span>
                    <span className="font-semibold text-slate-200 flex items-center gap-1 mt-0.5 truncate">
                      <Monitor className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">
                        {detail.visitSummary.lastBrowser || '-'} · {detail.visitSummary.lastOs || '-'}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Son Kaynak:{' '}
                    <strong className="text-slate-200">
                      {detail.visitSummary.lastReferrerHost === 'direct'
                        ? 'Doğrudan'
                        : detail.visitSummary.lastReferrerHost || '-'}
                    </strong>
                  </span>
                  <span>
                    Son Görülme:{' '}
                    <strong className="text-slate-200">
                      {formatDateTime(detail.visitSummary.lastSeenAt)}
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {/* Full Statistics */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  <span>Oyuncu İstatistikleri</span>
                </div>
                {detail.stats.favoriteSides !== null && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-400/35 text-cyan-200 text-[11px] font-bold">
                    Favori: {detail.stats.favoriteSides} Kenar
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  {
                    label: 'Oynanan Oyun',
                    value: detail.stats.totalGames.toLocaleString('tr-TR'),
                    sub: `Klasik ${detail.stats.classicGames} · Günlük ${detail.stats.dailyGames}`,
                    icon: <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
                  },
                  {
                    label: 'Patlatılan Çubuk',
                    value: detail.stats.totalBlocksCleared.toLocaleString('tr-TR'),
                    sub: 'Toplam temizlenen',
                    icon: <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  },
                  {
                    label: 'En Yüksek Skor',
                    value: detail.stats.bestScore.toLocaleString('tr-TR'),
                    sub: `Klasik ${detail.stats.bestScoreClassic.toLocaleString('tr-TR')} · Günlük ${detail.stats.bestScoreDaily.toLocaleString('tr-TR')}`,
                    icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  },
                  {
                    label: 'En Yüksek Kombo',
                    value: detail.stats.bestCombo > 0 ? `x${detail.stats.bestCombo}` : '-',
                    sub: 'Tek maç rekoru',
                    icon: <Flame className="w-3.5 h-3.5 text-rose-400" />
                  },
                  {
                    label: 'Toplam Skor',
                    value: detail.stats.totalScore.toLocaleString('tr-TR'),
                    sub: 'Birikimli puan',
                    icon: <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  },
                  {
                    label: 'Ortalama Skor',
                    value: detail.stats.averageScore.toLocaleString('tr-TR'),
                    sub: 'Maç başına puan',
                    icon: <Target className="w-3.5 h-3.5 text-sky-400" />
                  },
                  {
                    label: 'Maç Coin Kazancı',
                    value: detail.stats.totalCoinsEarned.toLocaleString('tr-TR'),
                    sub: `Mevcut: ${detail.player.hexaCoins.toLocaleString('tr-TR')} coin`,
                    icon: <Coins className="w-3.5 h-3.5 text-amber-400" />
                  },
                  {
                    label: 'Tamamlanan Görev',
                    value: detail.stats.questsCompleted.toLocaleString('tr-TR'),
                    sub: `Açık tema: ${detail.stats.unlockedThemesCount}/${detail.stats.totalThemesCount}`,
                    icon: <Award className="w-3.5 h-3.5 text-emerald-400" />
                  }
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>{m.label}</span>
                      {m.icon}
                    </div>
                    <div className="font-extrabold text-sm">{m.value}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {SUPPORTED_SIDES.map((s) => {
                  const row = detail.stats.bySides.find((item) => item.sides === s);
                  return (
                    <div
                      key={s}
                      className={`p-2 rounded-xl border text-center text-xs ${
                        detail.stats.favoriteSides === s
                          ? 'bg-cyan-500/15 border-cyan-400/50'
                          : 'bg-black/30 border-white/10'
                      }`}
                    >
                      <div className="font-mono font-bold text-[11px]">{s}G</div>
                      <div className="font-bold mt-0.5">
                        {(row?.bestScore ?? 0).toLocaleString('tr-TR')}
                      </div>
                      <div className="text-[10px] text-slate-400">{row?.games ?? 0} oyun</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quests & Admin Management Form */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Today Quests + Themes */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs">
                <div className="font-bold text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Bugünkü Görevler & Tema Envanteri</span>
                </div>
                <div className="space-y-2">
                  {detail.quests.map((q) => {
                    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                    return (
                      <div key={q.questCode} className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{q.title}</span>
                          <span className={q.claimed ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                            {q.claimed ? 'Alındı ✓' : `+${q.rewardCoins} Coin`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-400">
                          İlerleme: {q.progress} / {q.target} ({q.questDate})
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-purple-400" /> Sahip Olunan Temalar
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {themeIds.map((code) => {
                      const unlocked = detail.player.unlockedItems.includes(code);
                      const equipped = detail.player.equippedTheme === code;
                      return (
                        <span
                          key={code}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                            equipped
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                              : unlocked
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                : 'bg-white/5 border-white/10 text-slate-500'
                          }`}
                        >
                          {THEMES[code].name} {equipped ? '(Seçili)' : unlocked ? '✓' : '🔒'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Admin Edit Form */}
              <form
                onSubmit={(e) => void handleSaveChanges(e)}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs"
              >
                <div className="font-bold text-sm flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <span>Yönetici Düzenlemeleri</span>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Oyuncu Adı
                  </label>
                  <input
                    type="text"
                    minLength={1}
                    maxLength={32}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      GyroCoins Bakiyesi
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000000}
                      value={coinsValue}
                      onChange={(e) => setCoinsValue(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-amber-300 font-mono text-sm focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Giriş Serisi (Gün)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={streakValue}
                      onChange={(e) => setStreakValue(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-emerald-300 font-mono text-sm focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Hızlı Coin:</span>
                  {[100, 500, -100].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      disabled={saving}
                      onClick={() => void handleQuickCoinDelta(delta)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] cursor-pointer border disabled:opacity-50 ${
                        delta > 0
                          ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-300'
                          : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-300'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Aktif Tema (Otomatik Açar)
                    </label>
                    <AdminSelect
                      wrapperClassName="w-full"
                      value={equippedTheme}
                      onChange={(e) => setEquippedTheme(e.target.value)}
                      className="w-full pl-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                    >
                      {themeIds.map((code) => (
                        <option key={code} value={code}>
                          {THEMES[code].name}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>

                  {lockedThemes.length > 0 && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                        Tema Kilidi Aç
                      </label>
                      <div className="flex gap-1.5">
                        <AdminSelect
                          wrapperClassName="flex-1 min-w-0"
                          value={unlockCode}
                          onChange={(e) => setUnlockCode(e.target.value)}
                          className="w-full pl-2.5 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                        >
                          {lockedThemes.map((code) => (
                            <option key={code} value={code}>
                              {THEMES[code].name}
                            </option>
                          ))}
                        </AdminSelect>
                        <button
                          type="button"
                          disabled={saving || !unlockCode}
                          onClick={() => void handleUnlockTheme()}
                          className="px-3 py-2 rounded-xl bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/40 text-purple-200 font-bold cursor-pointer disabled:opacity-50"
                        >
                          Aç
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</span>
                </button>

                {saveMessage && (
                  <p className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-semibold">
                    {saveMessage}
                  </p>
                )}
                {saveError && (
                  <p className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 font-semibold">
                    {saveError}
                  </p>
                )}
              </form>
            </div>

            {/* Grant Reward + Ban Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <form
                onSubmit={(e) => void handleSendReward(e)}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3"
              >
                <div className="font-bold text-sm flex items-center gap-2">
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span>Hediye / Ödül Gönder</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['100', '250', '500', '1000'].map((preset) => (
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

                <div className="grid grid-cols-2 gap-2.5">
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
                      className="w-full pl-2.5 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-emerald-400"
                    >
                      <option value="">
                        Tema Yok
                      </option>
                      {themeIds.map((code) => (
                        <option key={code} value={code}>
                          {THEMES[code].name}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
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
                    placeholder="Örn: Turnuva ödülü, hata telafisi..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={rewardLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Gift className="w-4 h-4" />
                  <span>{rewardLoading ? 'Gönderiliyor...' : 'Ödülü Gönder'}</span>
                </button>
              </form>

              <form
                onSubmit={(e) => void handleBanSubmit(e)}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3"
              >
                <div className="font-bold text-sm flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-400" />
                  <span>Yasaklama (Ban) Yönetimi</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['1', '1 Saat'],
                      ['6', '6 Saat'],
                      ['24', '24 Saat'],
                      ['72', '3 Gün'],
                      ['168', '7 Gün'],
                      ['720', '30 Gün'],
                      ['custom', 'Özel Saat'],
                      ['permanent', 'Süresiz']
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBanPreset(val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        banPreset === val
                          ? val === 'permanent'
                            ? 'bg-rose-500/30 border-rose-400 text-rose-200'
                            : 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                          : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {val !== 'permanent' && val !== 'custom' && (
                        <Clock className="w-3 h-3 inline mr-1" />
                      )}
                      {label}
                    </button>
                  ))}
                </div>

                {banPreset === 'custom' && (
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Yasaklama Süresi (Saat)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={43800}
                      value={customBanHours}
                      onChange={(e) => setCustomBanHours(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-amber-300 font-mono text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Yasaklama Sebebi (Oyuncuya Gösterilir)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    placeholder="Örn: Uygunsuz oyuncu adı veya hile tespiti..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-slate-100 text-xs focus:outline-none focus:border-rose-400"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={banRemoveLb}
                    onChange={(e) => setBanRemoveLb(e.target.checked)}
                    className="rounded border-white/20 bg-black/40"
                  />
                  <span>Yasaklandığında liderlik tablosundan da kaldır</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={banLoading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Ban className="w-4 h-4" />
                    <span>{banLoading ? 'İşleniyor...' : 'Oyuncuyu Yasakla'}</span>
                  </button>
                  {detail.player.banInfo?.isBanned && (
                    <button
                      type="button"
                      disabled={banLoading}
                      onClick={() => void handleUnban()}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      Yasağı Kaldır
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Recent 15 Games */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Son Oyunlar (En Fazla 15 Kayıt)</span>
                <span className="text-xs text-slate-400">{detail.recentGames.length} kayıt</span>
              </div>

              {detail.recentGames.length === 0 ? (
                <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-center text-xs text-slate-400">
                  Bu oyuncunun henüz doğrulanmış bir oyun kaydı yok.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                        <th className="py-2 pr-3">Tarih</th>
                        <th className="py-2 pr-3">Mod</th>
                        <th className="py-2 pr-3">Kenar</th>
                        <th className="py-2 pr-3 text-right">Skor</th>
                        <th className="py-2 pr-3 text-right">Blok</th>
                        <th className="py-2 pr-3 text-right">Kombo</th>
                        <th className="py-2 pr-3 text-right">Coin</th>
                        <th className="py-2 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {detail.recentGames.map((g) => (
                        <tr key={g.id} className="hover:bg-white/5">
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-300">
                            {formatDateTime(g.createdAt)}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                g.mode === 'daily'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-white/10 text-slate-200'
                              }`}
                            >
                              {g.mode === 'daily' ? 'Günlük' : 'Klasik'}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-mono font-bold">{g.sides}G</td>
                          <td className="py-2 pr-3 text-right font-bold text-cyan-300">
                            {g.score.toLocaleString('tr-TR')}
                          </td>
                          <td className="py-2 pr-3 text-right">{g.blocksCleared}</td>
                          <td className="py-2 pr-3 text-right text-rose-300">x{g.maxCombo}</td>
                          <td className="py-2 pr-3 text-right text-amber-300">+{g.coinsEarned}</td>
                          <td className="py-2 text-right">
                            {confirmScoreId === g.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingScoreId === g.id}
                                  onClick={() => void handleDeleteScore(g.id)}
                                  className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Onayla
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmScoreId(null)}
                                  className="px-2 py-0.5 rounded bg-white/10 text-slate-200 text-[10px] cursor-pointer"
                                >
                                  İptal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmScoreId(g.id)}
                                className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                                title="Skor Kaydını Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm text-rose-300 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" />
                  <span>Tehlikeli Bölge: Oyuncu Hesabını Sil</span>
                </div>
                <p className="text-xs text-rose-200/75 mt-0.5">
                  Oyuncuyu, tüm oyun skorlarını, envanterini ve liderlik tablosu kaydını kalıcı olarak siler.
                </p>
              </div>
              {!confirmDeleteUser ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(true)}
                  className="px-4 py-2 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-500/50 text-rose-200 font-bold text-xs cursor-pointer shrink-0"
                >
                  Oyuncuyu Kalıcı Olarak Sil
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={deletingUser}
                    onClick={() => void handleDeleteUser()}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {deletingUser ? 'Siliniyor...' : 'Evet, Kalıcı Olarak Sil'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUser(false)}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-semibold text-xs cursor-pointer"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
        </div>
      </div>
    </div>
  );
};
