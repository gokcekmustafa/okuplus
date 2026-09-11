export type PublishedPlacementAssessmentWhere = {
  deletedAt: null;
  status: "PUBLISHED";
  type: "PLACEMENT";
  OR: Array<{ tenantId: string | null }>;
};

/**
 * Öğrenciye yalnız silinmemiş, yayınlanmış placement Assessment'ları gösterir.
 * NULL tenant global Assessment'tır; aktif tenant varsa global + aktif tenant
 * kapsamı görünür. Başka tipteki published Assessment'lara fallback yoktur.
 */
export function buildPublishedPlacementAssessmentWhere(
  tenantId: string | null,
): PublishedPlacementAssessmentWhere {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    type: "PLACEMENT",
    OR: tenantId === null ? [{ tenantId: null }] : [{ tenantId: null }, { tenantId }],
  };
}
