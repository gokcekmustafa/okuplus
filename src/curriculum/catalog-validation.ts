export type CurriculumCatalogKind = "PRODUCTION_CANDIDATE" | "TEST_FIXTURE";

export type CatalogRecordIdentity = {
  id: string;
  code: string;
  name: string;
};

const TEST_FIXTURE_MARKERS = [
  /(?:^|[-_\s])E2E(?:$|[-_\s])/iu,
  /LEARN(?:$|[-_\s])/iu,
  /EXUX(?:$|[-_\s])/iu,
  /8[de]-/iu,
  /(?:^|[-_\s])test(?:$|[-_\s])/iu,
  /fixture/iu,
  /seviye x/iu,
];

/**
 * Test katalog kayıtları schema'da ayrı bir tür taşımadığı için, repository'de
 * kararlaştırılmış açık E2E/fixture kimlik işaretleriyle sınıflandırılır.
 * Bu helper seed üretmez ve gerçek katalog kodu tahmin etmez.
 */
export function isTestFixtureCatalogRecord(record: CatalogRecordIdentity): boolean {
  return [record.id, record.code, record.name].some((value) =>
    TEST_FIXTURE_MARKERS.some((marker) => marker.test(value)),
  );
}

export function classifyCatalogRecord(record: CatalogRecordIdentity): CurriculumCatalogKind {
  return isTestFixtureCatalogRecord(record) ? "TEST_FIXTURE" : "PRODUCTION_CANDIDATE";
}

export function catalogFixtureReason(record: CatalogRecordIdentity): string | null {
  if (!isTestFixtureCatalogRecord(record)) return null;
  return `test fixture kimliği bulundu: ${record.code} / ${record.name} (${record.id})`;
}
