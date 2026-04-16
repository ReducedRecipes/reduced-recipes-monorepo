const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.alias = {
  '@rr/shared': path.resolve(monorepoRoot, 'packages/shared/src/types.ts'),
};

// Force single React copy and correct css-interop version
config.resolver.extraNodeModules = {
  react: path.resolve(monorepoRoot, 'node_modules/react'),
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
  'react-native-css-interop': path.resolve(projectRoot, 'node_modules/react-native-css-interop'),
};

module.exports = withNativeWind(config, {
  input: './src/constants/global.css',
});
