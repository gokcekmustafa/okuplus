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
