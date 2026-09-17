-- Release 0.6 canonical schema reconciliation.
--
-- The Achievement metadata is part of the application contract. This forward
-- migration is deliberately additive: it creates missing metadata objects,
-- validates existing objects, and fails closed on incompatible state. It does
-- not rewrite historical migrations or backfill application data.

DO $$
DECLARE
  v_type_kind "char";
  v_labels TEXT[];
BEGIN
  SELECT t.typtype
  INTO v_type_kind
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'AchievementCategory';

  IF NOT FOUND THEN
    CREATE TYPE public."AchievementCategory" AS ENUM (
      'TRAINING',
      'READING',
      'COMPREHENSION',
      'CONSISTENCY',
      'MILESTONE'
    );
  ELSIF v_type_kind <> 'e' THEN
    RAISE EXCEPTION 'AchievementCategory exists but is not an enum';
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'AchievementCategory';

    IF v_labels IS DISTINCT FROM ARRAY[
      'TRAINING',
      'READING',
      'COMPREHENSION',
      'CONSISTENCY',
      'MILESTONE'
    ]::TEXT[] THEN
      RAISE EXCEPTION 'AchievementCategory enum labels are incompatible';
    END IF;
  END IF;

  SELECT t.typtype
  INTO v_type_kind
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'AchievementKind';

  IF NOT FOUND THEN
    CREATE TYPE public."AchievementKind" AS ENUM ('BADGE', 'TROPHY');
  ELSIF v_type_kind <> 'e' THEN
    RAISE EXCEPTION 'AchievementKind exists but is not an enum';
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'AchievementKind';

    IF v_labels IS DISTINCT FROM ARRAY['BADGE', 'TROPHY']::TEXT[] THEN
      RAISE EXCEPTION 'AchievementKind enum labels are incompatible';
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  v_type_ok BOOLEAN;
  v_not_null BOOLEAN;
  v_default TEXT;
BEGIN
  IF to_regclass('public."Badge"') IS NULL THEN
    RAISE EXCEPTION 'Badge table is required for Release 0.6 reconciliation';
  END IF;

  SELECT a.atttypid = 'public."AchievementCategory"'::regtype,
         a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid)
  INTO v_type_ok, v_not_null, v_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname = 'Badge'
    AND a.attname = 'category'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public."Badge"
      ADD COLUMN "category" public."AchievementCategory"
      NOT NULL DEFAULT 'TRAINING';
  ELSIF NOT v_type_ok
     OR NOT v_not_null
     OR v_default IS NULL
     OR position('TRAINING' IN v_default) = 0 THEN
    RAISE EXCEPTION 'Badge.category is incompatible with the canonical schema';
  END IF;

  SELECT a.atttypid = 'public."AchievementKind"'::regtype,
         a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid)
  INTO v_type_ok, v_not_null, v_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname = 'Badge'
    AND a.attname = 'kind'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public."Badge"
      ADD COLUMN "kind" public."AchievementKind"
      NOT NULL DEFAULT 'BADGE';
  ELSIF NOT v_type_ok
     OR NOT v_not_null
     OR v_default IS NULL
     OR position('BADGE' IN v_default) = 0 THEN
    RAISE EXCEPTION 'Badge.kind is incompatible with the canonical schema';
  END IF;

  SELECT a.atttypid = 'pg_catalog.int4'::regtype,
         a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid)
  INTO v_type_ok, v_not_null, v_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname = 'Badge'
    AND a.attname = 'targetValue'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public."Badge" ADD COLUMN "targetValue" INTEGER;
  ELSIF NOT v_type_ok OR v_not_null OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'Badge.targetValue is incompatible with the canonical schema';
  END IF;
END $$;

DO $$
DECLARE
  v_category_attnum SMALLINT;
  v_status_attnum SMALLINT;
  v_display_order_attnum SMALLINT;
  v_same_key BOOLEAN;
  v_exact BOOLEAN;
BEGIN
  SELECT MAX(a.attnum) FILTER (WHERE a.attname = 'category'),
         MAX(a.attnum) FILTER (WHERE a.attname = 'status'),
         MAX(a.attnum) FILTER (WHERE a.attname = 'displayOrder')
  INTO v_category_attnum, v_status_attnum, v_display_order_attnum
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'Badge'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_category_attnum IS NULL
     OR v_status_attnum IS NULL
     OR v_display_order_attnum IS NULL THEN
    RAISE EXCEPTION 'Badge columns required for the canonical index are missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = 'public."Badge"'::regclass
      AND i.indnkeyatts = 3
      AND i.indnatts = 3
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indkey::TEXT = format(
        '%s %s %s',
        v_category_attnum,
        v_status_attnum,
        v_display_order_attnum
      )
  )
  INTO v_same_key;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = 'public."Badge"'::regclass
      AND NOT i.indisunique
      AND i.indnkeyatts = 3
      AND i.indnatts = 3
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indkey::TEXT = format(
        '%s %s %s',
        v_category_attnum,
        v_status_attnum,
        v_display_order_attnum
      )
  )
  INTO v_exact;

  IF v_exact THEN
    NULL;
  ELSIF v_same_key THEN
    RAISE EXCEPTION 'Badge canonical index exists with incompatible properties';
  ELSE
    CREATE INDEX "Badge_category_status_displayOrder_idx"
      ON public."Badge"("category", "status", "displayOrder");
  END IF;
END $$;
