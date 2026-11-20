import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export type HapticFeedbackKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatformLabel(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
}

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#070A12' });
  } catch {
    // Some iOS configs ignore backgroundColor
  }
  try {
    await SplashScreen.hide();
  } catch {
    // Ignore if splash screen already hidden
  }
}

export function triggerHaptic(kind: HapticFeedbackKind): void {
  if (isNativeApp()) {
    try {
      switch (kind) {
        case 'light':
          void Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'medium':
          void Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'heavy':
          void Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case 'success':
          void Haptics.notification({ type: NotificationType.Success });
          break;
        case 'warning':
          void Haptics.notification({ type: NotificationType.Warning });
          break;
        case 'error':
          void Haptics.notification({ type: NotificationType.Error });
          break;
      }
      return;
    } catch {
      // fallback to web vibrate
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    const map: Record<HapticFeedbackKind, number | number[]> = {
      light: 8,
      medium: 16,
      heavy: [20, 20, 25],
      success: [12, 24, 16],
      warning: [18, 25, 18],
      error: [40, 30, 60]
    };
    try {
      navigator.vibrate(map[kind]);
    } catch {
      // ignore
    }
  }
}

export function subscribeAppLifecycle(onBackground: () => void): () => void {
  const onVis = () => {
    if (document.hidden) onBackground();
  };
  document.addEventListener('visibilitychange', onVis);

  let capHandle: { remove: () => Promise<void> } | null = null;
  if (isNativeApp()) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) onBackground();
    }).then((h) => {
      capHandle = h;
    });
  }

  return () => {
    document.removeEventListener('visibilitychange', onVis);
    if (capHandle) {
      void capHandle.remove();
    }
  };
}
