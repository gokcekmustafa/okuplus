import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStudentSchema, updateStudentSchema } from "../src/modules/students/schemas.js";
import { createTeacherSchema, updateTeacherSchema } from "../src/modules/teachers/schemas.js";
import { createUserSchema, updateUserSchema } from "../src/modules/users/schemas.js";

const writeSchemas = [
  {
    name: "user create",
    schema: createUserSchema,
    validPayload: {
      displayName: "Örnek kullanıcı",
      email: "user@example.test",
      password: "secure-password-123",
    },
  },
  {
    name: "user update",
    schema: updateUserSchema,
    validPayload: { displayName: "Güncel kullanıcı" },
  },
  {
    name: "student create",
    schema: createStudentSchema,
    validPayload: {
      displayName: "Örnek öğrenci",
      email: "student@example.test",
      password: "secure-password-123",
      tenantId: "tenant-id",
    },
  },
  {
    name: "student update",
    schema: updateStudentSchema,
    validPayload: { displayName: "Güncel öğrenci" },
  },
  {
    name: "teacher create",
    schema: createTeacherSchema,
    validPayload: {
      displayName: "Örnek öğretmen",
      email: "teacher@example.test",
      password: "secure-password-123",
      tenantId: "tenant-id",
    },
  },
  {
    name: "teacher update",
    schema: updateTeacherSchema,
    validPayload: { displayName: "Güncel öğretmen" },
  },
];

describe("management TCKN write contracts", () => {
  it.each(writeSchemas)("$name accepts requests without TCKN", ({ schema, validPayload }) => {
    expect(schema.parse(validPayload)).toMatchObject(validPayload);
  });

  it.each(writeSchemas)(
    "$name explicitly rejects legacy TCKN payloads",
    ({ schema, validPayload }) => {
      for (const nationalId of ["12345678901", null]) {
        const result = schema.safeParse({ ...validPayload, nationalId });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({
              code: "custom",
              path: ["nationalId"],
              message: "TCKN bu yönetim isteğinde kabul edilmiyor",
            }),
          );
        }
      }
    },
  );

  it("keeps stripping unrelated unknown fields under the existing Zod object policy", () => {
    const parsed = createUserSchema.parse({
      ...writeSchemas[0]!.validPayload,
      legacyExtra: "ignored",
    });
    expect(parsed).not.toHaveProperty("legacyExtra");
  });

  it("retains the nullable globally unique database column", () => {
    const prismaSchema = readFileSync("prisma/schema.prisma", "utf8").replace(/\r\n/gu, "\n");
    expect(prismaSchema).toMatch(/^\s*nationalId\s+String\?\s+@unique\s*$/mu);
  });
});
