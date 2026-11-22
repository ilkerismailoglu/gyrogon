import { registerSW } from 'virtual:pwa-register';
import { isNativeApp } from './nativeBridge';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  isInstalled: boolean;
  canPromptInstall: boolean;
  isIosSafari: boolean;
  offlineReady: boolean;
  needRefresh: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let offlineReady = false;
let needRefresh = false;

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

export function getPwaState(): PwaState {
  return {
    isInstalled: isStandalonePwa(),
    canPromptInstall: deferredPrompt !== null,
    isIosSafari: isIosSafari(),
    offlineReady,
    needRefresh
  };
}

type PwaListener = (state: PwaState) => void;
const listeners = new Set<PwaListener>();

function notify(): void {
  const snapshot = getPwaState();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribePwaState(listener: PwaListener): () => void {
  listeners.add(listener);
  listener(getPwaState());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Registers the PWA Service Worker and captures the browser install prompt.
 */
export function initPwa(): void {
  if (initialized || typeof window === 'undefined' || isNativeApp()) return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
  mediaQuery?.addEventListener?.('change', () => {
    notify();
  });

  if ('serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onOfflineReady() {
        offlineReady = true;
        notify();
      },
      onNeedRefresh() {
        needRefresh = true;
        notify();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    });
  }
}

/**
 * Triggers the native browser PWA install prompt when available.
 */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  notify();

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      notify();
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'dismissed';
  }
}
