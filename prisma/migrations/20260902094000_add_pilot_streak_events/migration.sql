-- 8G-10 pilot readiness: explicit habit events for streak KPI reporting.
ALTER TYPE "PilotEventType" ADD VALUE 'STREAK_STARTED';
ALTER TYPE "PilotEventType" ADD VALUE 'STREAK_CONTINUED';
