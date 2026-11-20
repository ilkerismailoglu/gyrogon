import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gyrogon.game',
  appName: 'GYROGON',
  webDir: 'dist',
  backgroundColor: '#070A12',
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    backgroundColor: '#070A12'
  },
  android: {
    backgroundColor: '#070A12',
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#070A12',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#070A12'
    }
  }
};

export default config;
