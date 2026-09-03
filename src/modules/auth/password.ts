import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
}

const KEY_LENGTH = 64;

/**
 * Node built-in `crypto.scrypt` ile parola hash'i. Ek bağımlılık gerektirmez.
 * Format: `scrypt$<salt base64>$<hash base64>` — salt her hash için tazedir.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const salt = Buffer.from(parts[1] ?? "", "base64");
    const expected = Buffer.from(parts[2] ?? "", "base64");
    if (salt.length === 0 || expected.length === 0) {
      return false;
    }
    const actual = await scryptAsync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
