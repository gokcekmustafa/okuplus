-- ============================================================
-- 008 — TENANT COMPATIBILITY TRIGGER'LARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Bir ORGANIZATION'a ait ExerciseTemplateVersion'ın başka bir tenant'a
--       ait ContentVersion / QuestionVersion referanslamasını DB seviyesinde
--       engellemek.
--
-- Kural: İçerik/soru global ise (tenant_id NULL) herkes kullanabilir.
--        İçerik/soru tenant'lı ise, şablon ya global (NULL) ya da AYNI tenant
--        olmalıdır. Farklı tenant -> hata.
--
-- NOT: RLS, çapraz tenant görünürlüğünü zaten engeller; bu trigger ek
--      bütünlük garantisidir (data integrity, güvenlik değil).
-- ============================================================

CREATE OR REPLACE FUNCTION check_template_tenant_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_tenant TEXT;
  v_item_tenant     TEXT;
BEGIN
  -- Şablonun tenant'ı
  SELECT t."tenantId" INTO v_template_tenant
  FROM "ExerciseTemplateVersion" etv
  JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
  WHERE etv."id" = NEW."templateVersionId";

  -- Bu trigger içerik (ContentVersion) bağlantısı için çağrılır;
  -- bağlanan içeriğin tenant'ı Content üzerinden bulunur.
  SELECT c."tenantId" INTO v_item_tenant
  FROM "ContentVersion" cv
  JOIN "Content" c ON c."id" = cv."contentId"
  WHERE cv."id" = NEW."contentVersionId";

  IF v_template_tenant IS NOT NULL AND v_item_tenant IS NOT NULL
     AND v_template_tenant <> v_item_tenant THEN
    RAISE EXCEPTION 'Başka tenant''a ait içerik bu şablona eklenemez';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_content_tenant
  BEFORE INSERT OR UPDATE ON "ExerciseTemplateVersionContent"
  FOR EACH ROW
  EXECUTE FUNCTION check_template_tenant_compatibility();

-- ------------------------------------------------------------------
-- Question bağlantısı için ayrı fonksiyon (Question -> Content zinciri)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_template_question_tenant_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_tenant TEXT;
  v_item_tenant     TEXT;
BEGIN
  SELECT t."tenantId" INTO v_template_tenant
  FROM "ExerciseTemplateVersion" etv
  JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
  WHERE etv."id" = NEW."templateVersionId";

  SELECT c."tenantId" INTO v_item_tenant
  FROM "QuestionVersion" qv
  JOIN "Question" q ON q."id" = qv."questionId"
  JOIN "Content" c ON c."id" = q."contentId"
  WHERE qv."id" = NEW."questionVersionId";

  IF v_template_tenant IS NOT NULL AND v_item_tenant IS NOT NULL
     AND v_template_tenant <> v_item_tenant THEN
    RAISE EXCEPTION 'Başka tenant''a ait soru bu şablona eklenemez';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_question_tenant
  BEFORE INSERT OR UPDATE ON "ExerciseTemplateVersionQuestion"
  FOR EACH ROW
  EXECUTE FUNCTION check_template_question_tenant_compatibility();