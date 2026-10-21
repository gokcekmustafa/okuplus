-- Expose only the readiness bit needed by the application role. The function
-- owner (the migration role) reads Prisma's private migration ledger.
CREATE FUNCTION public.readiness_has_incomplete_migrations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."_prisma_migrations" AS migration
    WHERE migration."finished_at" IS NULL
      AND migration."rolled_back_at" IS NULL
  )
$function$;

-- Do not make the status function callable by every database role. A narrowly
-- scoped EXECUTE grant must be added only after the runtime role is verified.
REVOKE ALL ON FUNCTION public.readiness_has_incomplete_migrations() FROM PUBLIC;
