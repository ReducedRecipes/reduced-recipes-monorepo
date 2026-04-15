import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@rr/shared/extract', replacement: path.resolve(__dirname, 'packages/shared/src/extract') },
      { find: '@rr/shared/robots', replacement: path.resolve(__dirname, 'packages/shared/src/robots') },
      { find: '@rr/shared/sitemap', replacement: path.resolve(__dirname, 'packages/shared/src/sitemap') },
      { find: '@rr/shared/rate-limit', replacement: path.resolve(__dirname, 'packages/shared/src/rate-limit') },
      { find: '@rr/shared/utils', replacement: path.resolve(__dirname, 'packages/shared/src/utils') },
      { find: '@rr/shared', replacement: path.resolve(__dirname, 'packages/shared/src/types') },
      { find: 'react-native-mmkv', replacement: path.resolve(__dirname, 'packages/mobile/src/lib/__mocks__/react-native-mmkv') },
    ],
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'scripts/__tests__/**/*.test.ts',
    ],
    environment: 'jsdom',
  },
});
