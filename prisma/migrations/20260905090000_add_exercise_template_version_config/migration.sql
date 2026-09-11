-- Training Engine Phase 1: freeze exercise behavior at TemplateVersion level.
--
-- The parent ExerciseTemplate.config remains available as catalog metadata for
-- compatibility, but runtime behavior must use ExerciseTemplateVersion.config.
-- Existing rows are copied once from the parent snapshot below.

ALTER TABLE "ExerciseTemplateVersion"
  ADD COLUMN "config" JSONB;

-- Prisma runs migrations in a transaction. Disable only the existing
-- ExerciseTemplateVersion immutability trigger for this migration-scoped
-- snapshot backfill; re-enable it before the transaction ends. No permanent
-- bypass or session-GUC exception is left behind.
ALTER TABLE "ExerciseTemplateVersion"
  DISABLE TRIGGER "trg_template_version_immutable";

UPDATE "ExerciseTemplateVersion" AS version
SET "config" = CASE
  WHEN template."config" IS NULL OR template."config" = 'null'::jsonb
    THEN '{}'::jsonb
  ELSE template."config"
END
FROM "ExerciseTemplate" AS template
WHERE version."templateId" = template."id"
  AND (version."config" IS NULL OR version."config" = 'null'::jsonb);

ALTER TABLE "ExerciseTemplateVersion"
  ENABLE TRIGGER "trg_template_version_immutable";
