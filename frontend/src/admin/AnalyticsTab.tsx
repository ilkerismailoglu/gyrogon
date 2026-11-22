import {
  Activity,
  Clock,
  Download,
  ExternalLink,
  Gamepad2,
  Globe,
  Laptop,
  MapPin,
  Monitor,
  Radio,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  Timer,
  TrendingUp,
  Users
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminAnalyticsReportDTO,
  AdminAuthError,
  AnalyticsRangeDTO,
  DeviceTypeDTO,
  SourceCategoryDTO,
  fetchAdminAnalytics
} from './adminApi';

interface AnalyticsTabProps {
  onOpenPlayer: (userId: string) => void;
  onAuthExpired: (err: AdminAuthError) => void;
  refreshSignal: number;
}

type TimelineMetric = 'visits' | 'uniqueVisitors' | 'siteMinutes' | 'playMinutes' | 'gamesStarted';

const RANGE_OPTIONS: Array<{ id: AnalyticsRangeDTO; label: string }> = [
  { id: '24h', label: 'Son 24 Saat' },
  { id: '7d', label: 'Son 7 Gün' },
  { id: '30d', label: 'Son 30 Gün' },
  { id: '90d', label: 'Son 90 Gün' },
  { id: 'all', label: 'Tümü' }
];

const SOURCE_LABELS: Record<SourceCategoryDTO, string> = {
  direct: 'Doğrudan Giriş',
  social: 'Sosyal Medya',
  search: 'Arama Motoru',
  campaign: 'Kampanya (UTM)',
  referral: 'Diğer Site (Referral)'
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobil',
  desktop: 'Masaüstü',
  tablet: 'Tablet'
};

const APP_MODE_LABELS: Record<string, string> = {
  browser: 'Web Tarayıcı',
  pwa: 'Kurulu PWA Uygulaması',
  native: 'Mobil Uygulama'
};

const LAYOUT_LABELS: Record<string, string> = {
  polygon: 'Çokgen',
  bloom: 'Düzlem',
  morph: 'Dinamik'
};

const MODE_LABELS: Record<string, string> = {
  classic: 'Klasik Mod',
  daily: 'Günlük Bulmaca'
};

let regionDisplayNames: Intl.DisplayNames | null = null;
try {
  regionDisplayNames = new Intl.DisplayNames(['tr'], { type: 'region' });
} catch {
  regionDisplayNames = null;
}

function countryFlagEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (upper === 'LOCAL') return '🖥️';
  if (upper === 'UNKNOWN') return '🌐';
  if (upper === 'TOR') return '🧅';
  if (!/^[A-Z]{2}$/.test(upper)) return '🏳️';
  return String.fromCodePoint(...upper.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatCountryTr(code: string | null | undefined): string {
  if (!code) return '🌐 Bilinmiyor';
  const upper = code.toUpperCase();
  const flag = countryFlagEmoji(upper);
  if (upper === 'LOCAL') return `${flag} Yerel Geliştirme`;
  if (upper === 'UNKNOWN') return `${flag} Bilinmeyen Konum`;
  if (upper === 'TOR') return `${flag} Tor Ağı`;
  const localized = /^[A-Z]{2}$/.test(upper) ? regionDisplayNames?.of(upper) : undefined;
  return `${flag} ${localized || upper}`;
}

export function formatDurationTr(seconds: number | null | undefined): string {
  const sec = Math.max(0, Math.round(seconds ?? 0));
  if (sec < 60) return `${sec} sn`;
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs} sa ${mins} dk` : `${hrs} sa`;
  }
  return remSec > 0 && mins < 10 ? `${mins} dk ${remSec} sn` : `${mins} dk`;
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

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  onOpenPlayer,
  onAuthExpired,
  refreshSignal
}) => {
  const [range, setRange] = useState<AnalyticsRangeDTO>('7d');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<'all' | DeviceTypeDTO>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceCategoryDTO>('all');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [metric, setMetric] = useState<TimelineMetric>('visits');

  const [report, setReport] = useState<AdminAnalyticsReportDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminAnalytics({
          range,
          country: countryFilter,
          deviceType: deviceFilter,
          source: sourceFilter
        });
        setReport(res);
      } catch (err) {
        if (err instanceof AdminAuthError) {
          onAuthExpired(err);
          return;
        }
        setError(err instanceof Error ? err.message : 'Trafik ve analitik verileri alınamadı.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [countryFilter, deviceFilter, onAuthExpired, range, sourceFilter]
  );

  useEffect(() => {
    void loadAnalytics(false);
  }, [loadAnalytics, refreshSignal]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadAnalytics(true);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadAnalytics]);

  const timelineValues = useMemo(() => {
    if (!report) return [];
    return report.timeline.map((pt) => {
      switch (metric) {
        case 'uniqueVisitors':
          return pt.uniqueVisitors;
        case 'siteMinutes':
          return Math.round(pt.totalSiteSec / 60);
        case 'playMinutes':
          return Math.round(pt.totalPlaySec / 60);
        case 'gamesStarted':
          return pt.gamesStarted;
        case 'visits':
        default:
          return pt.visits;
      }
    });
  }, [metric, report]);

  const maxTimelineVal = useMemo(
    () => Math.max(1, ...timelineValues),
    [timelineValues]
  );

  const maxHourVal = useMemo(
    () => (report ? Math.max(1, ...report.hourlyActivity.map((h) => h.visits)) : 1),
    [report]
  );

  const handleExportCsv = () => {
    if (!report) return;
    const header = [
      'Tarih',
      'Son Gorulme',
      'Canli',
      'Oyunda',
      'Oyuncu',
      'E-posta',
      'Ziyaret Turu',
      'Ulke Kodu',
      'Sehir',
      'Bolge',
      'Kaynak Kategorisi',
      'Kaynak / Referrer',
      'UTM Source',
      'UTM Campaign',
      'Giris Yolu',
      'Cihaz',
      'Isletim Sistemi',
      'Tarayici',
      'Acilis Modu',
      'Ekran',
      'Dil',
      'Baglanti',
      'Sitede Sure (sn)',
      'Oyunda Sure (sn)',
      'Baslatilan Oyun',
      'Biten Oyun',
      'En Iyi Skor',
      'Son Mod',
      'Son Cokgen',
      'Son Bicim'
    ];

    const rows = report.recentVisits.map((v) =>
      [
        v.startedAt,
        v.lastSeenAt,
        v.isLive ? 'Evet' : 'Hayir',
        v.isPlayingNow ? 'Evet' : 'Hayir',
        v.playerName ?? 'Anonim',
        v.playerEmail ?? '',
        v.isReturning ? 'Geri Donen' : 'Yeni Ziyaretci',
        v.countryCode,
        v.city ?? '',
        v.region ?? '',
        SOURCE_LABELS[v.sourceCategory] ?? v.sourceCategory,
        v.referrerHost,
        v.utmSource ?? '',
        v.utmCampaign ?? '',
        v.landingPath,
        DEVICE_LABELS[v.deviceType] ?? v.deviceType,
        `${v.osName}${v.osVersion ? ` ${v.osVersion}` : ''}`,
        `${v.browserName}${v.browserVersion ? ` ${v.browserVersion}` : ''}`,
        APP_MODE_LABELS[v.appMode] ?? v.appMode,
        v.screenWidth && v.screenHeight ? `${v.screenWidth}x${v.screenHeight}` : '',
        v.language ?? '',
        v.connectionType ?? '',
        v.siteDurationSec,
        v.playDurationSec,
        v.gamesStarted,
        v.gamesCompleted,
        v.bestScore,
        v.lastMode ?? '',
        v.lastSides ?? '',
        v.lastLayout ?? ''
      ]
        .map(csvCell)
        .join(',')
    );

    const csv = `\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gyrogon-trafik-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const s = report?.summary;
  const maxCountryVisits = report?.byCountry[0]?.visits || 1;
  const maxCityVisits = report?.byCity[0]?.visits || 1;
  const maxSiteBucket = Math.max(1, ...(report?.siteDurationBuckets.map((b) => b.visits) ?? [1]));
  const maxPlayBucket = Math.max(1, ...(report?.playDurationBuckets.map((b) => b.visits) ?? [1]));

  return (
    <div className="space-y-6">
      {/* Control & Filter Bar */}
      <div className="p-4 rounded-3xl bg-[#0d1424] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                range === opt.id
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-slate-200 cursor-pointer"
          >
            <option value="all">Tüm Ülkeler</option>
            {(report?.availableCountries ?? []).map((code) => (
              <option key={code} value={code}>
                {formatCountryTr(code)}
              </option>
            ))}
          </select>

          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value as 'all' | DeviceTypeDTO)}
            className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-slate-200 cursor-pointer"
          >
            <option value="all">Tüm Cihazlar</option>
            <option value="mobile">Mobil</option>
            <option value="desktop">Masaüstü</option>
            <option value="tablet">Tablet</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | SourceCategoryDTO)}
            className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-slate-200 cursor-pointer"
          >
            <option value="all">Tüm Kaynaklar</option>
            <option value="direct">Doğrudan</option>
            <option value="social">Sosyal Medya</option>
            <option value="search">Arama Motoru</option>
            <option value="campaign">Kampanya (UTM)</option>
            <option value="referral">Diğer Siteler</option>
          </select>

          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
            title="30 saniyede bir canlı yenile"
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            <span>{autoRefresh ? 'Canlı 30sn' : 'Otomatik Kapalı'}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadAnalytics(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Güncelle</span>
          </button>

          <button
            type="button"
            disabled={!report || report.recentVisits.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/35 text-cyan-200 font-bold cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs font-semibold">
          {error}
        </div>
      )}

      {!report && loading ? (
        <div className="py-16 text-center text-sm text-slate-400">
          Konum, tarayıcı ve oyun süresi analizleri hazırlanıyor...
        </div>
      ) : report && s ? (
        <>
          {/* 8 Headline KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/5 border border-emerald-500/30">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <span>Anlık Canlı Ziyaretçi</span>
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-emerald-200">
                {s.liveVisitors.toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-emerald-300/80 mt-0.5">
                {s.livePlayingNow} kişi şu an aktif oyun oynuyor
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Toplam / Tekil Ziyaret</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5">
                {s.totalVisits.toLocaleString('tr-TR')}
                <span className="text-sm text-cyan-300 font-semibold ml-1.5">
                  / {s.uniqueVisitors.toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {s.newVisitors} yeni · {s.returningVisitors} geri dönen (%{s.returningRate})
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Ort. Sitede Kalma Süresi</span>
                <Clock className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-sky-200">
                {formatDurationTr(s.avgSiteDurationSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Toplam sitede geçirilen: {formatDurationTr(s.totalSiteDurationSec)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Ort. Oyun Süresi</span>
                <Timer className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-amber-300">
                {formatDurationTr(s.avgPlayDurationAmongPlayersSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Toplam oyun: {formatDurationTr(s.totalPlayDurationSec)} · Pay: %{s.playSharePercent}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Oyuna Başlama Oranı</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-emerald-300">
                %{s.playConversionRate}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {s.visitsWithGameplay} ziyarette oyun oynandı
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Hemen Çıkma (&lt;15 sn)</span>
                <Activity className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-rose-300">
                %{s.bounceRate}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {s.bounceCount} ziyaret oyun başlatmadan çıktı
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Başlatılan / Biten Oyun</span>
                <Gamepad2 className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5">
                {s.totalGamesStarted.toLocaleString('tr-TR')}
                <span className="text-sm text-purple-300 font-semibold ml-1.5">
                  / {s.totalGamesCompleted.toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Tamamlama oranı: %{s.completionRate}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1424] border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Tanımlı Oyuncu Ziyareti</span>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-extrabold font-mono mt-1.5 text-indigo-200">
                {s.registeredVisitsCount.toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {s.totalVisits - s.registeredVisitsCount} kimliksiz/misafir oturum
              </div>
            </div>
          </div>

          {/* Timeline + 24-Hour Peak Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-base">
                    {range === '24h' ? 'Saatlik Trafik & Süre Eğilimi' : 'Günlük Trafik & Süre Eğilimi'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Ziyaret, tekil kullanıcı ve sitede/oyunda geçirilen toplam dakika
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {[
                    { id: 'visits' as const, label: 'Ziyaret' },
                    { id: 'uniqueVisitors' as const, label: 'Tekil' },
                    { id: 'siteMinutes' as const, label: 'Site (dk)' },
                    { id: 'playMinutes' as const, label: 'Oyun (dk)' },
                    { id: 'gamesStarted' as const, label: 'Oyun Adedi' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetric(m.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        metric === m.id
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-44 flex items-end gap-1 pt-4">
                {report.timeline.map((pt, idx) => {
                  const val = timelineValues[idx] ?? 0;
                  const pct = Math.max(4, Math.round((val / maxTimelineVal) * 100));
                  const barColor =
                    metric === 'playMinutes'
                      ? 'from-amber-400 to-orange-500'
                      : metric === 'siteMinutes'
                        ? 'from-sky-400 to-blue-500'
                        : metric === 'gamesStarted'
                          ? 'from-purple-400 to-fuchsia-500'
                          : 'from-cyan-400 to-emerald-400';
                  return (
                    <div
                      key={pt.bucket}
                      className="flex-1 h-full flex flex-col items-center justify-end gap-1 group min-w-0"
                      title={`${pt.label}: ${pt.visits} ziyaret · ${pt.uniqueVisitors} tekil · Site: ${formatDurationTr(
                        pt.totalSiteSec
                      )} · Oyun: ${formatDurationTr(pt.totalPlaySec)} · ${pt.gamesStarted} oyun`}
                    >
                      <div className="w-full h-32 flex items-end justify-center">
                        <div
                          className={`w-full max-w-6 rounded-t-md bg-gradient-to-t ${barColor} opacity-85 group-hover:opacity-100 transition-all`}
                          style={{ height: `${val === 0 ? 3 : pct}%` }}
                        />
                      </div>
                      {(report.timeline.length <= 14 || idx % Math.ceil(report.timeline.length / 10) === 0) && (
                        <span className="text-[9px] font-mono text-slate-500 truncate max-w-full">
                          {pt.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hourly Distribution */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div>
                <h2 className="font-bold text-base">Günün Saatlerine Göre Yoğunluk</h2>
                <p className="text-xs text-slate-400">Türkiye saati (UTC+3) 00:00 – 23:00</p>
              </div>
              <div className="h-44 flex items-end gap-0.5 pt-4">
                {report.hourlyActivity.map((h) => {
                  const pct = Math.max(4, Math.round((h.visits / maxHourVal) * 100));
                  return (
                    <div
                      key={h.hour}
                      className="flex-1 h-full flex flex-col items-center justify-end gap-1 group"
                      title={`Saat ${h.label}:00 · ${h.visits} ziyaret · Oyun süresi ${formatDurationTr(h.totalPlaySec)}`}
                    >
                      <div className="w-full h-32 flex items-end justify-center">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-indigo-500 to-cyan-400 opacity-80 group-hover:opacity-100"
                          style={{ height: `${h.visits === 0 ? 3 : pct}%` }}
                        />
                      </div>
                      {h.hour % 4 === 0 && (
                        <span className="text-[9px] font-mono text-slate-500">{h.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Geography: Countries + Cities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Countries */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span>Ülkelere Göre Dağılım</span>
                </h2>
                <span className="text-[11px] text-slate-400">
                  {report.byCountry.length} farklı ülke · Filtrelemek için tıkla
                </span>
              </div>

              {report.byCountry.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">Kayıtlı ülke verisi yok.</div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scroll custom-scroll-dark">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-[10px] font-mono uppercase text-slate-400 sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5">Ülke</th>
                        <th className="py-2 px-2 text-right">Ziyaret (Tekil)</th>
                        <th className="py-2 px-2 text-right">Ort. Site</th>
                        <th className="py-2 px-2 text-right">Ort. Oyun</th>
                        <th className="py-2 px-2.5 text-right">Oyun</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {report.byCountry.map((c) => (
                        <tr
                          key={c.countryCode}
                          onClick={() =>
                            setCountryFilter((prev) =>
                              prev === c.countryCode ? 'all' : c.countryCode
                            )
                          }
                          className={`hover:bg-white/5 cursor-pointer transition-colors ${
                            countryFilter === c.countryCode ? 'bg-cyan-500/15' : ''
                          }`}
                        >
                          <td className="py-2 px-2.5">
                            <div className="font-semibold text-slate-100">
                              {formatCountryTr(c.countryCode)}
                            </div>
                            <div className="h-1.5 rounded-full bg-black/40 mt-1 overflow-hidden w-28">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{
                                  width: `${Math.max(4, Math.round((c.visits / maxCountryVisits) * 100))}%`
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            <span className="font-bold text-slate-100">{c.visits}</span>{' '}
                            <span className="text-slate-400">({c.uniqueVisitors})</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-sky-300">
                            {formatDurationTr(c.avgSiteSec)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-amber-300">
                            {formatDurationTr(c.avgPlaySec)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-emerald-300">
                            {c.gamesStarted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cities */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span>Şehir &amp; Bölge Dağılımı</span>
                </h2>
                <span className="text-[11px] text-slate-400">
                  Cloudflare IP konum başlıkları aktif
                </span>
              </div>

              {report.byCity.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">Kayıtlı şehir verisi yok.</div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scroll custom-scroll-dark">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-[10px] font-mono uppercase text-slate-400 sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5">Şehir / Bölge</th>
                        <th className="py-2 px-2 text-right">Ziyaret</th>
                        <th className="py-2 px-2 text-right">Toplam Oyun</th>
                        <th className="py-2 px-2.5 text-right">Oyun Adedi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {report.byCity.map((c) => (
                        <tr key={`${c.countryCode}-${c.city}`} className="hover:bg-white/5">
                          <td className="py-2 px-2.5">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              <span>{countryFlagEmoji(c.countryCode)}</span>
                              <span>{c.city}</span>
                              {c.region && c.region !== c.city && (
                                <span className="text-[10px] text-slate-400">· {c.region}</span>
                              )}
                            </div>
                            <div className="h-1.5 rounded-full bg-black/40 mt-1 overflow-hidden w-28">
                              <div
                                className="h-full rounded-full bg-rose-400"
                                style={{
                                  width: `${Math.max(4, Math.round((c.visits / maxCityVisits) * 100))}%`
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            <span className="font-bold">{c.visits}</span>{' '}
                            <span className="text-slate-400">({c.uniqueVisitors})</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-amber-300">
                            {formatDurationTr(c.totalPlaySec)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-emerald-300">
                            {c.gamesStarted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sources, Referrers & UTM Campaigns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Source Categories */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-emerald-400" />
                <span>Nereden Geldiler (Kanallar)</span>
              </h2>
              {report.bySourceCategory.length === 0 ? (
                <div className="py-6 text-xs text-slate-500">Kaynak verisi yok.</div>
              ) : (
                <div className="space-y-3">
                  {report.bySourceCategory.map((src) => (
                    <div key={src.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-100">
                          {SOURCE_LABELS[src.category] ?? src.category}
                        </span>
                        <span className="font-mono text-slate-300">
                          {src.visits} (%{src.sharePercent})
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                          style={{ width: `${Math.max(3, src.sharePercent)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Oyuna dönüşüm: %{src.playConversionRate}</span>
                        <span>Ort. oyun: {formatDurationTr(src.avgPlaySec)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Referrer Domains */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h2 className="font-bold text-base">Yönlendiren Siteler (Referrer)</h2>
              {report.byReferrer.length === 0 ? (
                <div className="py-6 text-xs text-slate-500">Kayıt yok.</div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll custom-scroll-dark">
                  {report.byReferrer.map((r) => (
                    <div
                      key={r.host}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">
                          {r.host === 'direct' ? 'Doğrudan (Adres / Yer İmi)' : r.host}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {SOURCE_LABELS[r.category]} · Ort. oyun {formatDurationTr(r.avgPlaySec)}
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <div className="font-bold text-cyan-300">{r.visits}</div>
                        <div className="text-[10px] text-slate-400">{r.gamesStarted} oyun</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* UTM Campaigns & Landing Paths */}
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="space-y-2">
                <h2 className="font-bold text-base">UTM Kampanya Linkleri</h2>
                {report.byUtmCampaign.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Henüz <code>?utm_source=...</code> parametreli giriş yok. Reklam/sosyal medya
                    linklerine UTM eklendiğinde burada görünür.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll custom-scroll-dark">
                    {report.byUtmCampaign.map((c, idx) => (
                      <div
                        key={`${c.utmSource}-${c.utmCampaign ?? idx}`}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-amber-300 truncate">
                            {c.utmSource}
                            {c.utmMedium ? ` / ${c.utmMedium}` : ''}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {c.utmCampaign || 'Kampanya adı yok'} · Dönüşüm %{c.playConversionRate}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-slate-100">{c.visits}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="text-xs font-bold text-slate-300">Giriş Sayfaları</div>
                <div className="space-y-1.5">
                  {report.byLandingPath.map((lp) => (
                    <div
                      key={lp.name}
                      className="flex items-center justify-between text-xs text-slate-300"
                    >
                      <code className="font-mono text-[11px] text-cyan-300 truncate">{lp.name}</code>
                      <span className="font-mono">
                        {lp.visits} (%{lp.sharePercent})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Technology & Device Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Browsers */}
            <div className="p-4 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>Tarayıcılar</span>
              </h3>
              <div className="space-y-2">
                {report.byBrowser.map((b) => (
                  <div key={b.name} className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-200">{b.name}</span>
                      <span className="font-mono text-slate-300">
                        {b.visits} (%{b.sharePercent})
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${Math.max(4, b.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Operating Systems */}
            <div className="p-4 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Laptop className="w-4 h-4 text-purple-400" />
                <span>İşletim Sistemleri</span>
              </h3>
              <div className="space-y-2">
                {report.byOs.map((o) => (
                  <div key={o.name} className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-200">{o.name}</span>
                      <span className="font-mono text-slate-300">
                        {o.visits} (%{o.sharePercent})
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-400"
                        style={{ width: `${Math.max(4, o.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Devices & App Mode */}
            <div className="p-4 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Cihaz Türü</span>
                </h3>
                {report.byDeviceType.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      {d.name === 'mobile' ? (
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      ) : d.name === 'tablet' ? (
                        <Tablet className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      {DEVICE_LABELS[d.name] ?? d.name}
                    </span>
                    <span className="font-mono text-slate-300">
                      {d.visits} (%{d.sharePercent}) · Ort. {formatDurationTr(d.avgPlaySec)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2">
                <h3 className="font-bold text-xs uppercase font-mono text-slate-400">Açılış Türü</h3>
                {report.byAppMode.map((m) => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <span className="text-slate-200">{APP_MODE_LABELS[m.name] ?? m.name}</span>
                    <span className="font-mono text-slate-300">
                      {m.visits} (%{m.sharePercent})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Screen, Language, Connection */}
            <div className="p-4 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="space-y-1.5">
                <h3 className="font-bold text-sm">Ekran Çözünürlükleri</h3>
                {report.byScreenResolution.slice(0, 5).map((r) => (
                  <div key={r.name} className="flex justify-between text-xs">
                    <span className="font-mono text-slate-200">{r.name}</span>
                    <span className="font-mono text-slate-400">
                      {r.visits} (%{r.sharePercent})
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Dil</div>
                  {report.byLanguage.slice(0, 4).map((l) => (
                    <div key={l.name} className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-200">{l.name}</span>
                      <span className="font-mono text-slate-400">{l.visits}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Bağlantı</div>
                  {report.byConnection.slice(0, 4).map((c) => (
                    <div key={c.name} className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-200">{c.name}</span>
                      <span className="font-mono text-slate-400">{c.visits}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Duration Histograms & Mode/Layout Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h2 className="font-bold text-base">Sitede Kalma Süresi Dağılımı</h2>
              <div className="space-y-2">
                {report.siteDurationBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2.5 text-xs">
                    <span className="w-20 font-mono text-slate-300 shrink-0">{b.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400"
                        style={{
                          width: `${b.visits === 0 ? 0 : Math.max(4, Math.round((b.visits / maxSiteBucket) * 100))}%`
                        }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-slate-300">
                      {b.visits} (%{b.sharePercent})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
              <h2 className="font-bold text-base">Oyunda Kalma Süresi Dağılımı</h2>
              <div className="space-y-2">
                {report.playDurationBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2.5 text-xs">
                    <span className="w-20 font-mono text-slate-300 shrink-0">{b.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                        style={{
                          width: `${b.visits === 0 ? 0 : Math.max(4, Math.round((b.visits / maxPlayBucket) * 100))}%`
                        }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-slate-300">
                      {b.visits} (%{b.sharePercent})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-4">
              <div className="space-y-2">
                <h2 className="font-bold text-base">Tercih Edilen Tahta Biçimi &amp; Mod</h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Tahta Biçimi</div>
                    {report.byLayout.map((l) => (
                      <div key={l.name} className="flex justify-between">
                        <span className="text-slate-200">{LAYOUT_LABELS[l.name] ?? l.name}</span>
                        <span className="font-mono text-cyan-300">{l.visits}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Oyun Modu</div>
                    {report.byMode.map((m) => (
                      <div key={m.name} className="flex justify-between">
                        <span className="text-slate-200">{MODE_LABELS[m.name] ?? m.name}</span>
                        <span className="font-mono text-amber-300">{m.visits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live & Recent Visits Feed */}
          <div className="p-5 rounded-3xl bg-[#0d1424] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-base">Canlı &amp; Son Ziyaret Kayıtları</h2>
                <p className="text-xs text-slate-400">
                  Her oturumun konumu, giriş kaynağı, tarayıcısı, sitede ve oyunda kalma süresi
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Son {report.recentVisits.length} oturum
              </span>
            </div>

            {report.recentVisits.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Seçilen filtreye uygun ziyaret kaydı bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-[10px] font-mono uppercase text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3">Durum / Giriş</th>
                      <th className="py-2.5 px-3">Oyuncu</th>
                      <th className="py-2.5 px-3">Ülke &amp; Şehir</th>
                      <th className="py-2.5 px-3">Kaynak</th>
                      <th className="py-2.5 px-3">Cihaz &amp; Tarayıcı</th>
                      <th className="py-2.5 px-3 text-right">Sitede</th>
                      <th className="py-2.5 px-3 text-right">Oyunda</th>
                      <th className="py-2.5 px-3 text-right">Oyun / En İyi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {report.recentVisits.map((v) => (
                      <tr key={v.id} className="hover:bg-white/[0.04]">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {v.isLive ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                v.isPlayingNow
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                              {v.isPlayingNow ? 'OYUNDA' : 'CANLI'}
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400">
                              {formatDateTime(v.lastSeenAt)}
                            </span>
                          )}
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Başlangıç: {formatDateTime(v.startedAt)}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          {v.userId && v.playerName ? (
                            <button
                              type="button"
                              onClick={() => onOpenPlayer(v.userId!)}
                              className="font-bold text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline cursor-pointer text-left"
                            >
                              {v.playerName}
                            </button>
                          ) : (
                            <span className="text-slate-300 font-semibold">Anonim Ziyaretçi</span>
                          )}
                          <div className="text-[10px] text-slate-500">
                            {v.isReturning ? 'Geri Dönen' : 'Yeni Ziyaretçi'}
                            {v.playerEmail ? ` · ${v.playerEmail}` : ''}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-200">
                            {formatCountryTr(v.countryCode)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {v.city || 'Bilinmeyen Şehir'}
                            {v.region && v.region !== v.city ? `, ${v.region}` : ''}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-200">
                            {v.referrerHost === 'direct' ? 'Doğrudan' : v.referrerHost}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {SOURCE_LABELS[v.sourceCategory]}
                            {v.utmCampaign ? ` · ${v.utmCampaign}` : ''}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-200">
                            {v.browserName}
                            {v.browserVersion ? ` ${v.browserVersion}` : ''} · {v.osName}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {DEVICE_LABELS[v.deviceType] ?? v.deviceType} ·{' '}
                            {APP_MODE_LABELS[v.appMode] ?? v.appMode}
                            {v.screenWidth && v.screenHeight
                              ? ` · ${v.screenWidth}x${v.screenHeight}`
                              : ''}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-sky-300 whitespace-nowrap">
                          {formatDurationTr(v.siteDurationSec)}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-300 whitespace-nowrap">
                          {v.playDurationSec > 0 ? formatDurationTr(v.playDurationSec) : '-'}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          <div className="text-slate-200">
                            {v.gamesStarted} / {v.gamesCompleted}
                            {v.bestScore > 0 && (
                              <span className="text-emerald-300 ml-1">
                                · {v.bestScore.toLocaleString('tr-TR')}
                              </span>
                            )}
                          </div>
                          {v.lastSides && (
                            <div className="text-[10px] text-slate-400">
                              {v.lastSides}-gen · {LAYOUT_LABELS[v.lastLayout ?? ''] ?? v.lastLayout ?? '-'}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
