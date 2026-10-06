import { z } from "zod";

/**
 * Kişi verileri için tek kanoniklaştırma noktası.
 *
 * Telefonlar veritabanına Türkiye GSM numarasının 11 haneli, sıfırla başlayan
 * gösterimi olarak yazılır; kullanıcı arayüzünde ise okunabilir biçimde
 * gösterilir. TC Kimlik No hiçbir zaman telefon gibi biçimlendirilmez.
 */

export function normalizeTurkishPhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  if (!/^[\d\s()+-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0090") && digits.length === 14) return `0${digits.slice(4)}`;
  if (digits.startsWith("90") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("5")) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith("05")) return digits;
  return null;
}

export function isValidTurkishPhone(value: string | null | undefined): boolean {
  const normalized = normalizeTurkishPhone(value);
  return normalized !== null && /^05[0-9]{9}$/.test(normalized);
}

export function formatTurkishPhone(value: string | null | undefined): string | null {
  const normalized = normalizeTurkishPhone(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 1)} (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)} ${normalized.slice(7, 9)} ${normalized.slice(9, 11)}`;
}

export function normalizeTurkishNationalId(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const digits = value.replace(/\D/g, "");
  return isValidTurkishNationalId(digits) ? digits : null;
}

export function isValidTurkishNationalId(value: string): boolean {
  if (!/^\d{11}$/.test(value) || value[0] === "0") return false;
  const digits = value.split("").map(Number);
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!;
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!;
  return (
    (odd * 7 - even) % 10 === digits[9] &&
    digits.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === digits[10]
  );
}

export function maskTurkishNationalId(value: string | null | undefined): string | null {
  const normalized = normalizeTurkishNationalId(value);
  return normalized ? `${normalized.slice(0, 3)}******${normalized.slice(-2)}` : null;
}

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const turkishPhoneSchema = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .refine(isValidTurkishPhone, "Geçerli bir Türkiye GSM numarası girin")
      .transform((value) => formatTurkishPhone(value)!),
  )
  .nullable()
  .optional();

export const turkishNationalIdSchema = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{11}$/, "TC Kimlik No 11 haneli olmalı")
      .refine(isValidTurkishNationalId, "Geçerli bir TC Kimlik No girin")
      .transform((value) => value),
  )
  .nullable()
  .optional();
