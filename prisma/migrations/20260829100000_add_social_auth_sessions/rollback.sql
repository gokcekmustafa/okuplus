-- Manuel rollback (yalnız deployment geri alma prosedürü için; Prisma bunu otomatik çalıştırmaz).
-- Önce uygulama eski sürüme alınmalı; aktif refresh session'lar geçersiz olur.
DROP TABLE IF EXISTS "AuthSession";
DROP TABLE IF EXISTS "AuthIdentity";
DROP TYPE IF EXISTS "AuthIdentityProvider";
