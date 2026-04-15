import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

const mobileDir = resolve(__dirname, '../..');
const mobileRoot = mobileDir;

function loadJson(filename: string) {
  return JSON.parse(readFileSync(resolve(mobileDir, filename), 'utf8'));
}

describe('app.json', () => {
  const config = loadJson('app.json');
  const expo = config.expo;

  it('has correct app identity', () => {
    expect(expo.name).toBe('ReducedRecipes');
    expect(expo.slug).toBe('reduced-recipes');
    expect(expo.version).toBe('1.0.0');
    expect(expo.scheme).toBe('reducedrecipes');
    expect(expo.orientation).toBe('portrait');
  });

  it('has iOS config with bundleIdentifier and associatedDomains', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.reducedrecipes.app');
    expect(expo.ios.associatedDomains).toContain('applinks:reducedrecipes.com');
  });

  it('has Android config with package and intentFilters', () => {
    expect(expo.android.package).toBe('com.reducedrecipes.app');
    expect(expo.android.intentFilters).toHaveLength(1);
    expect(expo.android.intentFilters[0].data[0].pathPrefix).toBe('/recipe/');
  });

  it('has all required plugins', () => {
    const pluginNames = expo.plugins.map((p: string | [string, unknown]) =>
      Array.isArray(p) ? p[0] : p
    );
    expect(pluginNames).toContain('expo-router');
    expect(pluginNames).toContain('expo-font');
    expect(pluginNames).toContain('expo-sqlite');
    expect(pluginNames).toContain('expo-secure-store');
    expect(pluginNames).toContain('expo-keep-awake');
    expect(pluginNames).toContain('expo-notifications');
    expect(pluginNames).toContain('expo-build-properties');
  });

  it('has expo-notifications with correct color', () => {
    const notifPlugin = expo.plugins.find(
      (p: string | [string, unknown]) => Array.isArray(p) && p[0] === 'expo-notifications'
    );
    expect(notifPlugin[1].color).toBe('#E85D26');
  });

  it('has expo-build-properties with correct targets', () => {
    const buildPlugin = expo.plugins.find(
      (p: string | [string, unknown]) => Array.isArray(p) && p[0] === 'expo-build-properties'
    );
    expect(buildPlugin[1].ios.deploymentTarget).toBe('16.0');
    expect(buildPlugin[1].android.minSdkVersion).toBe(29);
  });

  it('has EAS project ID placeholder', () => {
    expect(expo.extra.eas.projectId).toBe('REPLACE_WITH_EAS_PROJECT_ID');
  });
});

describe('eas.json', () => {
  const config = loadJson('eas.json');

  it('has three build profiles', () => {
    expect(Object.keys(config.build)).toEqual(['development', 'preview', 'production']);
  });

  it('development profile has developmentClient and internal distribution', () => {
    const dev = config.build.development;
    expect(dev.developmentClient).toBe(true);
    expect(dev.distribution).toBe('internal');
    expect(dev.ios.simulator).toBe(true);
    expect(dev.env.EXPO_PUBLIC_API_URL).toBe('http://localhost:8787');
  });

  it('preview profile uses m1-medium and production API', () => {
    const preview = config.build.preview;
    expect(preview.distribution).toBe('internal');
    expect(preview.ios.resourceClass).toBe('m1-medium');
    expect(preview.env.EXPO_PUBLIC_API_URL).toBe('https://api.reducedrecipes.com');
    expect(preview.channel).toBe('preview');
  });

  it('production profile has autoIncrement', () => {
    const prod = config.build.production;
    expect(prod.autoIncrement).toBe(true);
    expect(prod.env.EXPO_PUBLIC_API_URL).toBe('https://api.reducedrecipes.com');
    expect(prod.channel).toBe('production');
  });

  it('has submit config for iOS and Android', () => {
    expect(config.submit.production.ios.appleId).toBe('REPLACE_WITH_APPLE_ID');
    expect(config.submit.production.android.track).toBe('internal');
  });
});

describe('metro.config.js', () => {
  const configPath = path.join(mobileRoot, 'metro.config.js');

  it('exists', () => {
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('references monorepo root two levels up', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain("path.resolve(projectRoot, '../..')");
  });

  it('uses expo/metro-config', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain("require('expo/metro-config')");
  });

  it('wraps with nativewind', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain("require('nativewind/metro')");
    expect(content).toContain('withNativeWind');
  });

  it('sets alias for @rr/shared', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain("'@rr/shared'");
    expect(content).toContain('packages/shared/src/types.ts');
  });

  it('points nativewind input to global.css', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('./src/constants/global.css');
  });
});

describe('tailwind.config.js', () => {
  const configPath = path.join(mobileRoot, 'tailwind.config.js');

  it('exists', () => {
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('includes app and src content paths', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('./app/**/*.{ts,tsx}');
    expect(content).toContain('./src/**/*.{ts,tsx}');
  });

  it('uses nativewind preset', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain("require('nativewind/preset')");
  });

  it('has brand colors', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('#E85D26');
    expect(content).toContain('#1A1A18');
    expect(content).toContain('#FAFAF8');
  });

  it('has font families', () => {
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('Lora_600SemiBold');
    expect(content).toContain('DMSans_400Regular');
  });
});

describe('global.css', () => {
  const cssPath = path.join(mobileRoot, 'src/constants/global.css');

  it('exists', () => {
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  it('has tailwind directives', () => {
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('@tailwind base');
    expect(content).toContain('@tailwind components');
    expect(content).toContain('@tailwind utilities');
  });
});
