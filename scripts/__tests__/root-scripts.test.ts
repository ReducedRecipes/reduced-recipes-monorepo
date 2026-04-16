import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('root package.json mobile scripts', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
  );

  it('has mobile script delegating to @rr/mobile start', () => {
    expect(pkg.scripts.mobile).toBe('pnpm --filter @rr/mobile start');
  });

  it('has mobile:ios script delegating to @rr/mobile ios', () => {
    expect(pkg.scripts['mobile:ios']).toBe('pnpm --filter @rr/mobile ios');
  });

  it('has mobile:android script delegating to @rr/mobile android', () => {
    expect(pkg.scripts['mobile:android']).toBe('pnpm --filter @rr/mobile android');
  });

  it('has mobile:build script delegating to @rr/mobile build', () => {
    expect(pkg.scripts['mobile:build']).toBe('pnpm --filter @rr/mobile build');
  });

  it('preserves all existing scripts', () => {
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.deploy).toBeDefined();
    expect(pkg.scripts.typecheck).toBe('pnpm -r typecheck');
    expect(pkg.scripts.test).toBe('vitest run');
  });
});
