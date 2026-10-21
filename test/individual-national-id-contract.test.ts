import { describe, expect, it } from "vitest";
import { accountProfileSchema, signupSchema } from "../src/modules/auth/schemas.js";

const personalSignup = {
  email: "ogrenci@example.test",
  password: "secure-password-123",
  displayName: "Örnek Öğrenci",
};

describe("individual account TCKN API contracts", () => {
  it("accepts signup and session metadata without requiring TCKN", () => {
    expect(
      signupSchema.parse({
        ...personalSignup,
        deviceName: "Tarayıcı",
        platform: "WEB",
      }),
    ).toMatchObject(personalSignup);
  });

  it("rejects TCKN and unrelated extra fields in individual signup", () => {
    expect(() => signupSchema.parse({ ...personalSignup, nationalId: "12345678901" })).toThrow();
    expect(() => signupSchema.parse({ ...personalSignup, unexpected: true })).toThrow();
  });

  it("accepts ordinary profile updates without TCKN and rejects attempts to add it", () => {
    const profile = {
      displayName: "Örnek Öğrenci",
      email: "ogrenci@example.test",
      phone: null,
      birthYear: null,
    };
    expect(accountProfileSchema.parse(profile)).toEqual(profile);
    expect(() => accountProfileSchema.parse({ ...profile, nationalId: "12345678901" })).toThrow();
  });
});
