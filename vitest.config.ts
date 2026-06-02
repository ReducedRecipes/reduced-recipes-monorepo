import { defineConfig } from 'vitest/config';
import path from 'path';
import { readFileSync } from 'fs';

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);

export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(rootPkg.version),
  },
  resolve: {
    alias: [
      { find: 'cloudflare:workers', replacement: path.resolve(__dirname, 'packages/workers/src/__mocks__/cloudflare-workers') },
      { find: '@rr/shared/extract', replacement: path.resolve(__dirname, 'packages/shared/src/extract') },
      { find: '@rr/shared/robots', replacement: path.resolve(__dirname, 'packages/shared/src/robots') },
      { find: '@rr/shared/sitemap', replacement: path.resolve(__dirname, 'packages/shared/src/sitemap') },
      { find: '@rr/shared/rate-limit', replacement: path.resolve(__dirname, 'packages/shared/src/rate-limit') },
      { find: '@rr/shared/utils', replacement: path.resolve(__dirname, 'packages/shared/src/utils') },
      { find: '@rr/shared/dietary', replacement: path.resolve(__dirname, 'packages/shared/src/dietary') },
      { find: '@rr/shared/env', replacement: path.resolve(__dirname, 'packages/shared/src/env') },
      { find: '@rr/shared/build-query', replacement: path.resolve(__dirname, 'packages/shared/src/build-query') },
      { find: '@rr/shared/unit-normalisation', replacement: path.resolve(__dirname, 'packages/shared/src/unit-normalisation') },
      { find: '@rr/shared/html-decode', replacement: path.resolve(__dirname, 'packages/shared/src/html-decode') },
      { find: '@rr/shared/pantry', replacement: path.resolve(__dirname, 'packages/shared/src/pantry') },
      { find: '@rr/shared', replacement: path.resolve(__dirname, 'packages/shared/src/types') },
      { find: 'react-native-mmkv', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/react-native-mmkv') },
      { find: 'expo-image', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/expo-image') },
      { find: 'expo-web-browser', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/expo-web-browser') },
      { find: 'expo-secure-store', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/expo-secure-store') },
      { find: 'expo-sqlite', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/expo-sqlite') },
      { find: 'expo-router', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/expo-router') },
      { find: '@react-native-async-storage/async-storage', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/async-storage') },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, 'packages/mobile/src/$1') },
    ],
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'apps/*/functions/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.tsx',
      'scripts/__tests__/**/*.test.ts',
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
