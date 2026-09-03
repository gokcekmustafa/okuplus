import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const IYZICO_SANDBOX_BASE_URL = "https://sandbox-api.iyzipay.com";

function hmacHex(message: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}

export function createIyzicoAuthorization(input: {
  apiKey: string;
  secretKey: string;
  uriPath: string;
  requestBody: string;
  randomKey?: string;
}): { authorization: string; randomKey: string } {
  const randomKey = input.randomKey ?? `${Date.now()}${randomBytes(12).toString("hex")}`;
  const signature = hmacHex(randomKey + input.uriPath + input.requestBody, input.secretKey);
  const authorizationString = `apiKey:${input.apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return {
    authorization: `IYZWSv2 ${Buffer.from(authorizationString, "utf8").toString("base64")}`,
    randomKey,
  };
}

export function createSubscriptionWebhookSignature(input: {
  merchantId: string;
  secretKey: string;
  eventType: string;
  subscriptionReferenceCode: string;
  orderReferenceCode: string;
  customerReferenceCode: string;
}): string {
  const message =
    input.secretKey +
    input.merchantId +
    input.eventType +
    input.subscriptionReferenceCode +
    input.orderReferenceCode +
    input.customerReferenceCode;
  return hmacHex(message, input.secretKey);
}

export function signaturesEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected.trim().toLowerCase(), "utf8");
  const right = Buffer.from(actual.trim().toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getIyzicoHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1];
}
