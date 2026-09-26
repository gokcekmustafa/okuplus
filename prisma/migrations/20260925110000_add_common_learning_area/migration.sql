-- Release 0.7 P0: represent the shared reinforcement and measurement flow
-- as its own learning-path area. This migration is additive and does not
-- move, delete, or rewrite existing learning-path rows.

ALTER TYPE "LearningAreaCode" ADD VALUE IF NOT EXISTS 'COMMON';
