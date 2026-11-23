import { DEFAULT_SIDES, GameMode, PolygonSides } from '@gyrogon/game-core';
import {
  DailyChallengeInfo,
  LeaderboardBoard,
  LeaderboardData,
  PlayerProfileDTO,
  PlayerStatsDTO,
  QuestDTO,
  RecentGameDTO
} from '../services/api';

const ADMIN_TOKEN_KEY = 'gyrogon_admin_token_v1';

export class AdminAuthError extends Error {
  constructor(message = 'Yönetici oturumu geçersiz veya süresi dolmuş.') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export interface AdminDailyPointDTO {
  date: string;
  newUsers: number;
  games: number;
  activePlayers: number;
}

export interface AdminThemeStatDTO {
  code: string;
  name: string;
  price: number;
  unlockedCount: number;
  equippedCount: number;
}

export interface AdminSideOverviewDTO {
  sides: PolygonSides;
  games: number;
  averageScore: number;
  bestScore: number;
  totalBlocksCleared: number;
}

export interface AdminOverviewDTO {
  totalUsers: number;
  registeredUsers: number;
  guestUsers: number;
  bannedUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  activePlayersToday: number;
  activePlayers7d: number;
  totalGames: number;
  classicGames: number;
  dailyGames: number;
  gamesToday: number;
  games7d: number;
  totalSessions: number;
  verifiedSessions: number;
  totalBlocksCleared: number;
  totalScore: number;
  averageScore: number;
  highestScore: number;
  highestScorePlayer: string | null;
  bestCombo: number;
  totalCoinsInCirculation: number;
  totalCoinsEarnedFromGames: number;
  questsCompletedTotal: number;
  paidThemesUnlockedTotal: number;
  dailyTrend: AdminDailyPointDTO[];
  bySides: AdminSideOverviewDTO[];
  themes: AdminThemeStatDTO[];
}

export interface AdminOverviewResponse {
  overview: AdminOverviewDTO;
  dailySeed: DailyChallengeInfo;
  system: {
    store: 'postgres' | 'memory';
    leaderboard: 'redis' | 'memory';
    timestamp: string;
  };
}

export type AdminAuthProviderFilterDTO = 'all' | 'email' | 'google' | 'facebook' | 'apple';

export interface AdminAuthProvidersDTO {
  email: boolean;
  google: boolean;
  facebook: boolean;
  apple: boolean;
}

export interface AdminPlayerSummaryDTO {
  id: string;
  displayName: string;
  email: string | null;
  guestDeviceId: string;
  accountType: 'registered' | 'guest';
  authProviders: AdminAuthProvidersDTO;
  hexaCoins: number;
  streakCount: number;
  highScoreClassic: number;
  highScoreDaily: number;
  bestScore: number;
  equippedTheme: string;
  unlockedThemesCount: number;
  totalGames: number;
  totalBlocksCleared: number;
  bestCombo: number;
  isBanned: boolean;
  isPermanentBan: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  lastLoginDate: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
}

export interface AdminPlayerListParams {
  q?: string;
  accountType?: 'all' | 'registered' | 'guest' | 'banned';
  provider?: AdminAuthProviderFilterDTO;
  sort?: 'newest' | 'best_score' | 'most_games' | 'most_coins' | 'last_active';
  page?: number;
  pageSize?: number;
}

export interface AdminRewardRecordDTO {
  id: string;
  userId: string | null;
  recipientName: string;
  scope: 'single' | 'registered' | 'all';
  coinsAmount: number;
  themeCode: string | null;
  reason: string;
  createdAt: string;
}

export interface AdminGrantRewardInput {
  scope: 'single' | 'registered' | 'all';
  userId?: string;
  coinsAmount?: number;
  themeCode?: string;
  reason?: string;
}

export interface AdminGrantRewardResponse {
  affectedCount: number;
  reward: AdminRewardRecordDTO;
  playerDetail?: AdminPlayerDetailDTO;
}

export interface AdminSettingsDTO {
  passwordSource: 'database' | 'env' | 'dev_default';
  isProduction: boolean;
}

export interface AdminPlayerListResponse {
  items: AdminPlayerSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type AnalyticsRangeDTO = '24h' | '7d' | '30d' | '90d' | 'all';
export type SourceCategoryDTO = 'direct' | 'search' | 'social' | 'campaign' | 'referral';
export type DeviceTypeDTO = 'mobile' | 'tablet' | 'desktop';
export type AppModeDTO = 'browser' | 'pwa' | 'native';

export interface AnalyticsTimelinePointDTO {
  bucket: string;
  label: string;
  visits: number;
  uniqueVisitors: number;
  totalSiteSec: number;
  totalPlaySec: number;
  gamesStarted: number;
}

export interface AnalyticsHourlyPointDTO {
  hour: number;
  label: string;
  visits: number;
  totalPlaySec: number;
}

export interface AnalyticsCountryStatDTO {
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

export interface AnalyticsCityStatDTO {
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

export interface AnalyticsSourceCategoryStatDTO {
  category: SourceCategoryDTO;
  visits: number;
  uniqueVisitors: number;
  avgSiteSec: number;
  avgPlaySec: number;
  playConversionRate: number;
  sharePercent: number;
}

export interface AnalyticsReferrerStatDTO {
  host: string;
  category: SourceCategoryDTO;
  visits: number;
  uniqueVisitors: number;
  avgSiteSec: number;
  avgPlaySec: number;
  gamesStarted: number;
}

export interface AnalyticsCampaignStatDTO {
  utmSource: string;
  utmMedium: string | null;
  utmCampaign: string | null;
  visits: number;
  uniqueVisitors: number;
  playConversionRate: number;
  avgPlaySec: number;
}

export interface AnalyticsSimpleCountStatDTO {
  name: string;
  visits: number;
  uniqueVisitors: number;
  totalPlaySec: number;
  avgPlaySec: number;
  sharePercent: number;
}

export interface AnalyticsBucketStatDTO {
  label: string;
  visits: number;
  sharePercent: number;
}

export interface AnalyticsRecentVisitDTO {
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
  sourceCategory: SourceCategoryDTO;
  referrerHost: string;
  utmSource: string | null;
  utmCampaign: string | null;
  landingPath: string;
  deviceType: DeviceTypeDTO;
  osName: string;
  osVersion: string | null;
  browserName: string;
  browserVersion: string | null;
  appMode: AppModeDTO;
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

export interface AdminAnalyticsReportDTO {
  range: AnalyticsRangeDTO;
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
  timeline: AnalyticsTimelinePointDTO[];
  hourlyActivity: AnalyticsHourlyPointDTO[];
  byCountry: AnalyticsCountryStatDTO[];
  byCity: AnalyticsCityStatDTO[];
  bySourceCategory: AnalyticsSourceCategoryStatDTO[];
  byReferrer: AnalyticsReferrerStatDTO[];
  byUtmCampaign: AnalyticsCampaignStatDTO[];
  byLandingPath: AnalyticsSimpleCountStatDTO[];
  byBrowser: AnalyticsSimpleCountStatDTO[];
  byOs: AnalyticsSimpleCountStatDTO[];
  byDeviceType: AnalyticsSimpleCountStatDTO[];
  byAppMode: AnalyticsSimpleCountStatDTO[];
  byScreenResolution: AnalyticsSimpleCountStatDTO[];
  byLanguage: AnalyticsSimpleCountStatDTO[];
  byConnection: AnalyticsSimpleCountStatDTO[];
  byLayout: AnalyticsSimpleCountStatDTO[];
  byMode: AnalyticsSimpleCountStatDTO[];
  siteDurationBuckets: AnalyticsBucketStatDTO[];
  playDurationBuckets: AnalyticsBucketStatDTO[];
  recentVisits: AnalyticsRecentVisitDTO[];
}

export interface PlayerVisitSummaryDTO {
  totalVisits: number;
  totalSiteDurationSec: number;
  totalPlayDurationSec: number;
  lastSeenAt: string | null;
  lastCountryCode: string | null;
  lastCity: string | null;
  lastRegion: string | null;
  lastBrowser: string | null;
  lastOs: string | null;
  lastDeviceType: DeviceTypeDTO | null;
  lastAppMode: AppModeDTO | null;
  lastReferrerHost: string | null;
  lastSourceCategory: SourceCategoryDTO | null;
  recentVisits: AnalyticsRecentVisitDTO[];
}

export interface AdminAnalyticsQueryParams {
  range?: AnalyticsRangeDTO;
  country?: string;
  deviceType?: 'all' | DeviceTypeDTO;
  source?: 'all' | SourceCategoryDTO;
}

export interface AdminPlayerDetailDTO {
  player: PlayerProfileDTO;
  stats: PlayerStatsDTO;
  quests: QuestDTO[];
  createdAt: string;
  updatedAt: string;
  lastLoginDate: string | null;
  recentGames: RecentGameDTO[];
  visitSummary?: PlayerVisitSummaryDTO;
}

export interface AdminUpdatePlayerInput {
  displayName?: string;
  hexaCoins?: number;
  coinsDelta?: number;
  streakCount?: number;
  unlockThemeCode?: string;
  equippedTheme?: string;
}

export interface AdminScoreItemDTO {
  id: string;
  sessionId: string;
  userId: string | null;
  playerName: string;
  userEmail: string | null;
  mode: GameMode;
  sides: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  moveHash: string;
  createdAt: string;
}

export interface AdminScoreListParams {
  q?: string;
  mode?: 'all' | 'classic' | 'daily';
  sides?: PolygonSides;
  sort?: 'newest' | 'score' | 'blocks' | 'combo';
  page?: number;
  pageSize?: number;
}

export interface AdminScoreListResponse {
  items: AdminScoreItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // ignore storage restrictions
  }
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken());
}

export function adminLogout(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  if (!token) {
    throw new AdminAuthError();
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => null)) as ({ error?: string } & T) | null;

  if (res.status === 401) {
    adminLogout();
    throw new AdminAuthError(data?.error || 'Yönetici oturumu sona erdi.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `İstek başarısız (${res.status})`);
  }

  return data as T;
}

export async function adminLogin(
  password: string
): Promise<{ token: string; expiresIn: number; role: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = (await res.json().catch(() => null)) as
    | { token?: string; expiresIn?: number; role?: string; error?: string }
    | null;

  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Giriş yapılamadı.');
  }

  saveAdminToken(data.token);
  return {
    token: data.token,
    expiresIn: data.expiresIn ?? 43200,
    role: data.role ?? 'admin'
  };
}

export async function fetchAdminOverview(): Promise<AdminOverviewResponse> {
  return adminRequest<AdminOverviewResponse>('/api/admin/overview');
}

export async function fetchAdminPlayers(
  params: AdminPlayerListParams = {}
): Promise<AdminPlayerListResponse> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.accountType && params.accountType !== 'all') qs.set('accountType', params.accountType);
  if (params.provider && params.provider !== 'all') qs.set('provider', params.provider);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const queryStr = qs.toString();
  return adminRequest<AdminPlayerListResponse>(`/api/admin/players${queryStr ? `?${queryStr}` : ''}`);
}

export async function fetchAdminPlayerDetail(userId: string): Promise<AdminPlayerDetailDTO> {
  return adminRequest<AdminPlayerDetailDTO>(`/api/admin/players/${encodeURIComponent(userId)}`);
}

export async function updateAdminPlayer(
  userId: string,
  patch: AdminUpdatePlayerInput
): Promise<AdminPlayerDetailDTO> {
  return adminRequest<AdminPlayerDetailDTO>(`/api/admin/players/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function deleteAdminPlayer(
  userId: string
): Promise<{ deleted: boolean; userId: string }> {
  return adminRequest<{ deleted: boolean; userId: string }>(
    `/api/admin/players/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchAdminScores(
  params: AdminScoreListParams = {}
): Promise<AdminScoreListResponse> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.mode && params.mode !== 'all') qs.set('mode', params.mode);
  if (params.sides) qs.set('sides', String(params.sides));
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const queryStr = qs.toString();
  return adminRequest<AdminScoreListResponse>(`/api/admin/scores${queryStr ? `?${queryStr}` : ''}`);
}

export async function deleteAdminScore(
  scoreId: string
): Promise<{ deleted: boolean; scoreId: string }> {
  return adminRequest<{ deleted: boolean; scoreId: string }>(
    `/api/admin/scores/${encodeURIComponent(scoreId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchAdminLeaderboard(
  board: LeaderboardBoard,
  sides: PolygonSides = DEFAULT_SIDES,
  limit = 50
): Promise<LeaderboardData> {
  const res = await fetch(`/api/leaderboard/${board}?sides=${sides}&limit=${limit}`);
  if (!res.ok) {
    throw new Error('Liderlik tablosu alınamadı.');
  }
  return (await res.json()) as LeaderboardData;
}

export async function banAdminPlayer(
  userId: string,
  input: {
    permanent?: boolean;
    durationHours?: number;
    reason?: string;
    removeFromLeaderboard?: boolean;
  }
): Promise<AdminPlayerDetailDTO> {
  return adminRequest<AdminPlayerDetailDTO>(
    `/api/admin/players/${encodeURIComponent(userId)}/ban`,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
}

export async function unbanAdminPlayer(userId: string): Promise<AdminPlayerDetailDTO> {
  return adminRequest<AdminPlayerDetailDTO>(
    `/api/admin/players/${encodeURIComponent(userId)}/unban`,
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
}

export async function grantAdminReward(
  input: AdminGrantRewardInput
): Promise<AdminGrantRewardResponse> {
  return adminRequest<AdminGrantRewardResponse>('/api/admin/rewards/grant', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function fetchAdminRewards(): Promise<{ items: AdminRewardRecordDTO[] }> {
  return adminRequest<{ items: AdminRewardRecordDTO[] }>('/api/admin/rewards');
}

export async function fetchAdminSettings(): Promise<AdminSettingsDTO> {
  return adminRequest<AdminSettingsDTO>('/api/admin/settings');
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{
  changed: boolean;
  token: string;
  expiresIn: number;
  passwordSource: 'database' | 'env' | 'dev_default';
}> {
  const res = await adminRequest<{
    changed: boolean;
    token: string;
    expiresIn: number;
    passwordSource: 'database' | 'env' | 'dev_default';
  }>('/api/admin/settings/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (res.token) {
    saveAdminToken(res.token);
  }
  return res;
}

export async function fetchAdminAnalytics(
  params: AdminAnalyticsQueryParams = {}
): Promise<AdminAnalyticsReportDTO> {
  const qs = new URLSearchParams();
  if (params.range) qs.set('range', params.range);
  if (params.country && params.country !== 'all') qs.set('country', params.country);
  if (params.deviceType && params.deviceType !== 'all') qs.set('deviceType', params.deviceType);
  if (params.source && params.source !== 'all') qs.set('source', params.source);
  const queryStr = qs.toString();
  return adminRequest<AdminAnalyticsReportDTO>(
    `/api/admin/analytics${queryStr ? `?${queryStr}` : ''}`
  );
}
