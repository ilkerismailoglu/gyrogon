import crypto from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { getUtcDateString } from '../db/catalog.js';

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'all';
export type SourceCategory = 'direct' | 'search' | 'social' | 'campaign' | 'referral';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type AppMode = 'browser' | 'pwa' | 'native';

export interface StoredSiteVisit {
  id: string;
  visitToken: string;
  userId: string | null;
  playerName?: string | null;
  playerEmail?: string | null;
  deviceId: string | null;
  visitorHash: string;
  isReturning: boolean;
  landingPath: string;
  referrerUrl: string | null;
  referrerHost: string;
  sourceCategory: SourceCategory;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  continent: string | null;
  timezone: string | null;
  language: string | null;
  deviceType: DeviceType;
  osName: string;
  osVersion: string | null;
  browserName: string;
  browserVersion: string | null;
  appMode: AppMode;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  connectionType: string | null;
  siteDurationSec: number;
  playDurationSec: number;
  gamesStarted: number;
  gamesCompleted: number;
  bestScore: number;
  lastMode: string | null;
  lastSides: number | null;
  lastLayout: string | null;
  isPlayingNow: boolean;
  startedAt: string;
  lastSeenAt: string;
}

export interface RecordVisitInput {
  visitToken: string;
  userId?: string | null;
  deviceId?: string | null;
  visitorHash: string;
  isReturning: boolean;
  landingPath: string;
  referrerUrl: string | null;
  referrerHost: string;
  sourceCategory: SourceCategory;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  continent: string | null;
  timezone: string | null;
  language: string | null;
  deviceType: DeviceType;
  osName: string;
  osVersion: string | null;
  browserName: string;
  browserVersion: string | null;
  appMode: AppMode;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  connectionType: string | null;
}

export interface RecordHeartbeatInput {
  visitToken: string;
  userId?: string | null;
  deviceId?: string | null;
  siteDurationSec: number;
  playDurationSec: number;
  gamesStarted: number;
  gamesCompleted: number;
  bestScore: number;
  isPlayingNow: boolean;
  lastMode?: string | null;
  lastSides?: number | null;
  lastLayout?: string | null;
}

export interface AdminAnalyticsQuery {
  range: AnalyticsRange;
  country?: string;
  deviceType?: 'all' | DeviceType;
  source?: 'all' | SourceCategory;
}

export interface AnalyticsTimelinePoint {
  bucket: string;
  label: string;
  visits: number;
  uniqueVisitors: number;
  totalSiteSec: number;
  totalPlaySec: number;
  gamesStarted: number;
}

export interface AnalyticsHourlyPoint {
  hour: number;
  label: string;
  visits: number;
  totalPlaySec: number;
}

export interface AnalyticsCountryStat {
  countryCode: string;
  visits: number;
  uniqueVisitors: number;
  totalSiteSec: number;
  totalPlaySec: number;
  avgSiteSec: number;
  avgPlaySec: number;
  gamesStarted: number;
  sharePercent: number;
}

export interface AnalyticsCityStat {
  countryCode: string;
  city: string;
  region: string | null;
  visits: number;
  uniqueVisitors: number;
  totalSiteSec: number;
  totalPlaySec: number;
  avgPlaySec: number;
  gamesStarted: number;
}

export interface AnalyticsSourceCategoryStat {
  category: SourceCategory;
  visits: number;
  uniqueVisitors: number;
  avgSiteSec: number;
  avgPlaySec: number;
  playConversionRate: number;
  sharePercent: number;
}

export interface AnalyticsReferrerStat {
  host: string;
  category: SourceCategory;
  visits: number;
  uniqueVisitors: number;
  avgSiteSec: number;
  avgPlaySec: number;
  gamesStarted: number;
}

export interface AnalyticsCampaignStat {
  utmSource: string;
  utmMedium: string | null;
  utmCampaign: string | null;
  visits: number;
  uniqueVisitors: number;
  playConversionRate: number;
  avgPlaySec: number;
}

export interface AnalyticsSimpleCountStat {
  name: string;
  visits: number;
  uniqueVisitors: number;
  totalPlaySec: number;
  avgPlaySec: number;
  sharePercent: number;
}

export interface AnalyticsBucketStat {
  label: string;
  visits: number;
  sharePercent: number;
}

export interface AnalyticsRecentVisit {
  id: string;
  userId: string | null;
  playerName: string | null;
  playerEmail: string | null;
  isReturning: boolean;
  isLive: boolean;
  isPlayingNow: boolean;
  countryCode: string;
  city: string | null;
  region: string | null;
  timezone: string | null;
  language: string | null;
  sourceCategory: SourceCategory;
  referrerHost: string;
  utmSource: string | null;
  utmCampaign: string | null;
  landingPath: string;
  deviceType: DeviceType;
  osName: string;
  osVersion: string | null;
  browserName: string;
  browserVersion: string | null;
  appMode: AppMode;
  screenWidth: number | null;
  screenHeight: number | null;
  connectionType: string | null;
  siteDurationSec: number;
  playDurationSec: number;
  gamesStarted: number;
  gamesCompleted: number;
  bestScore: number;
  lastMode: string | null;
  lastSides: number | null;
  lastLayout: string | null;
  startedAt: string;
  lastSeenAt: string;
}

export interface AdminAnalyticsReport {
  range: AnalyticsRange;
  generatedAt: string;
  liveThresholdSec: number;
  availableCountries: string[];
  summary: {
    liveVisitors: number;
    livePlayingNow: number;
    totalVisits: number;
    uniqueVisitors: number;
    newVisitors: number;
    returningVisitors: number;
    returningRate: number;
    registeredVisitsCount: number;
    totalSiteDurationSec: number;
    avgSiteDurationSec: number;
    totalPlayDurationSec: number;
    avgPlayDurationSec: number;
    avgPlayDurationAmongPlayersSec: number;
    playSharePercent: number;
    visitsWithGameplay: number;
    playConversionRate: number;
    bounceCount: number;
    bounceRate: number;
    totalGamesStarted: number;
    totalGamesCompleted: number;
    completionRate: number;
  };
  timeline: AnalyticsTimelinePoint[];
  hourlyActivity: AnalyticsHourlyPoint[];
  byCountry: AnalyticsCountryStat[];
  byCity: AnalyticsCityStat[];
  bySourceCategory: AnalyticsSourceCategoryStat[];
  byReferrer: AnalyticsReferrerStat[];
  byUtmCampaign: AnalyticsCampaignStat[];
  byLandingPath: AnalyticsSimpleCountStat[];
  byBrowser: AnalyticsSimpleCountStat[];
  byOs: AnalyticsSimpleCountStat[];
  byDeviceType: AnalyticsSimpleCountStat[];
  byAppMode: AnalyticsSimpleCountStat[];
  byScreenResolution: AnalyticsSimpleCountStat[];
  byLanguage: AnalyticsSimpleCountStat[];
  byConnection: AnalyticsSimpleCountStat[];
  byLayout: AnalyticsSimpleCountStat[];
  byMode: AnalyticsSimpleCountStat[];
  siteDurationBuckets: AnalyticsBucketStat[];
  playDurationBuckets: AnalyticsBucketStat[];
  recentVisits: AnalyticsRecentVisit[];
}

export interface PlayerVisitSummary {
  totalVisits: number;
  totalSiteDurationSec: number;
  totalPlayDurationSec: number;
  lastSeenAt: string | null;
  lastCountryCode: string | null;
  lastCity: string | null;
  lastRegion: string | null;
  lastBrowser: string | null;
  lastOs: string | null;
  lastDeviceType: DeviceType | null;
  lastAppMode: AppMode | null;
  lastReferrerHost: string | null;
  lastSourceCategory: SourceCategory | null;
  recentVisits: AnalyticsRecentVisit[];
}

export const LIVE_THRESHOLD_MS = 90 * 1000;
const LIVE_THRESHOLD_SEC = 90;
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

const SEARCH_HOSTS = [
  'google.',
  'bing.com',
  'yandex.',
  'duckduckgo.com',
  'yahoo.com',
  'baidu.com',
  'ecosia.org',
  'search.brave.com'
];

const SOCIAL_HOSTS = [
  'instagram.com',
  'l.instagram.com',
  'facebook.com',
  'm.facebook.com',
  'l.facebook.com',
  'lm.facebook.com',
  't.co',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'reddit.com',
  'linkedin.com',
  'lnkd.in',
  'discord.com',
  'discordapp.com',
  'telegram.org',
  't.me',
  'whatsapp.com',
  'wa.me',
  'pinterest.com',
  'threads.net'
];

const DEFAULT_OWN_HOSTS = new Set(['gyrogon.com', 'www.gyrogon.com', 'localhost', '127.0.0.1']);

const BOT_UA_PATTERN =
  /bot\b|crawler|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|discordbot|linkedinbot|slackbot|pinterest|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|python-requests|aiohttp|httpx|curl\/|wget\/|go-http-client|uptime|pingdom|statuscake|ahrefs|semrush|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|yandexbot/i;

export function isBotUserAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return false;
  // Legitimate mobile in-app browsers contain identifiers that shouldn't be treated as bots
  if (/instagram|fban|fbav|tiktok|line\/|micromessenger/i.test(ua)) {
    return false;
  }
  return BOT_UA_PATTERN.test(ua);
}

export function parseUserAgent(rawUa: string | undefined): {
  deviceType: DeviceType;
  osName: string;
  osVersion: string | null;
  browserName: string;
  browserVersion: string | null;
} {
  const ua = rawUa ?? '';
  if (!ua.trim()) {
    return {
      deviceType: 'desktop',
      osName: 'Diğer',
      osVersion: null,
      browserName: 'Diğer',
      browserVersion: null
    };
  }

  // Device type detection
  let deviceType: DeviceType = 'desktop';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (
    /mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i.test(ua)
  ) {
    deviceType = 'mobile';
  }

  // OS detection (iOS/iPadOS before macOS since iOS UAs also mention Mac OS X)
  let osName = 'Diğer';
  let osVersion: string | null = null;
  const iosMatch = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+[_\d]*)/i);
  if (iosMatch || /iphone|ipad|ipod/i.test(ua)) {
    osName = /ipad/i.test(ua) ? 'iPadOS' : 'iOS';
    osVersion = iosMatch?.[1] ? iosMatch[1].replace(/_/g, '.') : null;
  } else if (/android/i.test(ua)) {
    osName = 'Android';
    const m = ua.match(/Android\s+([\d.]+)/i);
    osVersion = m?.[1] ?? null;
  } else if (/windows nt/i.test(ua)) {
    osName = 'Windows';
    const ntMatch = ua.match(/Windows NT\s+([\d.]+)/i);
    if (ntMatch?.[1] === '10.0') osVersion = '10/11';
    else if (ntMatch?.[1]) osVersion = ntMatch[1];
  } else if (/mac os x|macintosh/i.test(ua)) {
    osName = 'macOS';
    const m = ua.match(/Mac OS X\s+([\d_]+)/i);
    osVersion = m?.[1] ? m[1].replace(/_/g, '.') : null;
  } else if (/cros/i.test(ua)) {
    osName = 'ChromeOS';
  } else if (/linux/i.test(ua)) {
    osName = 'Linux';
  }

  // Browser detection (specific tokens before generic Chrome/Safari)
  let browserName = 'Diğer';
  let browserVersion: string | null = null;

  const setBrowser = (name: string, regex?: RegExp) => {
    browserName = name;
    if (regex) {
      const m = ua.match(regex);
      browserVersion = m?.[1] ? m[1].split('.').slice(0, 2).join('.') : null;
    }
  };

  if (/Instagram/i.test(ua)) {
    setBrowser('Instagram İçi', /Instagram\s+([\d.]+)/i);
  } else if (/FBAN|FBAV/i.test(ua)) {
    setBrowser('Facebook İçi', /FBAV\/([\d.]+)/i);
  } else if (/BytedanceWebview|TikTok/i.test(ua)) {
    setBrowser('TikTok İçi');
  } else if (/EdgA?|EdgiOS/i.test(ua)) {
    setBrowser('Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/i);
  } else if (/OPR\/|Opera|OPT\//i.test(ua)) {
    setBrowser('Opera', /(?:OPR|OPT)\/([\d.]+)/i);
  } else if (/SamsungBrowser/i.test(ua)) {
    setBrowser('Samsung Internet', /SamsungBrowser\/([\d.]+)/i);
  } else if (/YaBrowser/i.test(ua)) {
    setBrowser('Yandex', /YaBrowser\/([\d.]+)/i);
  } else if (/Brave/i.test(ua)) {
    setBrowser('Brave');
  } else if (/Firefox|FxiOS/i.test(ua)) {
    setBrowser('Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/i);
  } else if (/CriOS/i.test(ua)) {
    setBrowser('Chrome (iOS)', /CriOS\/([\d.]+)/i);
  } else if (/Chrome|Chromium/i.test(ua)) {
    setBrowser('Chrome', /Chrome\/([\d.]+)/i);
  } else if (/Safari/i.test(ua)) {
    setBrowser('Safari', /Version\/([\d.]+)/i);
  }

  return { deviceType, osName, osVersion, browserName, browserVersion };
}

export function classifyReferrer(
  referrerUrl: string | null | undefined,
  utmSource: string | null | undefined,
  utmMedium?: string | null | undefined
): { referrerHost: string; sourceCategory: SourceCategory; cleanReferrerUrl: string | null } {
  let cleanReferrerUrl: string | null = null;
  let host = 'direct';

  if (referrerUrl && referrerUrl.trim()) {
    try {
      const parsed = new URL(referrerUrl.trim());
      const normalizedHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (normalizedHost && !DEFAULT_OWN_HOSTS.has(normalizedHost) && !DEFAULT_OWN_HOSTS.has(parsed.hostname.toLowerCase())) {
        host = normalizedHost.slice(0, 128);
        cleanReferrerUrl = parsed.toString().slice(0, 500);
      }
    } catch {
      // Ignore malformed referrer strings
    }
  }

  const normalizedUtm = utmSource?.trim().toLowerCase() ?? '';
  const normalizedMedium = utmMedium?.trim().toLowerCase() ?? '';

  if (normalizedUtm || normalizedMedium) {
    if (
      SOCIAL_HOSTS.some((s) => normalizedUtm.includes(s.split('.')[0] ?? s)) ||
      normalizedMedium === 'social'
    ) {
      return {
        referrerHost: host === 'direct' ? normalizedUtm.slice(0, 128) || 'campaign' : host,
        sourceCategory: 'social',
        cleanReferrerUrl
      };
    }
    return {
      referrerHost: host === 'direct' ? normalizedUtm.slice(0, 128) || 'campaign' : host,
      sourceCategory: 'campaign',
      cleanReferrerUrl
    };
  }

  if (host === 'direct') {
    return { referrerHost: 'direct', sourceCategory: 'direct', cleanReferrerUrl: null };
  }

  if (SEARCH_HOSTS.some((pattern) => host === pattern || host.includes(pattern))) {
    return { referrerHost: host, sourceCategory: 'search', cleanReferrerUrl };
  }

  if (SOCIAL_HOSTS.some((pattern) => host === pattern || host.endsWith(`.${pattern}`))) {
    return { referrerHost: host, sourceCategory: 'social', cleanReferrerUrl };
  }

  return { referrerHost: host, sourceCategory: 'referral', cleanReferrerUrl };
}

export function repairUtf8Mojibake(value: string): string {
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) {
      return value;
    }
  }
  const bytes = Buffer.from(value, 'latin1');
  const decoded = bytes.toString('utf8');
  if (decoded.includes('\uFFFD')) return value;
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return value;
  return decoded;
}

function repairNullableGeoText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const repaired = repairUtf8Mojibake(trimmed).trim();
  return repaired || null;
}

function readHeaderString(headers: IncomingHttpHeaders, name: string): string | null {
  const val = headers[name];
  const raw = Array.isArray(val) ? val[0] : val;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  return repairUtf8Mojibake(decoded).trim() || null;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (!clean || clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  if (clean.startsWith('10.') || clean.startsWith('192.168.')) return true;
  const m172 = clean.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) return true;
  return false;
}

export function extractRequestGeoAndVisitor(
  headers: IncomingHttpHeaders,
  remoteIp: string | undefined,
  clientTimezone?: string | null
): {
  visitorHash: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  continent: string | null;
  timezone: string | null;
} {
  const cfIp = readHeaderString(headers, 'cf-connecting-ip');
  const forwarded = readHeaderString(headers, 'x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const clientIp = cfIp || forwarded || remoteIp || '0.0.0.0';
  const ua = readHeaderString(headers, 'user-agent') ?? '';
  const salt = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'gyrogon-analytics-salt';
  const visitorHash = crypto
    .createHash('sha256')
    .update(`${salt}|${clientIp}|${ua}`)
    .digest('hex')
    .slice(0, 32);

  const cfCountryRaw = readHeaderString(headers, 'cf-ipcountry')?.toUpperCase() ?? null;
  const cfCity = readHeaderString(headers, 'cf-ipcity');
  const cfRegion = readHeaderString(headers, 'cf-region');
  const cfContinent = readHeaderString(headers, 'cf-ipcontinent')?.toUpperCase() ?? null;
  const cfTimezone = readHeaderString(headers, 'cf-timezone');

  let countryCode = 'UNKNOWN';
  let city = cfCity ? cfCity.slice(0, 120) : null;
  let region = cfRegion ? cfRegion.slice(0, 120) : null;
  let continent = cfContinent ? cfContinent.slice(0, 16) : null;

  if (cfCountryRaw && cfCountryRaw !== 'XX' && cfCountryRaw !== 'T1') {
    countryCode = cfCountryRaw.slice(0, 16);
  } else if (cfCountryRaw === 'T1') {
    countryCode = 'TOR';
  } else if (isPrivateOrLocalIp(clientIp)) {
    countryCode = 'LOCAL';
    city = city ?? 'Yerel (localhost)';
    region = region ?? 'Geliştirme';
    continent = continent ?? 'LOCAL';
  }

  const timezone = (cfTimezone || clientTimezone || null)?.slice(0, 64) ?? null;
  return { visitorHash, countryCode, region, city, continent, timezone };
}

export function resolveAnalyticsWindow(
  range: AnalyticsRange,
  now = new Date()
): { from: Date | null; to: Date } {
  const to = new Date(now);
  if (range === 'all') {
    return { from: null, to };
  }
  const from = new Date(now);
  if (range === '24h') {
    from.setTime(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === '7d') {
    from.setUTCDate(from.getUTCDate() - 6);
    from.setUTCHours(0, 0, 0, 0);
  } else if (range === '30d') {
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);
  } else if (range === '90d') {
    from.setUTCDate(from.getUTCDate() - 89);
    from.setUTCHours(0, 0, 0, 0);
  }
  return { from, to };
}

function toPct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function avgRounded(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(sum / count);
}

function getIstanbulParts(iso: string): { dateKey: string; hour: number; hourBucket: string } {
  const ms = new Date(iso).getTime();
  const shifted = new Date((Number.isFinite(ms) ? ms : Date.now()) + ISTANBUL_OFFSET_MS);
  const dateKey = shifted.toISOString().slice(0, 10);
  const hour = shifted.getUTCHours();
  const hourBucket = `${dateKey}T${String(hour).padStart(2, '0')}`;
  return { dateKey, hour, hourBucket };
}

function buildSimpleStats(
  visits: StoredSiteVisit[],
  extract: (v: StoredSiteVisit) => string | null | undefined,
  limit = 15,
  fallback = 'Belirtilmemiş'
): AnalyticsSimpleCountStat[] {
  const map = new Map<string, { visitors: Set<string>; visits: number; totalPlaySec: number }>();
  for (const v of visits) {
    const raw = extract(v)?.trim();
    const key = raw && raw.length > 0 ? raw : fallback;
    let entry = map.get(key);
    if (!entry) {
      entry = { visitors: new Set(), visits: 0, totalPlaySec: 0 };
      map.set(key, entry);
    }
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalPlaySec += v.playDurationSec;
  }

  const total = visits.length;
  return Array.from(map.entries())
    .map(([name, entry]) => ({
      name,
      visits: entry.visits,
      uniqueVisitors: entry.visitors.size,
      totalPlaySec: entry.totalPlaySec,
      avgPlaySec: avgRounded(entry.totalPlaySec, entry.visits),
      sharePercent: toPct(entry.visits, total)
    }))
    .sort((a, b) => b.visits - a.visits || b.totalPlaySec - a.totalPlaySec)
    .slice(0, limit);
}

export function aggregateVisitsReport(
  allRangeVisits: StoredSiteVisit[],
  filteredVisits: StoredSiteVisit[],
  query: AdminAnalyticsQuery,
  now = new Date()
): AdminAnalyticsReport {
  const nowMs = now.getTime();
  const liveVisitorsSet = new Set<string>();
  const livePlayingSet = new Set<string>();

  for (const v of filteredVisits) {
    const seenMs = new Date(v.lastSeenAt).getTime();
    if (Number.isFinite(seenMs) && nowMs - seenMs <= LIVE_THRESHOLD_MS) {
      liveVisitorsSet.add(v.visitorHash);
      if (v.isPlayingNow) {
        livePlayingSet.add(v.visitorHash);
      }
    }
  }

  const availableCountries = Array.from(new Set(allRangeVisits.map((v) => v.countryCode))).sort();

  const uniqueVisitorSet = new Set<string>();
  let returningVisitors = 0;
  let newVisitors = 0;
  let registeredVisitsCount = 0;
  let totalSiteDurationSec = 0;
  let totalPlayDurationSec = 0;
  let visitsWithGameplay = 0;
  let bounceCount = 0;
  let totalGamesStarted = 0;
  let totalGamesCompleted = 0;

  for (const v of filteredVisits) {
    uniqueVisitorSet.add(v.visitorHash);
    if (v.isReturning) returningVisitors += 1;
    else newVisitors += 1;
    if (v.userId) registeredVisitsCount += 1;

    totalSiteDurationSec += v.siteDurationSec;
    totalPlayDurationSec += v.playDurationSec;
    totalGamesStarted += v.gamesStarted;
    totalGamesCompleted += v.gamesCompleted;

    const didPlay = v.playDurationSec > 0 || v.gamesStarted > 0;
    if (didPlay) {
      visitsWithGameplay += 1;
    } else if (v.siteDurationSec < 15) {
      bounceCount += 1;
    }
  }

  const totalVisits = filteredVisits.length;
  const uniqueVisitors = uniqueVisitorSet.size;

  // Timeline (hourly for 24h in TR timezone, daily otherwise)
  const timeline: AnalyticsTimelinePoint[] = [];
  if (query.range === '24h') {
    const bucketMap = new Map<
      string,
      { visits: number; visitors: Set<string>; totalSiteSec: number; totalPlaySec: number; gamesStarted: number }
    >();
    const orderedKeys: Array<{ key: string; label: string }> = [];
    for (let i = 23; i >= 0; i--) {
      const pointMs = nowMs - i * 60 * 60 * 1000;
      const parts = getIstanbulParts(new Date(pointMs).toISOString());
      if (!bucketMap.has(parts.hourBucket)) {
        bucketMap.set(parts.hourBucket, {
          visits: 0,
          visitors: new Set(),
          totalSiteSec: 0,
          totalPlaySec: 0,
          gamesStarted: 0
        });
        orderedKeys.push({
          key: parts.hourBucket,
          label: `${String(parts.hour).padStart(2, '0')}:00`
        });
      }
    }
    for (const v of filteredVisits) {
      const { hourBucket } = getIstanbulParts(v.startedAt);
      const entry = bucketMap.get(hourBucket);
      if (entry) {
        entry.visits += 1;
        entry.visitors.add(v.visitorHash);
        entry.totalSiteSec += v.siteDurationSec;
        entry.totalPlaySec += v.playDurationSec;
        entry.gamesStarted += v.gamesStarted;
      }
    }
    for (const item of orderedKeys) {
      const entry = bucketMap.get(item.key)!;
      timeline.push({
        bucket: item.key,
        label: item.label,
        visits: entry.visits,
        uniqueVisitors: entry.visitors.size,
        totalSiteSec: entry.totalSiteSec,
        totalPlaySec: entry.totalPlaySec,
        gamesStarted: entry.gamesStarted
      });
    }
  } else {
    const spanDays =
      query.range === '7d'
        ? 7
        : query.range === '30d'
          ? 30
          : query.range === '90d'
            ? 90
            : Math.min(
                90,
                Math.max(
                  14,
                  filteredVisits.length > 0
                    ? Math.ceil(
                        (nowMs -
                          Math.min(
                            ...filteredVisits.map((v) => new Date(v.startedAt).getTime())
                          )) /
                          86400000
                      ) + 1
                    : 14
                )
              );

    const bucketMap = new Map<
      string,
      { visits: number; visitors: Set<string>; totalSiteSec: number; totalPlaySec: number; gamesStarted: number }
    >();
    const orderedDays: string[] = [];
    const todayTr = getIstanbulParts(now.toISOString()).dateKey;
    const baseDate = new Date(`${todayTr}T00:00:00.000Z`);
    for (let i = spanDays - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setUTCDate(baseDate.getUTCDate() - i);
      const key = getUtcDateString(d);
      orderedDays.push(key);
      bucketMap.set(key, {
        visits: 0,
        visitors: new Set(),
        totalSiteSec: 0,
        totalPlaySec: 0,
        gamesStarted: 0
      });
    }
    for (const v of filteredVisits) {
      const { dateKey } = getIstanbulParts(v.startedAt);
      const entry = bucketMap.get(dateKey);
      if (entry) {
        entry.visits += 1;
        entry.visitors.add(v.visitorHash);
        entry.totalSiteSec += v.siteDurationSec;
        entry.totalPlaySec += v.playDurationSec;
        entry.gamesStarted += v.gamesStarted;
      }
    }
    for (const dayKey of orderedDays) {
      const entry = bucketMap.get(dayKey)!;
      timeline.push({
        bucket: dayKey,
        label: dayKey.slice(5),
        visits: entry.visits,
        uniqueVisitors: entry.visitors.size,
        totalSiteSec: entry.totalSiteSec,
        totalPlaySec: entry.totalPlaySec,
        gamesStarted: entry.gamesStarted
      });
    }
  }

  // 24-Hour Peak Activity (Europe/Istanbul UTC+3)
  const hourlyActivity: AnalyticsHourlyPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}`,
    visits: 0,
    totalPlaySec: 0
  }));
  for (const v of filteredVisits) {
    const { hour } = getIstanbulParts(v.startedAt);
    const slot = hourlyActivity[hour];
    if (slot) {
      slot.visits += 1;
      slot.totalPlaySec += v.playDurationSec;
    }
  }

  // Countries
  const countryMap = new Map<
    string,
    {
      visitors: Set<string>;
      visits: number;
      totalSiteSec: number;
      totalPlaySec: number;
      gamesStarted: number;
    }
  >();
  for (const v of filteredVisits) {
    let entry = countryMap.get(v.countryCode);
    if (!entry) {
      entry = { visitors: new Set(), visits: 0, totalSiteSec: 0, totalPlaySec: 0, gamesStarted: 0 };
      countryMap.set(v.countryCode, entry);
    }
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalSiteSec += v.siteDurationSec;
    entry.totalPlaySec += v.playDurationSec;
    entry.gamesStarted += v.gamesStarted;
  }
  const byCountry: AnalyticsCountryStat[] = Array.from(countryMap.entries())
    .map(([countryCode, e]) => ({
      countryCode,
      visits: e.visits,
      uniqueVisitors: e.visitors.size,
      totalSiteSec: e.totalSiteSec,
      totalPlaySec: e.totalPlaySec,
      avgSiteSec: avgRounded(e.totalSiteSec, e.visits),
      avgPlaySec: avgRounded(e.totalPlaySec, e.visits),
      gamesStarted: e.gamesStarted,
      sharePercent: toPct(e.visits, totalVisits)
    }))
    .sort((a, b) => b.visits - a.visits || b.totalPlaySec - a.totalPlaySec)
    .slice(0, 25);

  // Cities
  const cityMap = new Map<
    string,
    {
      countryCode: string;
      city: string;
      region: string | null;
      visitors: Set<string>;
      visits: number;
      totalSiteSec: number;
      totalPlaySec: number;
      gamesStarted: number;
    }
  >();
  for (const v of filteredVisits) {
    const repairedCity = repairNullableGeoText(v.city);
    const repairedRegion = repairNullableGeoText(v.region);
    const cityLabel = repairedCity || 'Bilinmeyen Şehir';
    const key = `${v.countryCode}::${cityLabel}`;
    let entry = cityMap.get(key);
    if (!entry) {
      entry = {
        countryCode: v.countryCode,
        city: cityLabel,
        region: repairedRegion,
        visitors: new Set(),
        visits: 0,
        totalSiteSec: 0,
        totalPlaySec: 0,
        gamesStarted: 0
      };
      cityMap.set(key, entry);
    } else if (!entry.region && repairedRegion) {
      entry.region = repairedRegion;
    }
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalSiteSec += v.siteDurationSec;
    entry.totalPlaySec += v.playDurationSec;
    entry.gamesStarted += v.gamesStarted;
  }
  const byCity: AnalyticsCityStat[] = Array.from(cityMap.values())
    .map((e) => ({
      countryCode: e.countryCode,
      city: e.city,
      region: e.region,
      visits: e.visits,
      uniqueVisitors: e.visitors.size,
      totalSiteSec: e.totalSiteSec,
      totalPlaySec: e.totalPlaySec,
      avgPlaySec: avgRounded(e.totalPlaySec, e.visits),
      gamesStarted: e.gamesStarted
    }))
    .sort((a, b) => b.visits - a.visits || b.totalPlaySec - a.totalPlaySec)
    .slice(0, 30);

  // Source Categories
  const sourceOrder: SourceCategory[] = ['direct', 'social', 'search', 'campaign', 'referral'];
  const sourceMap = new Map<
    SourceCategory,
    {
      visitors: Set<string>;
      visits: number;
      totalSiteSec: number;
      totalPlaySec: number;
      withGame: number;
    }
  >();
  for (const cat of sourceOrder) {
    sourceMap.set(cat, {
      visitors: new Set(),
      visits: 0,
      totalSiteSec: 0,
      totalPlaySec: 0,
      withGame: 0
    });
  }
  for (const v of filteredVisits) {
    const entry = sourceMap.get(v.sourceCategory) ?? sourceMap.get('referral')!;
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalSiteSec += v.siteDurationSec;
    entry.totalPlaySec += v.playDurationSec;
    if (v.playDurationSec > 0 || v.gamesStarted > 0) entry.withGame += 1;
  }
  const bySourceCategory: AnalyticsSourceCategoryStat[] = Array.from(sourceMap.entries())
    .filter(([, e]) => e.visits > 0)
    .map(([category, e]) => ({
      category,
      visits: e.visits,
      uniqueVisitors: e.visitors.size,
      avgSiteSec: avgRounded(e.totalSiteSec, e.visits),
      avgPlaySec: avgRounded(e.totalPlaySec, e.visits),
      playConversionRate: toPct(e.withGame, e.visits),
      sharePercent: toPct(e.visits, totalVisits)
    }))
    .sort((a, b) => b.visits - a.visits);

  // Referrers
  const refMap = new Map<
    string,
    {
      category: SourceCategory;
      visitors: Set<string>;
      visits: number;
      totalSiteSec: number;
      totalPlaySec: number;
      gamesStarted: number;
    }
  >();
  for (const v of filteredVisits) {
    const host = v.referrerHost || 'direct';
    let entry = refMap.get(host);
    if (!entry) {
      entry = {
        category: v.sourceCategory,
        visitors: new Set(),
        visits: 0,
        totalSiteSec: 0,
        totalPlaySec: 0,
        gamesStarted: 0
      };
      refMap.set(host, entry);
    }
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalSiteSec += v.siteDurationSec;
    entry.totalPlaySec += v.playDurationSec;
    entry.gamesStarted += v.gamesStarted;
  }
  const byReferrer: AnalyticsReferrerStat[] = Array.from(refMap.entries())
    .map(([host, e]) => ({
      host,
      category: e.category,
      visits: e.visits,
      uniqueVisitors: e.visitors.size,
      avgSiteSec: avgRounded(e.totalSiteSec, e.visits),
      avgPlaySec: avgRounded(e.totalPlaySec, e.visits),
      gamesStarted: e.gamesStarted
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);

  // UTM Campaigns
  const utmMap = new Map<
    string,
    {
      utmSource: string;
      utmMedium: string | null;
      utmCampaign: string | null;
      visitors: Set<string>;
      visits: number;
      withGame: number;
      totalPlaySec: number;
    }
  >();
  for (const v of filteredVisits) {
    if (!v.utmSource && !v.utmMedium && !v.utmCampaign) continue;
    const src = v.utmSource || 'belirsiz';
    const med = v.utmMedium || null;
    const camp = v.utmCampaign || null;
    const key = `${src}|${med ?? ''}|${camp ?? ''}`;
    let entry = utmMap.get(key);
    if (!entry) {
      entry = {
        utmSource: src,
        utmMedium: med,
        utmCampaign: camp,
        visitors: new Set(),
        visits: 0,
        withGame: 0,
        totalPlaySec: 0
      };
      utmMap.set(key, entry);
    }
    entry.visits += 1;
    entry.visitors.add(v.visitorHash);
    entry.totalPlaySec += v.playDurationSec;
    if (v.playDurationSec > 0 || v.gamesStarted > 0) entry.withGame += 1;
  }
  const byUtmCampaign: AnalyticsCampaignStat[] = Array.from(utmMap.values())
    .map((e) => ({
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      visits: e.visits,
      uniqueVisitors: e.visitors.size,
      playConversionRate: toPct(e.withGame, e.visits),
      avgPlaySec: avgRounded(e.totalPlaySec, e.visits)
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 15);

  // Duration histograms
  const siteBucketDefs = [
    { label: '< 15 sn', test: (s: number) => s < 15 },
    { label: '15–60 sn', test: (s: number) => s >= 15 && s < 60 },
    { label: '1–3 dk', test: (s: number) => s >= 60 && s < 180 },
    { label: '3–10 dk', test: (s: number) => s >= 180 && s < 600 },
    { label: '10–30 dk', test: (s: number) => s >= 600 && s < 1800 },
    { label: '30+ dk', test: (s: number) => s >= 1800 }
  ];
  const siteDurationBuckets: AnalyticsBucketStat[] = siteBucketDefs.map((b) => {
    const count = filteredVisits.filter((v) => b.test(v.siteDurationSec)).length;
    return { label: b.label, visits: count, sharePercent: toPct(count, totalVisits) };
  });

  const playBucketDefs = [
    { label: 'Oynamadı', test: (s: number) => s <= 0 },
    { label: '< 1 dk', test: (s: number) => s > 0 && s < 60 },
    { label: '1–3 dk', test: (s: number) => s >= 60 && s < 180 },
    { label: '3–10 dk', test: (s: number) => s >= 180 && s < 600 },
    { label: '10–30 dk', test: (s: number) => s >= 600 && s < 1800 },
    { label: '30+ dk', test: (s: number) => s >= 1800 }
  ];
  const playDurationBuckets: AnalyticsBucketStat[] = playBucketDefs.map((b) => {
    const count = filteredVisits.filter((v) => b.test(v.playDurationSec)).length;
    return { label: b.label, visits: count, sharePercent: toPct(count, totalVisits) };
  });

  const sortedRecent = [...filteredVisits]
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 60)
    .map((v) => toRecentVisit(v, nowMs));

  return {
    range: query.range,
    generatedAt: now.toISOString(),
    liveThresholdSec: LIVE_THRESHOLD_SEC,
    availableCountries,
    summary: {
      liveVisitors: liveVisitorsSet.size,
      livePlayingNow: livePlayingSet.size,
      totalVisits,
      uniqueVisitors,
      newVisitors,
      returningVisitors,
      returningRate: toPct(returningVisitors, totalVisits),
      registeredVisitsCount,
      totalSiteDurationSec,
      avgSiteDurationSec: avgRounded(totalSiteDurationSec, totalVisits),
      totalPlayDurationSec,
      avgPlayDurationSec: avgRounded(totalPlayDurationSec, totalVisits),
      avgPlayDurationAmongPlayersSec: avgRounded(totalPlayDurationSec, visitsWithGameplay),
      playSharePercent: toPct(totalPlayDurationSec, totalSiteDurationSec),
      visitsWithGameplay,
      playConversionRate: toPct(visitsWithGameplay, totalVisits),
      bounceCount,
      bounceRate: toPct(bounceCount, totalVisits),
      totalGamesStarted,
      totalGamesCompleted,
      completionRate: toPct(totalGamesCompleted, totalGamesStarted)
    },
    timeline,
    hourlyActivity,
    byCountry,
    byCity,
    bySourceCategory,
    byReferrer,
    byUtmCampaign,
    byLandingPath: buildSimpleStats(filteredVisits, (v) => v.landingPath, 10, '/'),
    byBrowser: buildSimpleStats(filteredVisits, (v) => v.browserName, 12),
    byOs: buildSimpleStats(filteredVisits, (v) => v.osName, 10),
    byDeviceType: buildSimpleStats(filteredVisits, (v) => v.deviceType, 5),
    byAppMode: buildSimpleStats(filteredVisits, (v) => v.appMode, 5),
    byScreenResolution: buildSimpleStats(
      filteredVisits,
      (v) => (v.screenWidth && v.screenHeight ? `${v.screenWidth}x${v.screenHeight}` : null),
      10
    ),
    byLanguage: buildSimpleStats(filteredVisits, (v) => v.language?.split('-')[0]?.toUpperCase(), 10),
    byConnection: buildSimpleStats(filteredVisits, (v) => v.connectionType?.toUpperCase(), 8),
    byLayout: buildSimpleStats(filteredVisits, (v) => v.lastLayout, 5, 'Oynamadı'),
    byMode: buildSimpleStats(filteredVisits, (v) => v.lastMode, 5, 'Oynamadı'),
    siteDurationBuckets,
    playDurationBuckets,
    recentVisits: sortedRecent
  };
}

export function toRecentVisit(v: StoredSiteVisit, nowMs = Date.now()): AnalyticsRecentVisit {
  const seenMs = new Date(v.lastSeenAt).getTime();
  const isLive = Number.isFinite(seenMs) && nowMs - seenMs <= LIVE_THRESHOLD_MS;
  return {
    id: v.id,
    userId: v.userId,
    playerName: v.playerName ?? null,
    playerEmail: v.playerEmail ?? null,
    isReturning: v.isReturning,
    isLive,
    isPlayingNow: isLive && v.isPlayingNow,
    countryCode: v.countryCode,
    city: repairNullableGeoText(v.city),
    region: repairNullableGeoText(v.region),
    timezone: v.timezone,
    language: v.language,
    sourceCategory: v.sourceCategory,
    referrerHost: v.referrerHost,
    utmSource: v.utmSource,
    utmCampaign: v.utmCampaign,
    landingPath: v.landingPath,
    deviceType: v.deviceType,
    osName: v.osName,
    osVersion: v.osVersion,
    browserName: v.browserName,
    browserVersion: v.browserVersion,
    appMode: v.appMode,
    screenWidth: v.screenWidth,
    screenHeight: v.screenHeight,
    connectionType: v.connectionType,
    siteDurationSec: v.siteDurationSec,
    playDurationSec: v.playDurationSec,
    gamesStarted: v.gamesStarted,
    gamesCompleted: v.gamesCompleted,
    bestScore: v.bestScore,
    lastMode: v.lastMode,
    lastSides: v.lastSides,
    lastLayout: v.lastLayout,
    startedAt: v.startedAt,
    lastSeenAt: v.lastSeenAt
  };
}

export function buildPlayerVisitSummary(visits: StoredSiteVisit[]): PlayerVisitSummary {
  const sorted = [...visits].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  const latest = sorted[0];
  let totalSiteDurationSec = 0;
  let totalPlayDurationSec = 0;
  for (const v of sorted) {
    totalSiteDurationSec += v.siteDurationSec;
    totalPlayDurationSec += v.playDurationSec;
  }

  return {
    totalVisits: sorted.length,
    totalSiteDurationSec,
    totalPlayDurationSec,
    lastSeenAt: latest?.lastSeenAt ?? null,
    lastCountryCode: latest?.countryCode ?? null,
    lastCity: repairNullableGeoText(latest?.city),
    lastRegion: repairNullableGeoText(latest?.region),
    lastBrowser: latest
      ? `${latest.browserName}${latest.browserVersion ? ` ${latest.browserVersion}` : ''}`
      : null,
    lastOs: latest ? `${latest.osName}${latest.osVersion ? ` ${latest.osVersion}` : ''}` : null,
    lastDeviceType: latest?.deviceType ?? null,
    lastAppMode: latest?.appMode ?? null,
    lastReferrerHost: latest?.referrerHost ?? null,
    lastSourceCategory: latest?.sourceCategory ?? null,
    recentVisits: sorted.slice(0, 10).map((v) => toRecentVisit(v))
  };
}
