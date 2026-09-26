import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("config/env", () => {
  const base = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/oku_plus_test?schema=public",
  };

  it("varsayılan değerleri uygular", () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.CORS_ORIGIN).toBe("");
  });

  it("açıkça verilen değerleri korur", () => {
    const env = parseEnv({
      ...base,
      APP_ENV: "production",
      NODE_ENV: "production",
      PORT: "8080",
      CORS_ORIGIN: "https://app.example.com",
      AUTH_COOKIE_TRANSPORT: "on",
      AUTH_ORIGIN_ENFORCEMENT: "on",
      JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGIN).toBe("https://app.example.com");
  });

  it("Vercel Preview'da production runtime'ı staging uygulama ortamına eşler", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
    });

    expect(env.APP_ENV).toBe("staging");
    expect(env.NODE_ENV).toBe("production");
  });

  it("Vercel Production'da production uygulama ortamını kullanır", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
      CORS_ORIGIN: "https://app.example.com",
      AUTH_COOKIE_TRANSPORT: "on",
      AUTH_ORIGIN_ENFORCEMENT: "on",
    });

    expect(env.APP_ENV).toBe("production");
    expect(env.NODE_ENV).toBe("production");
  });

  it("Vercel Development'da development uygulama ortamını kullanır", () => {
    const env = parseEnv({ ...base, VERCEL_ENV: "development" });

    expect(env.APP_ENV).toBe("development");
  });

  it("açık APP_ENV değeri Vercel fallback'i tarafından override edilmez", () => {
    expect(() =>
      parseEnv({
        ...base,
        APP_ENV: "development",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toThrow("NODE_ENV=production");
  });

  it("geçersiz VERCEL_ENV değerini reddeder", () => {
    expect(() => parseEnv({ ...base, VERCEL_ENV: "staging" })).toThrow("VERCEL_ENV");
  });

  it("Preview fallback'i production-like güvenlik kontrollerini korur", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        JWT_SECRET: "short",
      }),
    ).toThrow("JWT_SECRET");

    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
        CORS_ORIGIN: "*",
      }),
    ).toThrow("CORS_ORIGIN");

    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        JWT_SECRET: "Q7!mZ2_rT8xL4pN6vC9kH3aW5eJ1sB0dF4yK8uP",
        AUTH_COOKIE_TRANSPORT: "on",
      }),
    ).toThrow("AUTH_ORIGIN_ENFORCEMENT");
  });

  it("DATABASE_URL eksikse hata fırlatır", () => {
    expect(() => parseEnv({})).toThrow("DATABASE_URL");
  });

  it("geçersiz DATABASE_URL reddeder", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://user:pass@host/db" })).toThrow(
      "DATABASE_URL",
    );
  });

  it("geçersiz PORT reddeder", () => {
    expect(() => parseEnv({ ...base, PORT: "abc" })).toThrow();
  });

  it("geçersiz NODE_ENV reddeder", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "staging" })).toThrow();
  });

  it("production varsayılan JWT_SECRET ile başlamaz", () => {
    expect(() => parseEnv({ ...base, APP_ENV: "production", NODE_ENV: "production" })).toThrow(
      "JWT_SECRET",
    );
  });

  it("CORS wildcard reddeder", () => {
    expect(() => parseEnv({ ...base, CORS_ORIGIN: "*" })).toThrow("CORS_ORIGIN");
  });

  it("CORS origin olarak path içeren URL reddeder", () => {
    expect(() => parseEnv({ ...base, CORS_ORIGIN: "https://app.example.com/path" })).toThrow(
      "CORS_ORIGIN",
    );
  });

  it("CORS wildcard subdomain reddeder", () => {
    expect(() => parseEnv({ ...base, CORS_ORIGIN: "https://*.example.com" })).toThrow(
      "CORS_ORIGIN",
    );
  });
});
