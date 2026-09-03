import type { MembershipRole, PlatformRole } from "@prisma/client";
import type { RequestContext } from "../tenant/index.js";

/**
 * Kimliği doğrulanmış kullanıcı. Yalnızca identity bilgisi taşır; tenant
 * bilgisi JWT'den GÜVENİLMEZ, Membership kayıtlarından çözülür.
 */
export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string;
  platformRole: PlatformRole | null;
}

/** Login kimlik bilgileri. */
export interface LoginCredentials {
  email: string;
  password: string;
}

export type SessionPlatform = "WEB" | "IOS" | "ANDROID" | "UNKNOWN";

export interface SessionMetadata {
  deviceName?: string | null;
  platform?: SessionPlatform | null;
}

/**
 * JWT token tipleri. Access token kısa ömürlüdür; refresh token uzun ömürlü
 * oturumu temsil eder ve yalnızca yeni access token üretmek için kullanılır.
 */
export type TokenType = "access" | "refresh";

/** İmzalı JWT payload'ı. sub = userId, jti = token kimliği (revocation). */
export interface TokenPayload {
  sub: string;
  jti: string;
  type: TokenType;
  iat: number;
  exp: number;
  fid?: string;
}

/** Access + refresh token çifti. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Başarılı bir auth işleminin sonucu: kullanıcı + token çifti + RLS için
 * gerekli tenant context. (login, refresh için)
 */
export interface AuthSession {
  user: AuthenticatedUser;
  tokens: AuthTokens;
  tenantContext: RequestContext;
}

/**
 * Access token doğrulama sonucu: yeni token üretilmez; kullanıcı + tenant
 * context döner.
 */
export interface VerifiedSession {
  user: AuthenticatedUser;
  tenantContext: RequestContext;
}

/**
 * Authentication sağlayıcı soyutlaması. JWT / OAuth / session gibi farklı
 * stratejiler bu arayüzü uygulayabilir. Implementasyonlar:
 *  - access + refresh token üretir/doğrular,
 *  - kimlik bilgilerini doğrular (password hash vb.),
 *  - oturum iptalini (logout) destekler.
 */
export interface AuthProvider {
  /** E-posta + parola ile giriş yapar; oturum açar. */
  login(
    credentials: LoginCredentials,
    requestedTenantId?: string | null,
    metadata?: SessionMetadata,
  ): Promise<AuthSession>;

  /** Doğrulanmış başka bir kimlik akışı için kalıcı session başlatır. */
  startSession(
    userId: string,
    requestedTenantId?: string | null,
    metadata?: SessionMetadata,
  ): Promise<AuthSession>;

  /** Access token'ı doğrular; kullanıcı + tenant context üretir. */
  verifyAccessToken(token: string, requestedTenantId?: string | null): Promise<VerifiedSession>;

  /** Refresh token ile yeni access/refresh çifti üretir. */
  refreshSession(refreshToken: string): Promise<AuthTokens>;

  /** Refresh token'ı iptal eder (logout). */
  revokeSession(refreshToken: string): Promise<void>;

  /** Kullanıcının bütün cihaz/session family kayıtlarını iptal eder. */
  revokeAllSessions(userId: string): Promise<number>;

  /** Kullanıcının erişebildiği aktif tenant context listesini döner. */
  listContexts(userId: string): Promise<
    Array<{
      id: string;
      type: string;
      name: string;
      role: MembershipRole;
      isPersonal: boolean;
      active: boolean;
    }>
  >;
}

export type { MembershipRole };
