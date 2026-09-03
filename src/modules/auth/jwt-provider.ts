import { SignJWT, jwtVerify } from "jose";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { MembershipRole, Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { withTenantContext } from "../tenant/index.js";
import { forbiddenError, unauthorizedError, validationError } from "../../lib/errors.js";
import type {
  AuthProvider,
  AuthSession,
  AuthTokens,
  AuthenticatedUser,
  LoginCredentials,
  SessionMetadata,
  TokenPayload,
  VerifiedSession,
} from "./types.js";
import { ScryptPasswordHasher, type PasswordHasher } from "./password.js";

/**
 * Sistem (auth bootstrap) kimliği. Login'de e-posta ile kullanıcı aranırken
 * RLS user_read policy'si kimliği henüz bilinmeyen bir kullanıcıya e-posta
 * araması vermez; auth servisi bu nedenle yalnızca kendi iç lookup'ında
 * platform rolü kullanır. Sorgular her zaman doğrulanmış kimlikle sınırlıdır.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Hesap varlığını timing ile sızdırmamak için: kullanıcı bulunamadığında veya
 * hash'i olmadığında da scrypt çalıştırılıp aynı süre harcanır. (OWASP auth)
 */
const DUMMY_PASSWORD_HASH =
  "scrypt$8h9Wtk07NeKp7dPR+yUK+Q==$f7ZKHKCHc6jqF4OO2Qqvze884DrHvjXLid4Na5VXok8KA0HQT3jimwtudURmSW6BZSzDWtx6HArUPG9Uck0n0A==";

type AuthUserRow = Pick<
  User,
  "id" | "email" | "displayName" | "passwordHash" | "platformRole" | "status" | "deletedAt"
>;

interface MembershipRow {
  tenantId: string;
  role: MembershipRole;
  tenant: { type: string; name: string; status: string; deletedAt: Date | null };
}

export interface JwtAuthProviderOptions {
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  passwordHasher?: PasswordHasher;
}

/**
 * JWT tabanlı AuthProvider. Credential doğrulama (scrypt), access/refresh
 * token üretimi, tenant context çözümlemesi (Membership) ve oturum iptalini
 * kapsar.
 */
export class JwtAuthProvider implements AuthProvider {
  private readonly secretKey: Uint8Array;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly hasher: PasswordHasher;

  constructor(private readonly options: JwtAuthProviderOptions) {
    this.secretKey = new TextEncoder().encode(options.jwtSecret);
    this.accessTtlSeconds = options.accessTtlSeconds;
    this.refreshTtlSeconds = options.refreshTtlSeconds;
    this.hasher = options.passwordHasher ?? new ScryptPasswordHasher();
  }

  async login(
    credentials: LoginCredentials,
    requestedTenantId?: string | null,
    metadata: SessionMetadata = {},
  ): Promise<AuthSession> {
    const email = credentials.email.trim().toLowerCase();

    const user = await this.bootstrapLookup(async (tx) => {
      return tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          displayName: true,
          passwordHash: true,
          platformRole: true,
          status: true,
          deletedAt: true,
        },
      });
    });

    // Kural 9: kullanıcı hakkında bilgi sızdırmadan genel hata.
    // Hesap varlığını timing ile sızdırmamak için scrypt her durumda çalıştırılır.
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await this.hasher.verify(credentials.password, passwordHash);

    if (
      !user ||
      !user.passwordHash ||
      user.deletedAt !== null ||
      user.status !== "ACTIVE" ||
      !valid
    ) {
      throw unauthorizedError("E-posta veya parola hatalı");
    }

    const tenantContext = await this.resolveTenantContext(user, requestedTenantId);
    const tokens = await this.createPersistedSession(user.id, metadata);

    return { user: this.toPublicUser(user), tokens, tenantContext };
  }

  async startSession(
    userId: string,
    requestedTenantId?: string | null,
    metadata: SessionMetadata = {},
  ): Promise<AuthSession> {
    const user = await this.findActiveUser(userId);
    const tenantContext = await this.resolveTenantContext(user, requestedTenantId);
    const tokens = await this.createPersistedSession(user.id, metadata);
    return { user: this.toPublicUser(user), tokens, tenantContext };
  }

  async verifyAccessToken(
    token: string,
    requestedTenantId?: string | null,
  ): Promise<VerifiedSession> {
    const payload = await this.verifyJwt(token, "access");

    // Kullanıcıyı kendi kimliğiyle oku (user_read: id = app.user_id).
    const user = await this.findActiveUser(payload.sub);
    const tenantContext = await this.resolveTenantContext(user, requestedTenantId);

    return { user: this.toPublicUser(user), tenantContext };
  }

  async refreshSession(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyJwt(refreshToken, "refresh");
    await this.findActiveUser(payload.sub);
    if (!payload.fid) throw unauthorizedError("Oturum geçersiz");

    const presentedHash = this.hashToken(refreshToken);
    const nextSessionId = randomUUID();
    const nextTokens = await this.createTokenPair(payload.sub, payload.fid, nextSessionId);

    const rotated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired
        FROM pg_advisory_xact_lock(hashtextextended(${`auth-session:${payload.jti}`}, 0))
      `;
      const current = await tx.authSession.findUnique({ where: { id: payload.jti } });
      const invalid =
        !current ||
        current.userId !== payload.sub ||
        current.tokenFamilyId !== payload.fid ||
        current.revokedAt !== null ||
        current.expiresAt <= new Date() ||
        !this.hashMatches(presentedHash, current.refreshTokenHash);

      if (invalid) {
        if (current) {
          await tx.authSession.updateMany({
            where: { tokenFamilyId: current.tokenFamilyId, revokedAt: null },
            data: { revokedAt: new Date(), lastUsedAt: new Date() },
          });
        }
        return false;
      }

      await tx.authSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      await tx.authSession.create({
        data: {
          id: nextSessionId,
          userId: current.userId,
          refreshTokenHash: this.hashToken(nextTokens.refreshToken),
          tokenFamilyId: current.tokenFamilyId,
          deviceName: current.deviceName,
          platform: current.platform,
          expiresAt: nextTokens.refreshTokenExpiresAt,
        },
      });
      return true;
    });

    if (!rotated) throw unauthorizedError("Oturum geçersiz");
    return nextTokens;
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const payload = await this.verifyJwt(refreshToken, "refresh");
    if (!payload.fid) throw unauthorizedError("Oturum geçersiz");
    const presentedHash = this.hashToken(refreshToken);
    const session = await prisma.authSession.findUnique({ where: { id: payload.jti } });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.tokenFamilyId !== payload.fid ||
      !this.hashMatches(presentedHash, session.refreshTokenHash)
    ) {
      throw unauthorizedError("Oturum geçersiz");
    }
    await prisma.authSession.updateMany({
      where: { tokenFamilyId: session.tokenFamilyId, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    return result.count;
  }

  async listContexts(userId: string): Promise<
    Array<{
      id: string;
      type: string;
      name: string;
      role: MembershipRole;
      isPersonal: boolean;
      active: boolean;
    }>
  > {
    const user = await this.findActiveUser(userId);
    if (user.platformRole) return [];
    const memberships = (await this.bootstrapLookup(async (tx) => {
      return tx.membership.findMany({
        where: { userId: user.id, status: "ACTIVE", deletedAt: null },
        select: {
          tenantId: true,
          role: true,
          tenant: { select: { type: true, name: true, status: true, deletedAt: true } },
        },
      });
    })) as MembershipRow[];
    const accessible = memberships.filter(
      (m) => m.tenant.status === "ACTIVE" && m.tenant.deletedAt === null,
    );
    return accessible.map((m) => ({
      id: m.tenantId,
      type: m.tenant.type,
      name: m.tenant.name,
      role: m.role,
      isPersonal: m.tenant.type === "INDIVIDUAL",
      active: true,
    }));
  }

  // -------- özel yardımcılar --------

  private async findActiveUser(userId: string): Promise<AuthUserRow> {
    // Token doğrulama sırasında yalnızca JWT'nin subject'i okunur. Bu sorguyu
    // her istek için interactive transaction'a almak, eşzamanlı statik/UI
    // isteklerinde transaction pool'unun beklemesine (P2028) yol açıyordu.
    // Uygulama bağlantısı RLS'i BYPASSRLS ile çalıştırdığından burada erişim
    // sınırı doğrudan doğrulanmış userId filtresidir; tenant verisi okunmaz.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        platformRole: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt !== null || user.status !== "ACTIVE") {
      throw unauthorizedError("Oturum geçersiz");
    }
    return user;
  }

  /**
   * Kullanıcının erişebileceği tenant'i Membership kayıtlarından çözer
   * (kural 4: tenant JWT'den güvenilmez).
   *  - Platform kullanıcı: platformRole User.platformRole'dan; tenant yok.
   *  - Normal kullanıcı: ACTIVE Membership + ACTIVE tenant; requestedTenantId
   *    verildiyse yalnızca o tenant doğrulanır, verilmediyse tek aktif üyelik
   *    otomatik seçilir.
   */
  private async resolveTenantContext(
    user: AuthUserRow,
    requestedTenantId?: string | null,
  ): Promise<AuthSession["tenantContext"]> {
    if (user.platformRole) {
      return { userId: user.id, tenantId: null, platformRole: user.platformRole };
    }

    const memberships = (await this.bootstrapLookup(async (tx) => {
      return tx.membership.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: {
          tenantId: true,
          role: true,
          tenant: { select: { type: true, name: true, status: true, deletedAt: true } },
        },
      });
    })) as MembershipRow[];

    const accessible = memberships.filter(
      (m) => m.tenant.status === "ACTIVE" && m.tenant.deletedAt === null,
    );

    let selectedTenantId: string;
    if (requestedTenantId) {
      const match = accessible.find((m) => m.tenantId === requestedTenantId);
      if (!match) {
        throw forbiddenError("Bu tenant'a erişiminiz yok");
      }
      selectedTenantId = requestedTenantId;
    } else if (
      accessible.filter(
        (membership) => membership.tenant.type === "INDIVIDUAL" && membership.role === "STUDENT",
      ).length === 1
    ) {
      selectedTenantId = accessible.find(
        (membership) => membership.tenant.type === "INDIVIDUAL" && membership.role === "STUDENT",
      )!.tenantId;
    } else if (accessible.length === 1) {
      selectedTenantId = accessible[0]!.tenantId;
    } else if (accessible.length === 0) {
      throw forbiddenError("Aktif üyeliğiniz bulunmuyor");
    } else {
      throw validationError("TenantId belirtilmelidir");
    }

    const selected = accessible.find((membership) => membership.tenantId === selectedTenantId)!;
    return {
      userId: user.id,
      tenantId: selectedTenantId,
      platformRole: null,
      tenantType: selected.tenant.type as "INDIVIDUAL" | "ORGANIZATION",
      tenantName: selected.tenant.name,
    };
  }

  private async createPersistedSession(
    userId: string,
    metadata: SessionMetadata,
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const tokens = await this.createTokenPair(userId, familyId, sessionId);
    await prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.hashToken(tokens.refreshToken),
        tokenFamilyId: familyId,
        deviceName: metadata.deviceName?.trim() || null,
        platform: metadata.platform ?? "UNKNOWN",
        expiresAt: tokens.refreshTokenExpiresAt,
      },
    });
    return tokens;
  }

  private async createTokenPair(
    userId: string,
    familyId: string,
    sessionId: string,
  ): Promise<AuthTokens> {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({ type: "access", fid: familyId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + this.accessTtlSeconds)
      .sign(this.secretKey);

    const refreshToken = await new SignJWT({ type: "refresh", fid: familyId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + this.refreshTtlSeconds)
      .sign(this.secretKey);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date((nowSeconds + this.accessTtlSeconds) * 1000),
      refreshTokenExpiresAt: new Date((nowSeconds + this.refreshTtlSeconds) * 1000),
    };
  }

  private async verifyJwt(
    token: string,
    expectedType: "access" | "refresh",
  ): Promise<TokenPayload> {
    let payload: TokenPayload;
    try {
      const result = await jwtVerify(token, this.secretKey, { algorithms: ["HS256"] });
      payload = result.payload as unknown as TokenPayload;
    } catch {
      throw unauthorizedError("Oturum geçersiz");
    }

    if (payload.type !== expectedType || !payload.sub || !payload.jti) {
      throw unauthorizedError("Oturum geçersiz");
    }
    return payload;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashMatches(actual: string, expected: string): boolean {
    const actualBytes = Buffer.from(actual, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    return (
      actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
    );
  }

  private async bootstrapLookup<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return withTenantContext(
      { userId: SYSTEM_USER_ID, tenantId: null, platformRole: "SUPER_ADMIN" },
      fn,
    );
  }

  private toPublicUser(user: AuthUserRow): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      platformRole: user.platformRole,
    };
  }
}
