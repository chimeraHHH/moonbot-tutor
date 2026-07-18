import { describe, expect, it } from 'vitest';
import {
  getSafeReturnPath,
  normalizeDisplayName,
  normalizeLoginIdentifier,
  validateDisplayName,
  validatePassword,
} from '@/lib/auth/validation';

describe('auth validation', () => {
  it('normalizes email and mainland mobile identifiers', () => {
    expect(normalizeLoginIdentifier(' User@Example.COM ')).toMatchObject({
      value: 'user@example.com',
      type: 'email',
    });
    expect(normalizeLoginIdentifier('138 0013 8000')).toMatchObject({
      value: '+8613800138000',
      type: 'phone',
    });
    expect(normalizeLoginIdentifier('+86 138-0013-8000')).toMatchObject({
      value: '+8613800138000',
      type: 'phone',
    });
  });

  it('rejects malformed identifiers and bounded user fields', () => {
    expect(normalizeLoginIdentifier('not-an-account')).toBeNull();
    expect(normalizeLoginIdentifier('12800138000')).toBeNull();
    expect(validateDisplayName('')).toBeTruthy();
    expect(validatePassword('short')).toBeTruthy();
    expect(validatePassword('x'.repeat(129))).toBeTruthy();
    expect(normalizeDisplayName('  星   燧  ')).toBe('星 燧');
  });

  it('accepts only same-origin relative return paths', () => {
    expect(getSafeReturnPath('/student?preset=stars')).toBe('/student?preset=stars');
    expect(getSafeReturnPath('//evil.example')).toBe('/student');
    expect(getSafeReturnPath('/\\evil.example')).toBe('/student');
    expect(getSafeReturnPath('https://evil.example')).toBe('/student');
  });
});
