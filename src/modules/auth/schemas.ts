import { z } from "zod";
import { turkishNationalIdSchema, turkishPhoneSchema } from "../../lib/person-data.js";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Parola en az 8 karakter olmalı").max(128),
  displayName: z.string().trim().min(1, "Ad gerekli").max(120),
  phone: turkishPhoneSchema,
  nationalId: turkishNationalIdSchema,
});

export const accountProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Ad gerekli").max(120),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi olmalı").max(254),
  phone: turkishPhoneSchema,
  nationalId: turkishNationalIdSchema,
  birthYear: z
    .number()
    .int("Doğum yılı tam sayı olmalı")
    .min(1900, "Doğum yılı en az 1900 olmalı")
    .max(new Date().getFullYear(), "Doğum yılı gelecekte olamaz")
    .nullable()
    .optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
