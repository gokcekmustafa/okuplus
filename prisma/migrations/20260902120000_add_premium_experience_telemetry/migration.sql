-- 8H-2 premium experience: additive, non-payment product telemetry.
-- No billing provider, payment record, webhook or entitlement grant is created.
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PREMIUM_INFO_VIEWED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PREMIUM_CTA_CLICKED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'LIMIT_REACHED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PAYWALL_VIEWED';
