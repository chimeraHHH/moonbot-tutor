export type LoginIdentifierType = 'email' | 'phone';

export interface NormalizedLoginIdentifier {
  value: string;
  type: LoginIdentifierType;
  email: string | null;
  phone: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAINLAND_MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const INTERNATIONAL_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 40;

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateDisplayName(value: string): string | null {
  const normalized = normalizeDisplayName(value);
  if (!normalized) return '请输入昵称';
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return `昵称不能超过 ${DISPLAY_NAME_MAX_LENGTH} 个字符`;
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) return '昵称包含无效字符';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符`;
  }
  return null;
}

function normalizePhone(value: string): string | null {
  let compact = value.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;

  if (MAINLAND_MOBILE_PATTERN.test(compact)) return `+86${compact}`;
  if (/^\+86\d{11}$/.test(compact)) {
    const local = compact.slice(3);
    return MAINLAND_MOBILE_PATTERN.test(local) ? compact : null;
  }
  return INTERNATIONAL_PHONE_PATTERN.test(compact) ? compact : null;
}

export function normalizeLoginIdentifier(value: string): NormalizedLoginIdentifier | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254 || CONTROL_CHARACTER_PATTERN.test(trimmed)) return null;

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return null;
    return { value: email, type: 'email', email, phone: null };
  }

  const phone = normalizePhone(trimmed);
  return phone ? { value: phone, type: 'phone', email: null, phone } : null;
}

export function getSafeReturnPath(value: string | null | undefined, fallback = '/student'): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'http://sophos.local');
    if (parsed.origin !== 'http://sophos.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
