import "dotenv/config";
import { chromium } from "playwright-core";
import {
  SignJWT,
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  type KeyLike,
} from "jose";
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { OidcSocialTokenVerifier } from "../src/modules/auth/index.js";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.SOCIAL_E2E_PORT ?? 3018);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const GOOGLE_AUD = "oku-browser-google-client";
const APPLE_AUD = "oku-browser-apple-client";
const NONCE = "browser-stage8b-nonce-123456";
const GOOGLE_EMAIL = "stage8b-browser-google@example.com";
const APPLE_EMAIL = "stage8b-browser@privaterelay.appleid.com";
const PASSWORD_EMAIL = "stage8b-browser-password@example.com";
const PASSWORD = "browser-stage8b-password-123!";

let googlePrivateKey: KeyLike;
let applePrivateKey: KeyLike;
let googleUserId = "";
let appleUserId = "";
let passwordUserId = "";
let personalTenantId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function idToken(
  provider: "GOOGLE" | "APPLE",
  subject: string,
  options: { email?: string; nonce?: string; privateEmail?: boolean } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    nonce: options.nonce ?? NONCE,
    email: options.email,
    email_verified: true,
    name: `Browser ${provider}`,
    ...(provider === "APPLE" ? { is_private_email: options.privateEmail ?? false } : {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: `${provider.toLowerCase()}-browser-key` })
    .setIssuer(provider === "GOOGLE" ? "https://accounts.google.com" : "https://appleid.apple.com")
    .setAudience(provider === "GOOGLE" ? GOOGLE_AUD : APPLE_AUD)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(provider === "GOOGLE" ? googlePrivateKey : applePrivateKey);
}

async function testUsers() {
  return prisma.user.findMany({
    where: { email: { in: [GOOGLE_EMAIL, APPLE_EMAIL, PASSWORD_EMAIL] } },
    select: { id: true, memberships: { select: { tenantId: true } } },
  });
}

async function cleanup(): Promise<void> {
  const users = await testUsers();
  const userIds = users.map((user) => user.id);
  const tenantIds = users.flatMap((user) => user.memberships.map((item) => item.tenantId));
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

async function orphanCount(): Promise<number> {
  const users = await testUsers();
  const userIds = [
    ...new Set([...users.map((user) => user.id), googleUserId, appleUserId, passwordUserId]),
  ].filter(Boolean);
  const tenantIds = [personalTenantId].filter(Boolean);
  const counts = await Promise.all([
    prisma.user.count({ where: { email: { in: [GOOGLE_EMAIL, APPLE_EMAIL, PASSWORD_EMAIL] } } }),
    prisma.authIdentity.count({ where: { userId: { in: userIds } } }),
    prisma.authSession.count({ where: { userId: { in: userIds } } }),
    prisma.membership.count({ where: { userId: { in: userIds } } }),
    prisma.studentProfile.count({ where: { studentId: { in: userIds } } }),
    prisma.tenant.count({ where: { id: { in: tenantIds } } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function main(): Promise<void> {
  await prisma.$connect();
  await cleanup();

  const googleKeys = await generateKeyPair("RS256");
  const appleKeys = await generateKeyPair("RS256");
  googlePrivateKey = googleKeys.privateKey;
  applePrivateKey = appleKeys.privateKey;
  const googleJwk = await exportJWK(googleKeys.publicKey);
  googleJwk.kid = "google-browser-key";
  googleJwk.alg = "RS256";
  const appleJwk = await exportJWK(appleKeys.publicKey);
  appleJwk.kid = "apple-browser-key";
  appleJwk.alg = "RS256";

  const verifier = new OidcSocialTokenVerifier({
    googleAudiences: [GOOGLE_AUD],
    appleAudiences: [APPLE_AUD],
    googleKey: createLocalJWKSet({ keys: [googleJwk] }),
    appleKey: createLocalJWKSet({ keys: [appleJwk] }),
  });
  const app = await buildApp(
    loadEnv({
      PORT: String(PORT),
      HOST: "127.0.0.1",
      GOOGLE_OIDC_CLIENT_IDS: GOOGLE_AUD,
      APPLE_OIDC_CLIENT_IDS: APPLE_AUD,
    }),
    { socialTokenVerifier: verifier },
  );
  await app.listen({ port: PORT, host: "127.0.0.1" });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage();
    const responses: Array<{ path: string; status: number }> = [];
    page.on("response", (response) => {
      if (response.url().includes("/auth/")) {
        responses.push({ path: new URL(response.url()).pathname, status: response.status() });
      }
    });

    console.log("[1/22] Login UI açılıyor");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    console.log("[2/22] Google butonu render");
    await page.locator("#google-login-btn").waitFor({ state: "visible" });

    console.log("[3/22] Apple butonu render");
    await page.locator("#apple-login-btn").waitFor({ state: "visible" });

    console.log("[4/22] Provider config HTTP");
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#google-login-btn")?.disabled,
    );
    assert(
      responses.some((item) => item.path === "/auth/social/config" && item.status === 200),
      "Config HTTP yok",
    );

    console.log("[5/22] Invalid provider token 401");
    const invalidStatus = await page.evaluate(async (nonce) => {
      const response = await fetch("/auth/social/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "not-a-jwt", nonce }),
      });
      return response.status;
    }, NONCE);
    assert(invalidStatus === 401, "Invalid token reddedilmedi");

    console.log("[6/22] Wrong nonce 401");
    const wrongNonceStatus = await page.evaluate(
      async ({ signedToken, nonce }) => {
        const response = await fetch("/auth/social/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: signedToken, nonce }),
        });
        return response.status;
      },
      {
        signedToken: await idToken("GOOGLE", "stage8b-browser-wrong-nonce", {
          email: "stage8b-browser-wrong@example.com",
        }),
        nonce: "wrong-browser-nonce",
      },
    );
    assert(wrongNonceStatus === 401, "Wrong nonce reddedilmedi");

    console.log("[7/22] Deterministik Google OIDC login");
    const googleToken = await idToken("GOOGLE", "stage8b-browser-google", {
      email: GOOGLE_EMAIL,
    });
    await page.evaluate(
      async ({ signedToken, nonce }) => {
        await window.completeOkuSocialLogin("google", signedToken, nonce, "Browser Google");
      },
      { signedToken: googleToken, nonce: NONCE },
    );
    await page.locator("#view-app").waitFor({ state: "visible" });

    console.log("[8/22] Personal context UI");
    assert((await page.locator("#topbar-tenant").textContent()) === "Kişisel", "UI personal değil");

    console.log("[9/22] User + AuthIdentity DB");
    const googleUser = await prisma.user.findUniqueOrThrow({ where: { email: GOOGLE_EMAIL } });
    googleUserId = googleUser.id;
    const googleIdentity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_subject: { provider: "GOOGLE", subject: "stage8b-browser-google" } },
    });
    assert(googleIdentity.userId === googleUserId, "Identity User eşleşmiyor");

    console.log("[10/22] Tenant/Membership/Profile DB");
    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        userId: googleUserId,
        role: "STUDENT",
        status: "ACTIVE",
        tenant: { type: "INDIVIDUAL" },
      },
    });
    personalTenantId = membership.tenantId;
    await prisma.studentProfile.findUniqueOrThrow({
      where: { tenantId_studentId: { tenantId: personalTenantId, studentId: googleUserId } },
    });

    console.log("[11/22] AuthSession hash / plaintext yok");
    const originalRefresh = await page.evaluate(() => localStorage.getItem("oku.refreshToken"));
    assert(originalRefresh, "Refresh token browserda yok");
    const originalPayload = decodeJwt(originalRefresh);
    const originalSession = await prisma.authSession.findUniqueOrThrow({
      where: { id: originalPayload.jti! },
    });
    assert(
      originalSession.refreshTokenHash ===
        createHash("sha256").update(originalRefresh).digest("hex"),
      "Hash yanlış",
    );
    assert(originalSession.refreshTokenHash !== originalRefresh, "Plaintext DB'ye yazılmış");

    console.log("[12/22] Refresh rotation HTTP/DB");
    const rotated = await page.evaluate(async (refreshToken) => {
      const response = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      return { status: response.status, body: await response.json() };
    }, originalRefresh);
    assert(rotated.status === 200, "Rotation başarısız");
    const replacement = rotated.body.data.refreshToken as string;
    assert(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: originalPayload.jti! } }))
        .revokedAt,
      "Eski session revoke değil",
    );

    console.log("[13/22] Refresh replay 401");
    const replayStatus = await page.evaluate(async (refreshToken) => {
      const response = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      return response.status;
    }, originalRefresh);
    assert(replayStatus === 401, "Replay reddedilmedi");

    console.log("[14/22] Replacement family revoke");
    const replacementStatus = await page.evaluate(async (refreshToken) => {
      const response = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      return response.status;
    }, replacement);
    assert(replacementStatus === 401, "Family replacement açık kaldı");

    console.log("[15/22] Apple private relay login");
    const appleResult = await page.evaluate(
      async ({ signedToken, nonce }) => {
        const response = await fetch("/auth/social/apple", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: signedToken, nonce, platform: "IOS" }),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        signedToken: await idToken("APPLE", "stage8b-browser-apple", {
          email: APPLE_EMAIL,
          privateEmail: true,
        }),
        nonce: NONCE,
      },
    );
    assert(appleResult.status === 200, "Apple fixture login başarısız");
    appleUserId = appleResult.body.data.user.id;
    assert(
      (await prisma.authIdentity.findFirstOrThrow({ where: { userId: appleUserId } }))
        .isPrivateEmail,
      "Private relay işareti yok",
    );

    console.log("[16/22] Password account korunuyor");
    const passwordSignup = await page.evaluate(
      async ({ email, password }) => {
        const response = await fetch("/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: "Browser Password",
            platform: "WEB",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { email: PASSWORD_EMAIL, password: PASSWORD },
    );
    assert(passwordSignup.status === 201, "Password signup bozuldu");
    passwordUserId = passwordSignup.body.data.user.id;
    const passwordAccess = passwordSignup.body.data.tokens.accessToken as string;

    console.log("[17/22] Secure account link");
    const linkedToken = await idToken("GOOGLE", "stage8b-browser-linked", {
      email: "stage8b-browser-linked@example.com",
    });
    const linkStatus = await page.evaluate(
      async ({ accessToken, signedToken, nonce }) => {
        const response = await fetch("/auth/social/google/link", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ idToken: signedToken, nonce }),
        });
        return response.status;
      },
      { accessToken: passwordAccess, signedToken: linkedToken, nonce: NONCE },
    );
    assert(linkStatus === 200, "Secure link başarısız");

    console.log("[18/22] Cross-user link 409");
    const crossLinkStatus = await page.evaluate(
      async ({ accessToken, signedToken, nonce }) => {
        const response = await fetch("/auth/social/google/link", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ idToken: signedToken, nonce }),
        });
        return response.status;
      },
      { accessToken: passwordAccess, signedToken: googleToken, nonce: NONCE },
    );
    assert(crossLinkStatus === 409, "Cross-user link engellenmedi");

    console.log("[19/22] Password hesabında unlink");
    const unlinkStatus = await page.evaluate(async (accessToken) => {
      const response = await fetch("/auth/social/google", {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      return response.status;
    }, passwordAccess);
    assert(unlinkStatus === 200, "Unlink başarısız");

    console.log("[20/22] Son identity unlink güvenliği");
    const appleUnlinkStatus = await page.evaluate(async (accessToken) => {
      const response = await fetch("/auth/social/apple", {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      return response.status;
    }, appleResult.body.data.tokens.accessToken as string);
    assert(appleUnlinkStatus === 409, "Son identity silinebildi");

    console.log("[21/22] HTTP evidence");
    assert(
      responses.some((item) => item.path === "/auth/social/google" && item.status === 200),
      "Google 200 evidence yok",
    );
    assert(
      responses.some((item) => item.path === "/auth/refresh" && item.status === 401),
      "Replay 401 evidence yok",
    );

    console.log("[22/22] Cleanup + orphan");
    await browser.close();
    browser = null;
    await cleanup();
    assert((await orphanCount()) === 0, "Cleanup sonrası orphan bulundu");
    console.log("AŞAMA 8B SOCIAL AUTH E2E: PASS");
    console.log("GERÇEK GOOGLE/APPLE PROVIDER ACCEPTANCE: ÇALIŞTIRILAMADI (credential yok)");
  } finally {
    if (browser) await browser.close();
    await app.close();
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  }
}

declare global {
  interface Window {
    completeOkuSocialLogin: (
      provider: string,
      idToken: string,
      nonce: string,
      displayName?: string,
    ) => Promise<unknown>;
  }
}

main().catch((error) => {
  console.error("AŞAMA 8B SOCIAL AUTH E2E: FAIL", error);
  process.exitCode = 1;
});
