import { GameMode, PolygonSides } from '@gyrogon/game-core';
import { isAdminPathname } from '../admin/adminRoute';
import { apiUrl, getAccessToken, getDeviceId } from './api';

const VISIT_TOKEN_KEY = 'gyrogon_visit_token_v1';
const VISIT_COUNTERS_KEY = 'gyrogon_visit_counters_v1';
const SEEN_BEFORE_KEY = 'gyrogon_seen_before_v1';
const VISIT_RETURNING_KEY = 'gyrogon_visit_returning_v1';
const HEARTBEAT_INTERVAL_MS = 20_000;

export interface GameMetaSnapshot {
  mode?: GameMode;
  sides?: PolygonSides;
  layout?: string;
}

interface PersistedCounters {
  token: string;
  siteMs: number;
  playMs: number;
  gamesStarted: number;
  gamesCompleted: number;
  bestScore: number;
}

function generateVisitToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function detectAppMode(): 'browser' | 'pwa' | 'native' {
  try {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return 'native';
    }
    const navStandalone = (navigator as { standalone?: boolean }).standalone === true;
    const displayStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (navStandalone || displayStandalone) {
      return 'pwa';
    }
  } catch {
    // ignore
  }
  return 'browser';
}

class AnalyticsTracker {
  private started = false;
  private visitToken = '';
  private siteMs = 0;
  private playMs = 0;
  private gamesStarted = 0;
  private gamesCompleted = 0;
  private bestScore = 0;
  private isPlayingNow = false;
  private lastMode: string | null = null;
  private lastSides: number | null = null;
  private lastLayout: string | null = null;
  private lastTickAt = 0;
  private lastSentAt = 0;
  private lastSavedAt = 0;
  private tickTimer: number | null = null;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    if (isAdminPathname(window.location.pathname)) return;
    this.started = true;

    const { token, isReturning } = this.initVisitSession();
    this.visitToken = token;
    this.lastTickAt = Date.now();
    this.lastSentAt = Date.now();

    void this.sendVisit(isReturning);

    this.tickTimer = window.setInterval(() => {
      this.onTick();
    }, 1000);

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private initVisitSession(): { token: string; isReturning: boolean } {
    let token = '';
    let isReturning = false;

    try {
      const existingToken = sessionStorage.getItem(VISIT_TOKEN_KEY);
      if (existingToken && existingToken.length >= 8) {
        token = existingToken;
        isReturning = sessionStorage.getItem(VISIT_RETURNING_KEY) === '1';

        const savedRaw = sessionStorage.getItem(VISIT_COUNTERS_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw) as Partial<PersistedCounters>;
          if (parsed.token === token) {
            this.siteMs = Math.max(0, Number(parsed.siteMs) || 0);
            this.playMs = Math.max(0, Number(parsed.playMs) || 0);
            this.gamesStarted = Math.max(0, Number(parsed.gamesStarted) || 0);
            this.gamesCompleted = Math.max(0, Number(parsed.gamesCompleted) || 0);
            this.bestScore = Math.max(0, Number(parsed.bestScore) || 0);
          }
        }
      } else {
        token = generateVisitToken();
        isReturning = localStorage.getItem(SEEN_BEFORE_KEY) === '1';
        localStorage.setItem(SEEN_BEFORE_KEY, '1');
        sessionStorage.setItem(VISIT_TOKEN_KEY, token);
        sessionStorage.setItem(VISIT_RETURNING_KEY, isReturning ? '1' : '0');
      }
    } catch {
      if (!token) token = generateVisitToken();
    }

    return { token, isReturning };
  }

  private saveCounters(): void {
    if (!this.visitToken) return;
    try {
      const payload: PersistedCounters = {
        token: this.visitToken,
        siteMs: this.siteMs,
        playMs: this.playMs,
        gamesStarted: this.gamesStarted,
        gamesCompleted: this.gamesCompleted,
        bestScore: this.bestScore
      };
      sessionStorage.setItem(VISIT_COUNTERS_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quotas
    }
  }

  private onTick(): void {
    const now = Date.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;

    // Cap single tick delta to avoid counting laptop sleep intervals
    if (document.visibilityState === 'visible' && delta > 0 && delta <= 2500) {
      this.siteMs += delta;
      if (this.isPlayingNow) {
        this.playMs += delta;
      }
      if (now - this.lastSavedAt >= 5000) {
        this.lastSavedAt = now;
        this.saveCounters();
      }
    }

    if (document.visibilityState === 'visible' && now - this.lastSentAt >= HEARTBEAT_INTERVAL_MS) {
      void this.flushHeartbeat(false);
    }
  }

  private handleVisibilityChange = (): void => {
    this.lastTickAt = Date.now();
    if (document.visibilityState === 'hidden') {
      void this.flushHeartbeat(true);
    }
  };

  private handlePageHide = (): void => {
    void this.flushHeartbeat(true);
  };

  setPlaying(playing: boolean, meta?: GameMetaSnapshot): void {
    if (!this.started) return;
    const changed = this.isPlayingNow !== playing;
    this.isPlayingNow = playing;
    if (meta?.mode) this.lastMode = meta.mode;
    if (meta?.sides) this.lastSides = meta.sides;
    if (meta?.layout) this.lastLayout = meta.layout;
    if (changed) {
      void this.flushHeartbeat(false);
    }
  }

  recordGameStart(meta?: GameMetaSnapshot): void {
    if (!this.started) return;
    this.gamesStarted += 1;
    this.isPlayingNow = true;
    if (meta?.mode) this.lastMode = meta.mode;
    if (meta?.sides) this.lastSides = meta.sides;
    if (meta?.layout) this.lastLayout = meta.layout;
    this.saveCounters();
    void this.flushHeartbeat(false);
  }

  recordGameComplete(score: number): void {
    if (!this.started) return;
    this.gamesCompleted += 1;
    this.isPlayingNow = false;
    if (Number.isFinite(score) && score > this.bestScore) {
      this.bestScore = Math.floor(score);
    }
    this.saveCounters();
    void this.flushHeartbeat(false);
  }

  syncIdentity(): void {
    if (!this.started) return;
    void this.flushHeartbeat(false);
  }

  private async sendVisit(isReturning: boolean): Promise<void> {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const navConn = (navigator as { connection?: { effectiveType?: string } }).connection;
      let timezone: string | null = null;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      } catch {
        timezone = null;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-device-id': getDeviceId()
      };
      const accessToken = getAccessToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      await fetch(apiUrl('/api/analytics/visit'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          visitToken: this.visitToken,
          deviceId: getDeviceId(),
          isReturning,
          landingPath: `${window.location.pathname || '/'}`.slice(0, 255),
          referrerUrl: document.referrer ? document.referrer.slice(0, 500) : null,
          utmSource: searchParams.get('utm_source')?.slice(0, 100) || null,
          utmMedium: searchParams.get('utm_medium')?.slice(0, 100) || null,
          utmCampaign: searchParams.get('utm_campaign')?.slice(0, 120) || null,
          timezone,
          language: navigator.language ? navigator.language.slice(0, 32) : null,
          appMode: detectAppMode(),
          screenWidth: window.screen?.width || null,
          screenHeight: window.screen?.height || null,
          viewportWidth: window.innerWidth || null,
          viewportHeight: window.innerHeight || null,
          connectionType: navConn?.effectiveType?.slice(0, 24) || null
        })
      });
    } catch {
      // Non-blocking best-effort analytics
    }
  }

  private async flushHeartbeat(useBeacon: boolean): Promise<void> {
    if (!this.visitToken) return;
    this.lastSentAt = Date.now();
    this.saveCounters();

    const payload = {
      visitToken: this.visitToken,
      deviceId: getDeviceId(),
      siteDurationSec: Math.round(this.siteMs / 1000),
      playDurationSec: Math.round(this.playMs / 1000),
      gamesStarted: this.gamesStarted,
      gamesCompleted: this.gamesCompleted,
      bestScore: this.bestScore,
      isPlayingNow: this.isPlayingNow,
      lastMode: this.lastMode,
      lastSides: this.lastSides,
      lastLayout: this.lastLayout
    };

    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon(apiUrl('/api/analytics/heartbeat'), blob)) {
          return;
        }
      } catch {
        // Fallback to keepalive fetch
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-device-id': getDeviceId()
      };
      const accessToken = getAccessToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      await fetch(apiUrl('/api/analytics/heartbeat'), {
        method: 'POST',
        headers,
        keepalive: useBeacon,
        body: JSON.stringify(payload)
      });
    } catch {
      // Non-blocking best-effort analytics
    }
  }
}

export const analyticsTracker = new AnalyticsTracker();
