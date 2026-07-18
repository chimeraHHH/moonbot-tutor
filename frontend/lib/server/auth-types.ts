export const USER_ROLES = ['student', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LOGIN_IDENTIFIER_TYPES = ['email', 'phone'] as const;
export type LoginIdentifierType = (typeof LOGIN_IDENTIFIER_TYPES)[number];

export interface AuthUser {
  id: string;
  loginIdentifier: string;
  identifierType: LoginIdentifierType;
  email: string | null;
  phone: string | null;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface SessionClaims {
  sid: string;
  exp: number;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
