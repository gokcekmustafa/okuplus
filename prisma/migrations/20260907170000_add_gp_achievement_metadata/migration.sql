-- GP/achievement V1 metadata and daily training completion event.
-- This artifact is intentionally not applied in this task.

CREATE TYPE "AchievementCategory" AS ENUM (
  'TRAINING',
  'READING',
  'COMPREHENSION',
  'CONSISTENCY',
  'MILESTONE'
);

CREATE TYPE "AchievementKind" AS ENUM ('BADGE', 'TROPHY');

ALTER TYPE "PointEventType" ADD VALUE 'TRAINING_SESSION_COMPLETED' BEFORE 'CORRECT_ANSWER';

ALTER TABLE "Badge"
  ADD COLUMN "category" "AchievementCategory" NOT NULL DEFAULT 'TRAINING',
  ADD COLUMN "kind" "AchievementKind" NOT NULL DEFAULT 'BADGE',
  ADD COLUMN "targetValue" INTEGER;

CREATE INDEX "Badge_category_status_displayOrder_idx"
  ON "Badge"("category", "status", "displayOrder");
