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

-- Only the verified Neon production runtime role needs explicit access.
REVOKE ALL ON FUNCTION public.readiness_has_incomplete_migrations() FROM PUBLIC;

-- Local and CI databases do not necessarily have the Neon role.
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT EXECUTE ON FUNCTION public.readiness_has_incomplete_migrations() TO neondb_owner;
  END IF;
END;
$grant$;
