import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chessacademy.offline',
  appName: 'Chess Grandmaster Academy',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
