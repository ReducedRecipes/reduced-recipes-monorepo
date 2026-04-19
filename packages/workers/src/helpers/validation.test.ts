import { describe, it, expect } from 'vitest';
import { validateName } from './validation';

describe('validateName', () => {
  it('returns trimmed name for a valid string', () => {
    expect(validateName({ name: '  My List  ' })).toBe('My List');
  });

  it('returns null when name is missing', () => {
    expect(validateName({})).toBeNull();
  });

  it('returns null when name is empty string', () => {
    expect(validateName({ name: '' })).toBeNull();
  });

  it('returns null when name is whitespace only', () => {
    expect(validateName({ name: '   ' })).toBeNull();
  });

  it('returns null when name is not a string', () => {
    expect(validateName({ name: 123 })).toBeNull();
  });

  it('returns null when name is undefined', () => {
    expect(validateName({ name: undefined })).toBeNull();
  });
});
