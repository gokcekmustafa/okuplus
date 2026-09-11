import { describe, expect, it } from "vitest";
import {
  buildSignupRequest,
  classifySignupStatus,
  EXPECTED_PRODUCTION_ORIGIN,
  validateProvisionConfig,
} from "../scripts/provision-production-smoke-student.js";

const valid = {
  appEnv: "production",
  nodeEnv: "production",
  baseUrl: EXPECTED_PRODUCTION_ORIGIN,
  email: "okuplus.production.smoke@synthetic.invalid",
  password: "a-strong-production-smoke-secret",
  displayName: "Oku+ Production Smoke Student",
  confirmation: "CREATE",
};

describe("production synthetic student provisioner", () => {
  it("wrong environment'i fail-closed reddeder", () => {
    expect(() => validateProvisionConfig({ ...valid, appEnv: "staging" })).toThrow(
      "APP_ENV production olmalı",
    );
    expect(() => validateProvisionConfig({ ...valid, nodeEnv: "test" })).toThrow(
      "NODE_ENV production olmalı",
    );
  });

  it("staging ve localhost hedeflerini reddeder", () => {
    expect(() =>
      validateProvisionConfig({
        ...valid,
        baseUrl: "https://okuplus-git-staging-gokcekmustafas-projects.vercel.app",
      }),
    ).toThrow("production origin");
    expect(() => validateProvisionConfig({ ...valid, baseUrl: "http://localhost:3000" })).toThrow(
      "production origin",
    );
  });

  it("credential olmadan başlamaz ve synthetic email guard uygular", () => {
    expect(() => validateProvisionConfig({ ...valid, password: undefined })).toThrow(
      "PRODUCTION_SMOKE_PASSWORD",
    );
    expect(() => validateProvisionConfig({ ...valid, email: "real.user@example.com" })).toThrow(
      "synthetic email",
    );
  });

  it("eksik veya yanlış confirmation ile fail-closed olur", () => {
    expect(() => validateProvisionConfig({ ...valid, confirmation: undefined })).toThrow(
      "PRODUCTION_SMOKE_CONFIRM=CREATE",
    );
    expect(() => validateProvisionConfig({ ...valid, confirmation: "YES" })).toThrow(
      "PRODUCTION_SMOKE_CONFIRM=CREATE",
    );
  });

  it("duplicate signup durumunu yeni oluşturma yerine reuse olarak sınıflandırır", () => {
    expect(classifySignupStatus(201)).toBe("CREATED");
    expect(classifySignupStatus(409)).toBe("ALREADY_EXISTS");
    expect(classifySignupStatus(500)).toBe("FAILED");
  });

  it("resmi signup request'ini cookie auth ile oluşturur", () => {
    const config = validateProvisionConfig(valid);
    const request = buildSignupRequest(config);
    const body = JSON.parse(request.body) as Record<string, unknown>;

    expect(request.method).toBe("POST");
    expect(request.url).toBe(`${EXPECTED_PRODUCTION_ORIGIN}/auth/signup`);
    expect(request.headers.Origin).toBe(EXPECTED_PRODUCTION_ORIGIN);
    expect(request.headers["x-auth-transport"]).toBe("cookie");
    expect(body).toMatchObject({
      email: valid.email,
      displayName: valid.displayName,
      platform: "WEB",
      deviceName: "production-smoke",
    });
    expect(body.password).toBe(valid.password);
  });
});
