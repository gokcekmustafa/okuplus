import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Parola en az 8 karakter olmalı").max(128),
  displayName: z.string().trim().min(1, "Ad gerekli").max(120),
});

export type SignupInput = z.infer<typeof signupSchema>;
