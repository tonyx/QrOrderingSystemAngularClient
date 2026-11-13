export type ExternalAuthProvider = 'Google' | 'Facebook';

export interface TokenRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  token?: string;
  Token?: string;
  userId?: string;
  UserId?: string;
  email?: string;
  Email?: string;
  roles?: string[];
  Roles?: string[];
}

export interface CurrentUserResponse {
  userId?: string | null;
  UserId?: string | null;
  email?: string | null;
  Email?: string | null;
  isPlatformAdmin?: boolean;
  IsPlatformAdmin?: boolean;
  userContext?: string | null;
  UserContext?: string | null;
}
