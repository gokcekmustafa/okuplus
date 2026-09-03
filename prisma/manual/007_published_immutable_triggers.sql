-- ============================================================
-- 007 — PUBLISHED VERSION İMMUTABLE TRIGGER'LARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: ContentVersion / QuestionVersion / ExerciseTemplateVersion için
--       status = 'PUBLISHED' olan kayıtların UPDATE/DELETE edilmesini
--       DB seviyesinde engellemek (application kuralına defense-in-depth).
--       Değişiklik yeni bir version üretilerek yapılır.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_published_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'PUBLISHED version değiştirilemez veya silinemez. Yeni bir version oluşturulmalı.';
  END IF;
  RETURN NEW;
END;
$$;

-- ContentVersion
CREATE TRIGGER trg_content_version_immutable
  BEFORE UPDATE OR DELETE ON "ContentVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();

-- QuestionVersion
CREATE TRIGGER trg_question_version_immutable
  BEFORE UPDATE OR DELETE ON "QuestionVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();

-- ExerciseTemplateVersion
CREATE TRIGGER trg_template_version_immutable
  BEFORE UPDATE OR DELETE ON "ExerciseTemplateVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();