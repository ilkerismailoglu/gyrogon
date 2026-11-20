import { isNativeApp } from './nativeBridge';

export type RewardedAdPlacement = 'revive' | 'double_daily';

export interface RewardedAdResult {
  completed: boolean;
  provider: 'admob-native' | 'web-demo';
}

interface NativeAdMobPlugin {
  prepareRewardVideoAd?: (opts: { adId: string; ssv?: { userId?: string; customData?: string } }) => Promise<void>;
  showRewardVideoAd?: () => Promise<{ type?: string; amount?: number }>;
}

/**
 * Unified Rewarded Ad bridge:
 * - On iOS/Android Capacitor builds with @capacitor-community/admob installed, uses AdMob with SSV userId.
 * - On Web / local dev, provides a short non-blocking preview flow.
 */
export async function showRewardedAd(
  placement: RewardedAdPlacement,
  userId?: string
): Promise<RewardedAdResult> {
  if (isNativeApp()) {
    const capPlugins = (
      window as unknown as { Capacitor?: { Plugins?: { AdMob?: NativeAdMobPlugin } } }
    ).Capacitor?.Plugins;
    const admob = capPlugins?.AdMob;

    if (admob?.prepareRewardVideoAd && admob?.showRewardVideoAd) {
      const adId =
        placement === 'revive'
          ? (import.meta.env.VITE_ADMOB_REWARDED_REVIVE_ID as string | undefined) ||
            'ca-app-pub-3940256099942544/5224354917' // Google official test rewarded ID
          : (import.meta.env.VITE_ADMOB_REWARDED_DAILY_ID as string | undefined) ||
            'ca-app-pub-3940256099942544/5224354917';
      try {
        await admob.prepareRewardVideoAd({
          adId,
          ssv: { userId, customData: placement }
        });
        await admob.showRewardVideoAd();
        return { completed: true, provider: 'admob-native' };
      } catch {
        return { completed: false, provider: 'admob-native' };
      }
    }
  }

  // Web/PWA demo rewarded flow
  return { completed: true, provider: 'web-demo' };
}
