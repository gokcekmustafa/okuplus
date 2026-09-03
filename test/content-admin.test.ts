import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/**
 * İçerik Yönetimi (admin) testleri.
 *
 * Güvenlik: yalnızca platform yetkilileri (SUPER_ADMIN, CONTENT_EDITOR) erişir;
 * normal tenant kullanıcıları 403, kimliksiz istekler 401 alır.
 *
 * KAPSAM: tenantId NULL = GLOBAL katalog (platform yetkisiyle yönetilir);
 * tenantId dolu = kurum kataloğu (kurum var + soft-delete değil, aksi 404).
 *
 * SÜRÜM YAŞAM DÖNGÜSÜ: DRAFT → REVIEW → PUBLISHED.
 *  - PUBLISHED sürüm immutable: düzenlenemez (400); değişiklik yeni sürümle.
 *  - Publish → Content.currentVersionId + Content.status=PUBLISHED güncellenir.
 *  - wordCount body'den hesaplanır; readabilityScore boş kalır.
 *
 * İÇERİK DURUMU: PUBLISHED yayınlı sürüm ister; ARCHIVED DRAFT/PUBLISHED'tan;
 * DRAFT yalnızca ARCHIVED'tan geri alınır. Silme SOFT-DELETE (tarihçe korunur).
 *
 * KATALOG: Skill/Level salt global; kod unique (P2002→409); beceri
 * içerikte kullanılıyorsa silinemez (409).
 *
 * İzolasyon: yalnızca kendi 99999992-... ID'leri kullanılır; TRUNCATE yok;
 * demo/gerçek veriye dokunulmaz. Test verisi kendi deleteMany'iyle temizlenir.
 */

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

// Kullanıcılar
const SUPER_ADMIN_ID = "99999992-0000-7000-8000-000000000001";
const CONTENT_EDITOR_ID = "99999992-0000-7000-8000-000000000002";
const NORMAL_USER_ID = "99999992-0000-7000-8000-000000000003";

// Tenant'lar
const ORG_TENANT = "99999992-0000-7000-8000-0000000000b1";
const DELETED_TENANT = "99999992-0000-7000-8000-0000000000b2";

// Beceriler / Seviyeler
const SKILL_1 = "99999992-0000-7000-8000-0000000000a1";
const SKILL_2 = "99999992-0000-7000-8000-0000000000a2";
const SKILL_UNUSED = "99999992-0000-7000-8000-0000000000a3";
const LEVEL_1 = "99999992-0000-7000-8000-0000000000c1";
const LEVEL_2 = "99999992-0000-7000-8000-0000000000c2";

// Sabit içerikler (liste/filtre testleri için)
const GLOBAL_CONTENT = "99999992-0000-7000-8000-0000000000f1";
const TENANT_CONTENT = "99999992-0000-7000-8000-0000000000f2";

const SUPER_ADMIN_EMAIL = "content-super@example.com";
const CONTENT_EDITOR_EMAIL = "content-editor@example.com";
const NORMAL_EMAIL = "content-tenant-user@example.com";

const USER_IDS = [SUPER_ADMIN_ID, CONTENT_EDITOR_ID, NORMAL_USER_ID];
const TENANT_IDS = [ORG_TENANT, DELETED_TENANT];
const EMAILS = [SUPER_ADMIN_EMAIL, CONTENT_EDITOR_EMAIL, NORMAL_EMAIL];
const FIXED_CONTENT_IDS = [GLOBAL_CONTENT, TENANT_CONTENT];
const FIXED_SKILL_IDS = [SKILL_1, SKILL_2, SKILL_UNUSED];
const FIXED_LEVEL_IDS = [LEVEL_1, LEVEL_2];

/**
 * Yalnızca bu testin sahip olduğu içerik satırlarını siler (hedefli deleteMany;
 * TRUNCATE yok, demo/gerçek veriye dokunulmaz). Test kullanıcılarıyla
 * (createdById) veya test tenant'larıyla ilişkili tüm Content/ContentVersion/
 * ContentSkill'leri kapsar — API ile üretilen (rastgele UUID'li) kayıtlar dahil.
 *
 * PUBLISHED ContentVersion'lar `manual/007` immutable trigger'ı nedeniyle
 * normal yollarla silinemez. Bu nedenle temizlik transaction'ında yalnızca bu
 * testin kendi satırlarına özel `session_replication_role = replica` ile
 * trigger bypass edilir (DB integrity'si yalnızca test verisi silinirken aşılır).
 */
async function deleteTestContent(): Promise<void> {
  const rows = await prisma.content.findMany({
    where: {
      OR: [
        { id: { in: FIXED_CONTENT_IDS } },
        { createdById: { in: USER_IDS } },
        { tenantId: { in: TENANT_IDS } },
      ],
    },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.contentSkill.deleteMany({ where: { contentId: { in: ids } } });
    await tx.contentVersion.deleteMany({ where: { contentId: { in: ids } } });
    await tx.content.deleteMany({ where: { id: { in: ids } } });
  });
}

describe("content admin", () => {
  let app: FastifyInstance;

  const createdContentIds: string[] = [...FIXED_CONTENT_IDS];
  const createdSkillIds: string[] = [...FIXED_SKILL_IDS];
  const createdLevelIds: string[] = [...FIXED_LEVEL_IDS];

  beforeAll(async () => {
    await prisma.$connect();

    // Tekrar çalıştırmalarda kalıcı olabilecek kendi verisini hedefli temizle.
    await deleteTestContent();
    await prisma.skill.deleteMany({
      where: { code: { in: ["SKILL-1", "SKILL-2", "SKILL-3", "SKILL-4"] } },
    });
    await prisma.level.deleteMany({ where: { code: { in: ["LVL-1", "LVL-2", "LVL-3"] } } });
    await prisma.skill.deleteMany({ where: { id: { in: FIXED_SKILL_IDS } } });
    await prisma.level.deleteMany({ where: { id: { in: FIXED_LEVEL_IDS } } });
    await prisma.membership.deleteMany({
      where: { OR: [{ userId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });

    const passwordHash = await hasher.hash(PASSWORD);

    await prisma.user.createMany({
      data: [
        {
          id: SUPER_ADMIN_ID,
          email: SUPER_ADMIN_EMAIL,
          displayName: "İçerik Super Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: CONTENT_EDITOR_ID,
          email: CONTENT_EDITOR_EMAIL,
          displayName: "İçerik Editörü",
          passwordHash,
          platformRole: "CONTENT_EDITOR",
        },
        {
          id: NORMAL_USER_ID,
          email: NORMAL_EMAIL,
          displayName: "İçerik Tenant Kullanıcı",
          passwordHash,
        },
      ],
    });

    await prisma.tenant.createMany({
      data: [
        { id: ORG_TENANT, type: "ORGANIZATION", name: "İçerik Test Okulu" },
        {
          id: DELETED_TENANT,
          type: "ORGANIZATION",
          name: "İçerik Silinen Okul",
          deletedAt: new Date(),
        },
      ],
    });

    await prisma.membership.createMany({
      data: [{ tenantId: ORG_TENANT, userId: NORMAL_USER_ID, role: "STUDENT", status: "ACTIVE" }],
    });

    await prisma.skill.createMany({
      data: [
        {
          id: SKILL_1,
          code: "SKILL-1",
          name: "Ana Fikir",
          category: "MAIN_IDEA",
          displayOrder: 1,
        },
        {
          id: SKILL_2,
          code: "SKILL-2",
          name: "Çıkarım",
          category: "INFERENCE",
          displayOrder: 2,
        },
        {
          id: SKILL_UNUSED,
          code: "SKILL-3",
          name: "Sözcük Bilgisi",
          category: "VOCABULARY",
          displayOrder: 3,
        },
      ],
    });

    await prisma.level.createMany({
      data: [
        {
          id: LEVEL_1,
          code: "LVL-1",
          name: "Başlangıç",
          minScore: 0,
          maxScore: 20,
          difficultyMin: 0,
          difficultyMax: 2,
          displayOrder: 1,
        },
        {
          id: LEVEL_2,
          code: "LVL-2",
          name: "Temel",
          minScore: 20,
          maxScore: 40,
          difficultyMin: 2,
          difficultyMax: 4,
          displayOrder: 2,
        },
      ],
    });

    // Sabit içerikler: global + kurum kapsamlı.
    await prisma.content.createMany({
      data: [
        {
          id: GLOBAL_CONTENT,
          tenantId: null,
          type: "PASSAGE",
          title: "Global Metin",
          difficulty: 0.4,
          status: "DRAFT",
        },
        {
          id: TENANT_CONTENT,
          tenantId: ORG_TENANT,
          type: "STORY",
          title: "Okul Hikayesi",
          difficulty: 0.6,
          status: "DRAFT",
        },
      ],
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();

    await prisma.studentBadge.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.pointEvent.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.studentStreak.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await deleteTestContent();
    await prisma.skill.deleteMany({ where: { id: { in: [...new Set(createdSkillIds)] } } });
    await prisma.level.deleteMany({ where: { id: { in: [...new Set(createdLevelIds)] } } });
    await prisma.membership.deleteMany({
      where: { OR: [{ userId: { in: USER_IDS } }, { tenantId: { in: TENANT_IDS } }] },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: { in: USER_IDS } }, { email: { in: EMAILS } }] },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
    await prisma.$disconnect();
  });

  async function login(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.tokens.accessToken as string;
  }

  const superAdminHeaders = async () => ({
    authorization: `Bearer ${await login(SUPER_ADMIN_EMAIL)}`,
  });
  const editorHeaders = async () => ({
    authorization: `Bearer ${await login(CONTENT_EDITOR_EMAIL)}`,
  });
  const tenantUserHeaders = async () => ({
    authorization: `Bearer ${await login(NORMAL_EMAIL)}`,
  });

  async function createContentViaApi(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
      payload,
    });
    expect(res.statusCode).toBe(200);
    const id = res.json().data.id as string;
    createdContentIds.push(id);
    return res.json().data;
  }

  async function createVersionViaApi(contentId: string, payload: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: `/admin/contents/${contentId}/versions`,
      headers: await superAdminHeaders(),
      payload,
    });
    expect(res.statusCode).toBe(200);
    return res.json().data;
  }

  // ---------- Güvenlik ----------

  it("Kimliksiz istek: 401 döner", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/contents" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("Normal tenant kullanıcısı: 403 döner (listeleme + oluşturma)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents",
      headers: await tenantUserHeaders(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");

    const res2 = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await tenantUserHeaders(),
      payload: { type: "PASSAGE", title: "X", difficulty: 0.5 },
    });
    expect(res2.statusCode).toBe(403);
  });

  it("CONTENT_EDITOR kataloğa erişebilir ve global içerik oluşturabilir", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents",
      headers: await editorHeaders(),
    });
    expect(res.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await editorHeaders(),
      payload: { type: "POEM", title: "Editör Şiiri", difficulty: 0.3 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().data.tenantId).toBeNull();
    createdContentIds.push(created.json().data.id);
  });

  it("Geçersiz status query: 400 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents?status=GECE",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // ---------- İçerik oluşturma / doğrulama ----------

  it("Global içerik oluşturur (tenantId boş bırakılır)", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Yeni Global Metin",
      difficulty: 0.5,
    });
    expect(created.tenantId).toBeNull();
    expect(created.type).toBe("PASSAGE");
    expect(created.status).toBe("DRAFT");
    expect(created.versionCount).toBe(0);
    expect(created.currentVersionNumber).toBeNull();
  });

  it("Kurum kapsamlı içerik oluşturur", async () => {
    const created = await createContentViaApi({
      tenantId: ORG_TENANT,
      type: "ARTICLE",
      title: "Okul Makalesi",
      difficulty: 0.7,
    });
    expect(created.tenantId).toBe(ORG_TENANT);
    expect(created.tenantName).toBe("İçerik Test Okulu");
  });

  it("Silinmiş kuruma içerik oluşturulamaz: 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
      payload: { tenantId: DELETED_TENANT, type: "PASSAGE", title: "X", difficulty: 0.5 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("Geçersiz gövde: 400 döner (başlık zorunlu, zorluk 0-1 aralığında)", async () => {
    const noTitle = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
      payload: { type: "PASSAGE", difficulty: 0.5 },
    });
    expect(noTitle.statusCode).toBe(400);

    const badDifficulty = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
      payload: { type: "PASSAGE", title: "X", difficulty: 1.5 },
    });
    expect(badDifficulty.statusCode).toBe(400);

    const badType = await app.inject({
      method: "POST",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
      payload: { type: "GECE", title: "X", difficulty: 0.5 },
    });
    expect(badType.statusCode).toBe(400);
  });

  it("Var olmayan içerik: 404 döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents/99999992-0000-7000-8000-0000000000ff",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------- Liste / filtre / detay ----------

  it("İçerikleri listeler (global + kurum)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(4);
    const ids = body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(GLOBAL_CONTENT);
    expect(ids).toContain(TENANT_CONTENT);
  });

  it("scope=GLOBAL yalnızca global içerikleri döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents?scope=GLOBAL",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as Array<{ tenantId: string | null }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId === null)).toBe(true);
  });

  it("scope=TENANT yalnızca kurum içeriklerini döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents?scope=TENANT",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as Array<{ tenantId: string | null }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId !== null)).toBe(true);
  });

  it("tenantId filtresi kurum içeriklerini döner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/contents?tenantId=${ORG_TENANT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items as Array<{ tenantId: string | null }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId === ORG_TENANT)).toBe(true);
  });

  it("type ve search filtreleri çalışır", async () => {
    const byType = await app.inject({
      method: "GET",
      url: "/admin/contents?type=STORY",
      headers: await superAdminHeaders(),
    });
    expect(byType.statusCode).toBe(200);
    const stories = byType.json().data.items as Array<{ type: string }>;
    expect(stories.every((i) => i.type === "STORY")).toBe(true);

    const bySearch = await app.inject({
      method: "GET",
      url: "/admin/contents?search=Global",
      headers: await superAdminHeaders(),
    });
    expect(bySearch.statusCode).toBe(200);
    const found = bySearch.json().data.items as Array<{ title: string }>;
    expect(found.some((i) => i.title.includes("Global"))).toBe(true);
  });

  it("Sayfalama çalışır", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/contents?page=1&pageSize=2",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items.length).toBe(2);
    expect(res.json().data.page).toBe(1);
    expect(res.json().data.pageSize).toBe(2);
  });

  it("Detay: currentVersion null ve beceriler boştur", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/contents/${TENANT_CONTENT}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json().data;
    expect(detail.currentVersion).toBeNull();
    expect(detail.skills).toEqual([]);
  });

  // ---------- İçerik düzenleme / durum ----------

  it("İçerik başlık ve zorluk güncellenir", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Düzenlenecek",
      difficulty: 0.2,
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
      payload: { title: "Düzenlendi", difficulty: 0.8 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe("Düzenlendi");
    expect(res.json().data.difficulty).toBe(0.8);
  });

  it("Yayınlı sürümü olmayan içerik PUBLISHED yapılamaz: 400", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Sürümsüz İçerik",
      difficulty: 0.5,
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/contents/${created.id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "PUBLISHED" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("sürüm");
  });

  it("İçerik arşivlenebilir ve arşivden taslağa alınabilir", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Arşivlenecek",
      difficulty: 0.5,
    });
    const archived = await app.inject({
      method: "PATCH",
      url: `/admin/contents/${created.id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "ARCHIVED" },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().data.status).toBe("ARCHIVED");

    const backToDraft = await app.inject({
      method: "PATCH",
      url: `/admin/contents/${created.id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "DRAFT" },
    });
    expect(backToDraft.statusCode).toBe(200);
    expect(backToDraft.json().data.status).toBe("DRAFT");
  });

  it("Yayınlanmış içerik taslağa alınamaz (geçersiz geçiş): 400", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Geçiş Testi",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "metin" });
    await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/contents/${created.id}/status`,
      headers: await superAdminHeaders(),
      payload: { status: "DRAFT" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(res.json().error.message).toContain("arşivlenmiş");
  });

  // ---------- Sürüm yaşam döngüsü ----------

  it("Yeni sürüm oluşturur: DRAFT, version 1, wordCount hesaplanır", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Sürüm Testi",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, {
      body: "Merhaba dünya",
      changelog: "İlk sürüm",
    });
    expect(version.version).toBe(1);
    expect(version.status).toBe("DRAFT");
    expect(version.wordCount).toBe(2);
    expect(version.body).toBe("Merhaba dünya");
    expect(version.changelog).toBe("İlk sürüm");
    expect(version.readabilityScore).toBeNull();
  });

  it("Sürüm numarası sırayla artar", async () => {
    const created = await createContentViaApi({
      type: "STORY",
      title: "Çok Sürümlü",
      difficulty: 0.5,
    });
    const v1 = await createVersionViaApi(created.id, { body: "Birinci metin" });
    const v2 = await createVersionViaApi(created.id, { body: "İkinci metin" });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });

  it("Taslak sürüm düzenlenebilir; wordCount yeniden hesaplanır", async () => {
    const created = await createContentViaApi({
      type: "POEM",
      title: "Şiir",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "bir iki üç" });
    expect(version.wordCount).toBe(3);

    const updated = await app.inject({
      method: "PATCH",
      url: `/admin/content-versions/${version.id}`,
      headers: await superAdminHeaders(),
      payload: { body: "bir iki üç dört", title: "Şiir (güncel)" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.wordCount).toBe(4);
    expect(updated.json().data.title).toBe("Şiir (güncel)");
  });

  it("DRAFT → REVIEW geçişi yapılır", async () => {
    const created = await createContentViaApi({
      type: "ARTICLE",
      title: "İnceleme Akışı",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "İnceleme metni" });

    const reviewed = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/review`,
      headers: await superAdminHeaders(),
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().data.status).toBe("REVIEW");
  });

  it("Taslak olmayan sürüm incelemeye alınamaz: 400", async () => {
    const created = await createContentViaApi({
      type: "ARTICLE",
      title: "İnceleme Kuralı",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "metin" });

    const reviewed = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/review`,
      headers: await superAdminHeaders(),
    });
    expect(reviewed.statusCode).toBe(200);

    const again = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/review`,
      headers: await superAdminHeaders(),
    });
    expect(again.statusCode).toBe(400);
  });

  it("Publish: sürüm PUBLISHED + publishedAt, içerik currentVersionId + PUBLISHED", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Yayın Akışı",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "Yayınlanacak metin" });

    const published = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });
    expect(published.statusCode).toBe(200);
    const publishedData = published.json().data;
    expect(publishedData.status).toBe("PUBLISHED");
    expect(publishedData.publishedAt).not.toBeNull();

    const detail = await app.inject({
      method: "GET",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
    });
    const content = detail.json().data;
    expect(content.status).toBe("PUBLISHED");
    expect(content.currentVersionId).toBe(version.id);
    expect(content.currentVersionNumber).toBe(1);
  });

  it("Yayınlanmış sürüm yeniden yayınlanamaz: 400", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Çift Yayın",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "metin" });
    const published = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });
    expect(published.statusCode).toBe(200);

    const again = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.message).toContain("zaten yayınlanmış");
  });

  it("Yayınlanmış sürüm düzenlenemez: 400", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Immutable Test",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "metin" });
    const published = await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });
    expect(published.statusCode).toBe(200);

    const updated = await app.inject({
      method: "PATCH",
      url: `/admin/content-versions/${version.id}`,
      headers: await superAdminHeaders(),
      payload: { body: "değişiklik" },
    });
    expect(updated.statusCode).toBe(400);
    expect(updated.json().error.message).toContain("Yayınlanmış sürüm düzenlenemez");
  });

  it("Yayın sonrası yeni sürüm oluşturulabilir (version 2)", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Güncelleme Akışı",
      difficulty: 0.5,
    });
    const v1 = await createVersionViaApi(created.id, { body: "İlk sürüm" });
    await app.inject({
      method: "POST",
      url: `/admin/content-versions/${v1.id}/publish`,
      headers: await superAdminHeaders(),
    });

    const v2 = await createVersionViaApi(created.id, { body: "İkinci sürüm" });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("DRAFT");

    const versionsRes = await app.inject({
      method: "GET",
      url: `/admin/contents/${created.id}/versions`,
      headers: await superAdminHeaders(),
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json().data as Array<{ version: number }>;
    expect(versions[0]!.version).toBe(2);
    expect(versions.length).toBe(2);
  });

  it("Sürüm detayı gövdeyi içerir", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Sürüm Detayı",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, {
      body: "Detay metni",
      license: "CC BY",
    });
    const res = await app.inject({
      method: "GET",
      url: `/admin/content-versions/${version.id}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.body).toBe("Detay metni");
    expect(res.json().data.license).toBe("CC BY");
  });

  // ---------- Beceri bağlantıları ----------

  it("İçeriğe beceri bağlanır ve detayda döner", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Becerili İçerik",
      difficulty: 0.5,
    });
    const res = await app.inject({
      method: "PUT",
      url: `/admin/contents/${created.id}/skills`,
      headers: await superAdminHeaders(),
      payload: { skillIds: [SKILL_1, SKILL_2] },
    });
    expect(res.statusCode).toBe(200);
    const skills = res.json().data.skills as Array<{ id: string; code: string }>;
    expect(skills.map((s) => s.id).sort()).toEqual([SKILL_1, SKILL_2].sort());
    expect(skills[0]!.code).toBeDefined();

    const filtered = await app.inject({
      method: "GET",
      url: `/admin/contents?skillId=${SKILL_1}`,
      headers: await superAdminHeaders(),
    });
    expect(filtered.statusCode).toBe(200);
    const items = filtered.json().data.items as Array<{ id: string }>;
    expect(items.some((i) => i.id === created.id)).toBe(true);
  });

  it("Beceri seti boşaltılabilir", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Beceri Temizleme",
      difficulty: 0.5,
    });
    await app.inject({
      method: "PUT",
      url: `/admin/contents/${created.id}/skills`,
      headers: await superAdminHeaders(),
      payload: { skillIds: [SKILL_1] },
    });
    const cleared = await app.inject({
      method: "PUT",
      url: `/admin/contents/${created.id}/skills`,
      headers: await superAdminHeaders(),
      payload: { skillIds: [] },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.skills).toEqual([]);
  });

  it("Var olmayan beceri bağlanamaz: 400", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Yanlış Beceri",
      difficulty: 0.5,
    });
    const res = await app.inject({
      method: "PUT",
      url: `/admin/contents/${created.id}/skills`,
      headers: await superAdminHeaders(),
      payload: { skillIds: ["99999992-0000-7000-8000-0000000000aa"] },
    });
    expect(res.statusCode).toBe(400);
  });

  // ---------- Beceri kataloğu ----------

  it("Beceri listelenir (arama + kategori)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/skills",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBeGreaterThanOrEqual(3);

    const byCategory = await app.inject({
      method: "GET",
      url: "/admin/skills?category=MAIN_IDEA",
      headers: await superAdminHeaders(),
    });
    const items = byCategory.json().data.items as Array<{ category: string }>;
    expect(items.every((i) => i.category === "MAIN_IDEA")).toBe(true);

    const bySearch = await app.inject({
      method: "GET",
      url: "/admin/skills?search=Fikir",
      headers: await superAdminHeaders(),
    });
    const found = bySearch.json().data.items as Array<{ name: string }>;
    expect(found.some((i) => i.name.includes("Fikir"))).toBe(true);
  });

  it("Yeni beceri oluşturulur; aynı kod çakışır: 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/skills",
      headers: await superAdminHeaders(),
      payload: {
        code: "SKILL-4",
        name: "Gerçek Bilgi",
        category: "FACTUAL",
        displayOrder: 4,
      },
    });
    expect(res.statusCode).toBe(200);
    createdSkillIds.push(res.json().data.id);

    const dup = await app.inject({
      method: "POST",
      url: "/admin/skills",
      headers: await superAdminHeaders(),
      payload: { code: "SKILL-4", name: "Diğer", category: "FACTUAL" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
  });

  it("Beceri güncellenir", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/skills/${SKILL_2}`,
      headers: await superAdminHeaders(),
      payload: { name: "Çıkarım Yapma", displayOrder: 9 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Çıkarım Yapma");
    expect(res.json().data.displayOrder).toBe(9);
  });

  it("Kullanılmayan beceri silinebilir", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/skills/${SKILL_UNUSED}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const remaining = await prisma.skill.count({ where: { id: SKILL_UNUSED } });
    expect(remaining).toBe(0);
  });

  it("İçerikte kullanılan beceri silinemez: 409", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Beceri Engeli",
      difficulty: 0.5,
    });
    await app.inject({
      method: "PUT",
      url: `/admin/contents/${created.id}/skills`,
      headers: await superAdminHeaders(),
      payload: { skillIds: [SKILL_1] },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/skills/${SKILL_1}`,
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  // ---------- Seviye kataloğu ----------

  it("Seviye listelenir", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/levels",
      headers: await superAdminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBeGreaterThanOrEqual(2);
  });

  it("Yeni seviye oluşturulur; geçersiz puan bandı: 400; aynı kod: 409", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/admin/levels",
      headers: await superAdminHeaders(),
      payload: {
        code: "LVL-3",
        name: "İleri",
        minScore: 40,
        maxScore: 70,
        difficultyMin: 4,
        difficultyMax: 6,
        displayOrder: 3,
      },
    });
    expect(ok.statusCode).toBe(200);
    createdLevelIds.push(ok.json().data.id);

    const badBand = await app.inject({
      method: "POST",
      url: "/admin/levels",
      headers: await superAdminHeaders(),
      payload: {
        code: "LVL-4",
        name: "Hatalı",
        minScore: 50,
        maxScore: 10,
        difficultyMin: 0,
        difficultyMax: 1,
      },
    });
    expect(badBand.statusCode).toBe(400);

    const dup = await app.inject({
      method: "POST",
      url: "/admin/levels",
      headers: await superAdminHeaders(),
      payload: {
        code: "LVL-3",
        name: "Kopya",
        minScore: 0,
        maxScore: 10,
        difficultyMin: 0,
        difficultyMax: 1,
      },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("Seviye güncellenir ve silinebilir", async () => {
    const updated = await app.inject({
      method: "PATCH",
      url: `/admin/levels/${LEVEL_1}`,
      headers: await superAdminHeaders(),
      payload: { name: "Başlangıç (Güncel)", gradeBand: "1-2" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.name).toBe("Başlangıç (Güncel)");
    expect(updated.json().data.gradeBand).toBe("1-2");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/admin/levels/${LEVEL_2}`,
      headers: await superAdminHeaders(),
    });
    expect(deleted.statusCode).toBe(200);
  });

  // ---------- Soft-delete ----------

  it("Yayınlı içerik soft-delete edilebilir; sürüm geçmişi korunur", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Silinecek Yayın",
      difficulty: 0.5,
    });
    const version = await createVersionViaApi(created.id, { body: "Silinecek metin" });
    await app.inject({
      method: "POST",
      url: `/admin/content-versions/${version.id}/publish`,
      headers: await superAdminHeaders(),
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data.deletedAt).not.toBeNull();

    // Sürüm geçmişi fiziksel olarak korunur.
    const versionRows = await prisma.contentVersion.count({
      where: { contentId: created.id },
    });
    expect(versionRows).toBe(1);

    const getAfterDelete = await app.inject({
      method: "GET",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
    });
    expect(getAfterDelete.statusCode).toBe(404);
  });

  it("Zaten silinmiş içerik tekrar silinemez: 404", async () => {
    const created = await createContentViaApi({
      type: "PASSAGE",
      title: "Çift Silme",
      difficulty: 0.5,
    });
    await app.inject({
      method: "DELETE",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
    });
    const again = await app.inject({
      method: "DELETE",
      url: `/admin/contents/${created.id}`,
      headers: await superAdminHeaders(),
    });
    expect(again.statusCode).toBe(404);
  });
});
