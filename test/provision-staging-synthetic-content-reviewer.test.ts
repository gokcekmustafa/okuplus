import { describe, expect, it, vi } from "vitest";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import {
  classifyReviewerState,
  provisionReviewer,
  SYNTHETIC_REVIEWER_EMAIL,
  SYNTHETIC_REVIEWER_ROLE,
  validateTargetConfig,
} from "../scripts/provision-staging-synthetic-content-reviewer.js";

const passwordHash = "scrypt$AA==$AA==";

function state(overrides: Partial<Parameters<typeof classifyReviewerState>[0]> = {}) {
  return {
    passwordHash,
    platformRole: SYNTHETIC_REVIEWER_ROLE,
    status: "ACTIVE" as const,
    deletedAt: null,
    memberships: [],
    ...overrides,
  };
}

describe("staging synthetic content reviewer provisioner", () => {
  it("staging fingerprint guard exact hedefi ister", () => {
    expect(() => validateTargetConfig("PRODUCTION", "x")).toThrow("STAGING");
    expect(() => validateTargetConfig("STAGING", "x")).toThrow("fingerprint");
    expect(() =>
      validateTargetConfig(
        "STAGING",
        "18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38",
      ),
    ).not.toThrow();
  });

  it("ilk provisioning create, tekrar aynı credential ile NOOP olur", () => {
    expect(classifyReviewerState(null, false)).toBe("CREATE");
    expect(classifyReviewerState(state(), true)).toBe("NOOP");
  });

  it("yanlış parola veya rol/scope state'i UPDATE gerektirir", () => {
    expect(classifyReviewerState(state(), false)).toBe("UPDATE");
    expect(classifyReviewerState(state({ platformRole: null }), true)).toBe("UPDATE");
    expect(() =>
      classifyReviewerState(state({ memberships: [{ tenantId: "tenant" }] }), true),
    ).toThrow("membership");
  });

  it("canonical email ve global reviewer rolünü sabit tutar", () => {
    expect(SYNTHETIC_REVIEWER_EMAIL).toBe("okuplus.release06.staging.reviewer@synthetic.invalid");
    expect(SYNTHETIC_REVIEWER_ROLE).toBe("CONTENT_REVIEWER");
  });

  it("uygulama hash'i raw parola olmadan doğrulanabilir", async () => {
    const password = "synthetic-reviewer-test-password";
    const hash = await new ScryptPasswordHasher().hash(password);
    expect(await new ScryptPasswordHasher().verify(password, hash)).toBe(true);
    expect(hash).not.toContain(password);
  });

  it("ilk provisioning exact global reviewer hesabını oluşturur ve parola yazmaz", async () => {
    const create = vi.fn().mockResolvedValue({ id: "reviewer-1" });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
    } as never;
    const password = "reviewer-password-123";

    const result = await provisionReviewer({ prisma, password, apply: true });

    expect(result).toMatchObject({
      action: "CREATE",
      email: SYNTHETIC_REVIEWER_EMAIL,
      role: SYNTHETIC_REVIEWER_ROLE,
      globalScope: "YES",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.email).toBe(SYNTHETIC_REVIEWER_EMAIL);
    expect(data.platformRole).toBe("CONTENT_REVIEWER");
    expect(data.passwordHash).not.toBe(password);
  });

  it("aynı credential ile tekrar provisioning NOOP olur ve duplicate oluşturmaz", async () => {
    const password = "reviewer-password-123";
    const passwordHash = await new ScryptPasswordHasher().hash(password);
    const create = vi.fn();
    const update = vi.fn();
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "reviewer-1",
          passwordHash,
          platformRole: "CONTENT_REVIEWER",
          status: "ACTIVE",
          deletedAt: null,
          memberships: [],
        }),
        create,
        update,
      },
    } as never;

    const result = await provisionReviewer({ prisma, password, apply: true });

    expect(result.action).toBe("NOOP");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
