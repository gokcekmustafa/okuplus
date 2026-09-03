import { createHash } from "node:crypto";
import {
  SignJWT,
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  type KeyLike,
} from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { OidcSocialTokenVerifier } from "../src/modules/auth/index.js";

const GOOGLE_AUD = "oku-google-test-client";
const APPLE_AUD = "com.okuplus.test";
const NONCE = "stage8b-secure-nonce-123456";
const PASSWORD = "stage8b-password-123!";
const EMAIL_GOOGLE = "stage8b-google@example.com";
const EMAIL_APPLE = "stage8b@privaterelay.appleid.com";
const EMAIL_PASSWORD = "stage8b-password@example.com";

let googlePrivateKey: KeyLike;
let applePrivateKey: KeyLike;
let badPrivateKey: KeyLike;
let socialVerifier: OidcSocialTokenVerifier;
let app: Awaited<ReturnType<typeof buildApp>>;
let googleUserId = "";
let appleUserId = "";
let passwordUserId = "";
let passwordAccessToken = "";
let googleRefreshToken = "";

type Provider = "GOOGLE" | "APPLE";
type TokenOptions = {
  subject?: string | null;
  email?: string | null;
  nonce?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  privateKey?: KeyLike;
  privateEmail?: boolean;
  name?: string;
};

async function token(provider: Provider, options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = options.privateKey ?? (provider === "GOOGLE" ? googlePrivateKey : applePrivateKey);
  let jwt = new SignJWT({
    nonce: options.nonce ?? NONCE,
    email: options.email === undefined ? `${provider.toLowerCase()}@example.com` : options.email,
    email_verified: true,
    name: options.name ?? `Stage 8B ${provider}`,
    ...(provider === "APPLE" ? { is_private_email: options.privateEmail ?? false } : {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: `${provider.toLowerCase()}-key` })
    .setIssuer(
      options.issuer ??
        (provider === "GOOGLE" ? "https://accounts.google.com" : "https://appleid.apple.com"),
    )
    .setAudience(options.audience ?? (provider === "GOOGLE" ? GOOGLE_AUD : APPLE_AUD))
    .setIssuedAt(now)
    .setExpirationTime(now + (options.expiresIn ?? 300));
  if (options.subject !== null) jwt = jwt.setSubject(options.subject ?? `${provider}-subject`);
  return jwt.sign(key);
}

async function social(provider: Provider, idToken: string, nonce = NONCE) {
  return app.inject({
    method: "POST",
    url: `/auth/social/${provider.toLowerCase()}`,
    payload: { idToken, nonce, platform: "IOS", deviceName: "Vitest Device" },
  });
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: "stage8b-" } },
        { email: EMAIL_APPLE },
        { authIdentities: { some: { subject: { startsWith: "stage8b-" } } } },
      ],
    },
    select: { id: true, memberships: { select: { tenantId: true } } },
  });
  const userIds = users.map((user) => user.id);
  const tenantIds = users.flatMap((user) =>
    user.memberships.map((membership) => membership.tenantId),
  );
  await prisma.studentBadge.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.attempt.deleteMany({ where: { session: { studentId: { in: userIds } } } });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: { in: userIds } } },
  });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

describe.sequential("social auth + persistent session", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const googleKeys = await generateKeyPair("RS256");
    const appleKeys = await generateKeyPair("RS256");
    const badKeys = await generateKeyPair("RS256");
    googlePrivateKey = googleKeys.privateKey;
    applePrivateKey = appleKeys.privateKey;
    badPrivateKey = badKeys.privateKey;

    const googleJwk = await exportJWK(googleKeys.publicKey);
    googleJwk.kid = "google-key";
    googleJwk.alg = "RS256";
    const appleJwk = await exportJWK(appleKeys.publicKey);
    appleJwk.kid = "apple-key";
    appleJwk.alg = "RS256";
    socialVerifier = new OidcSocialTokenVerifier({
      googleAudiences: [GOOGLE_AUD],
      appleAudiences: [APPLE_AUD],
      googleKey: createLocalJWKSet({ keys: [googleJwk] }),
      appleKey: createLocalJWKSet({ keys: [appleJwk] }),
    });
    app = await buildApp(
      loadEnv({ GOOGLE_OIDC_CLIENT_IDS: GOOGLE_AUD, APPLE_OIDC_CLIENT_IDS: APPLE_AUD }),
      { socialTokenVerifier: socialVerifier },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("1. Google first login", async () => {
    const response = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    expect(response.statusCode).toBe(200);
    googleUserId = response.json().data.user.id;
    googleRefreshToken = response.json().data.tokens.refreshToken;
    expect(response.json().data.tenantContext.tenantType).toBe("INDIVIDUAL");
  });

  it("2. Apple first login", async () => {
    const response = await social(
      "APPLE",
      await token("APPLE", {
        subject: "stage8b-apple-main",
        email: EMAIL_APPLE,
        privateEmail: true,
      }),
    );
    expect(response.statusCode).toBe(200);
    appleUserId = response.json().data.user.id;
  });

  it("3. existing identity login aynı User'ı kullanır", async () => {
    const response = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.id).toBe(googleUserId);
  });

  it("4. duplicate identity yarışı ikinci User üretmez", async () => {
    const idToken = await token("GOOGLE", {
      subject: "stage8b-race-subject",
      email: null,
    });
    const [first, second] = await Promise.all([
      social("GOOGLE", idToken),
      social("GOOGLE", idToken),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().data.user.id).toBe(second.json().data.user.id);
    expect(
      await prisma.authIdentity.count({
        where: { provider: "GOOGLE", subject: "stage8b-race-subject" },
      }),
    ).toBe(1);
  });

  it("5. personal tenant oluşturulur", async () => {
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: googleUserId, tenant: { type: "INDIVIDUAL" } },
      include: { tenant: true },
    });
    expect(membership.tenant.name).toBe("Kişisel");
  });

  it("6. ACTIVE STUDENT membership oluşturulur", async () => {
    expect(
      await prisma.membership.count({
        where: { userId: googleUserId, role: "STUDENT", status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("7. StudentProfile oluşturulur", async () => {
    expect(await prisma.studentProfile.count({ where: { studentId: googleUserId } })).toBe(1);
  });

  it("8. doğrulanmış password session ile account linking", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        email: EMAIL_PASSWORD,
        password: PASSWORD,
        displayName: "Password User",
        platform: "WEB",
      },
    });
    passwordUserId = signup.json().data.user.id;
    passwordAccessToken = signup.json().data.tokens.accessToken;
    const response = await app.inject({
      method: "POST",
      url: "/auth/social/google/link",
      headers: { authorization: `Bearer ${passwordAccessToken}` },
      payload: {
        idToken: await token("GOOGLE", {
          subject: "stage8b-linked-google",
          email: "stage8b-linked@example.com",
        }),
        nonce: NONCE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.authIdentity.count({ where: { userId: passwordUserId, provider: "GOOGLE" } }),
    ).toBe(1);
  });

  it("9. son login methodu unlink edilemez", async () => {
    const login = await social(
      "APPLE",
      await token("APPLE", { subject: "stage8b-apple-main", email: EMAIL_APPLE }),
    );
    const response = await app.inject({
      method: "DELETE",
      url: "/auth/social/apple",
      headers: { authorization: `Bearer ${login.json().data.tokens.accessToken}` },
    });
    expect(response.statusCode).toBe(409);
  });

  it("10. refresh rotation eski satırı revoke edip hashli yeni satır oluşturur", async () => {
    const oldPayload = decodeJwt(googleRefreshToken);
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: googleRefreshToken },
    });
    expect(response.statusCode).toBe(200);
    const nextRefresh = response.json().data.refreshToken;
    const nextPayload = decodeJwt(nextRefresh);
    const [oldSession, nextSession] = await Promise.all([
      prisma.authSession.findUniqueOrThrow({ where: { id: oldPayload.jti! } }),
      prisma.authSession.findUniqueOrThrow({ where: { id: nextPayload.jti! } }),
    ]);
    expect(oldSession.revokedAt).not.toBeNull();
    expect(nextSession.revokedAt).toBeNull();
    expect(nextSession.tokenFamilyId).toBe(oldSession.tokenFamilyId);
    expect(nextSession.platform).toBe("IOS");
    expect(nextSession.deviceName).toBe("Vitest Device");
    expect(nextSession.refreshTokenHash).toBe(
      createHash("sha256").update(nextRefresh).digest("hex"),
    );
    expect(nextSession.refreshTokenHash).not.toContain(nextRefresh);
    googleRefreshToken = nextRefresh;
  });

  it("11. refresh replay bütün token family'yi revoke eder", async () => {
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const original = login.json().data.tokens.refreshToken;
    const rotated = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: original },
    });
    const replacement = rotated.json().data.refreshToken;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: original },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: replacement },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("12. logout session family'yi revoke eder", async () => {
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const refreshToken = login.json().data.tokens.refreshToken;
    expect(
      (await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } }))
        .statusCode,
    ).toBe(401);
  });

  it("13. logout-all tüm kullanıcı sessionlarını revoke eder", async () => {
    const first = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const second = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout-all",
      headers: { authorization: `Bearer ${first.json().data.tokens.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.revokedCount).toBeGreaterThanOrEqual(2);
    for (const refreshToken of [
      first.json().data.tokens.refreshToken,
      second.json().data.tokens.refreshToken,
    ]) {
      expect(
        (await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } }))
          .statusCode,
      ).toBe(401);
    }
  });

  it("14. expired AuthSession reddedilir", async () => {
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const refreshToken = login.json().data.tokens.refreshToken;
    await prisma.authSession.update({
      where: { id: decodeJwt(refreshToken).jti! },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(response.statusCode).toBe(401);
  });

  it("15. revoked AuthSession reddedilir", async () => {
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const refreshToken = login.json().data.tokens.refreshToken;
    await prisma.authSession.update({
      where: { id: decodeJwt(refreshToken).jti! },
      data: { revokedAt: new Date() },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("16. invalid issuer reddedilir", async () => {
    expect(
      (
        await social(
          "GOOGLE",
          await token("GOOGLE", { subject: "stage8b-bad-issuer", issuer: "https://evil.test" }),
        )
      ).statusCode,
    ).toBe(401);
  });

  it("17. invalid audience reddedilir", async () => {
    expect(
      (
        await social(
          "APPLE",
          await token("APPLE", { subject: "stage8b-bad-aud", audience: "wrong-client" }),
        )
      ).statusCode,
    ).toBe(401);
  });

  it("18. invalid signature reddedilir", async () => {
    expect(
      (
        await social(
          "GOOGLE",
          await token("GOOGLE", { subject: "stage8b-bad-signature", privateKey: badPrivateKey }),
        )
      ).statusCode,
    ).toBe(401);
  });

  it("19. invalid nonce reddedilir", async () => {
    expect(
      (
        await social(
          "APPLE",
          await token("APPLE", { subject: "stage8b-bad-nonce", nonce: "different-nonce" }),
        )
      ).statusCode,
    ).toBe(401);
  });

  it("20. cross-user identity link engellenir", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/social/google/link",
      headers: { authorization: `Bearer ${passwordAccessToken}` },
      payload: {
        idToken: await token("GOOGLE", {
          subject: "stage8b-google-main",
          email: EMAIL_GOOGLE,
        }),
        nonce: NONCE,
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it("21. provider subject kimlik anahtarıdır, email değişimi yeni User üretmez", async () => {
    const response = await social(
      "GOOGLE",
      await token("GOOGLE", {
        subject: "stage8b-google-main",
        email: "stage8b-google-changed@example.com",
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.id).toBe(googleUserId);
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_subject: { provider: "GOOGLE", subject: "stage8b-google-main" } },
    });
    expect(identity.providerEmail).toBe("stage8b-google-changed@example.com");
  });

  it("22. Apple private relay metadata korunur", async () => {
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_subject: { provider: "APPLE", subject: "stage8b-apple-main" } },
    });
    expect(identity.userId).toBe(appleUserId);
    expect(identity.providerEmail).toBe(EMAIL_APPLE);
    expect(identity.isPrivateEmail).toBe(true);
  });

  it("23. subject bulunmayan provider tokenı reddedilir", async () => {
    expect((await social("GOOGLE", await token("GOOGLE", { subject: null }))).statusCode).toBe(401);
  });

  it("24. email collision otomatik account linking yapmaz", async () => {
    const response = await social(
      "APPLE",
      await token("APPLE", {
        subject: "stage8b-takeover-attempt",
        email: EMAIL_PASSWORD,
      }),
    );
    expect(response.statusCode).toBe(409);
    expect(
      await prisma.authIdentity.count({ where: { subject: "stage8b-takeover-attempt" } }),
    ).toBe(0);
  });

  it("25. expired provider token reddedilir", async () => {
    expect(
      (
        await social(
          "GOOGLE",
          await token("GOOGLE", { subject: "stage8b-expired-token", expiresIn: -10 }),
        )
      ).statusCode,
    ).toBe(401);
  });

  it("26. password varsa provider unlink güvenlidir", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/auth/social/google",
      headers: { authorization: `Bearer ${passwordAccessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.authIdentity.count({ where: { userId: passwordUserId, provider: "GOOGLE" } }),
    ).toBe(0);
  });

  it("27. process restart sonrası DB-backed refresh çalışır", async () => {
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    const refreshToken = login.json().data.tokens.refreshToken;
    await app.close();
    app = await buildApp(
      loadEnv({ GOOGLE_OIDC_CLIENT_IDS: GOOGLE_AUD, APPLE_OIDC_CLIENT_IDS: APPLE_AUD }),
      { socialTokenVerifier: socialVerifier },
    );
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(response.statusCode).toBe(200);
  });

  it("28. social User organization membership kaybetmez", async () => {
    const organization = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: "Stage 8B Organization" },
    });
    await prisma.membership.create({
      data: {
        tenantId: organization.id,
        userId: googleUserId,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    const login = await social(
      "GOOGLE",
      await token("GOOGLE", { subject: "stage8b-google-main", email: EMAIL_GOOGLE }),
    );
    expect(login.json().data.tenantContext.tenantType).toBe("INDIVIDUAL");
    const organizationContext = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().data.tokens.accessToken}`,
        "x-tenant-id": organization.id,
      },
    });
    expect(organizationContext.statusCode).toBe(200);
    expect(organizationContext.json().data.tenantContext.tenantId).toBe(organization.id);
  });
});
