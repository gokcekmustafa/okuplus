export type ContentSkillLink = { contentId: string; skillId: string };

export type ResolvedContentSkillSource = ContentSkillLink & {
  skillCode: string;
  pathCode: string;
  sourceStationKey: string;
  contentKey: string;
  reason: string;
};

export type ExistingContentSkillLink = ContentSkillLink & { skillCode: string | null };

export type ContentSkillPlan = {
  expectedUniquePairCount: number;
  missingPairs: Array<{
    contentId: string;
    skillId: string;
    skillCode: string;
    sourceReferences: Array<{
      pathCode: string;
      sourceStationKey: string;
      contentKey: string;
      reason: string;
    }>;
  }>;
  unexpectedRelations: Array<{
    contentId: string;
    skillId: string;
    skillCode: string | null;
    reason: "EXISTING_RELATION_NOT_IN_SOURCE_PLAN";
  }>;
  decision: "PLAN_ONLY_READY" | "STOP_CONFLICT" | "STOP_UNRESOLVED_SOURCE_LINK";
};

export type ContentSkillLinkComparison = {
  state: "COMPLETE" | "MISSING" | "CONFLICT";
  missingLinks: ContentSkillLink[];
  unexpectedLinks: ContentSkillLink[];
};

export interface ContentSkillLinkStore {
  findMany(args: {
    where: { contentId: { in: string[] } };
    select: { contentId: true; skillId: true };
  }): Promise<ContentSkillLink[]>;
  createMany(args: { data: ContentSkillLink[]; skipDuplicates: true }): Promise<{ count: number }>;
}

function linkKey(link: ContentSkillLink): string {
  return JSON.stringify([link.contentId, link.skillId]);
}

/**
 * Builds a deduplicated, read-only repair plan. Existing rows are never
 * included among missing pairs; any relation outside the source mapping makes
 * the plan non-applicable until reviewed.
 */
export function buildContentSkillPlan(
  sourceTargets: readonly ResolvedContentSkillSource[],
  existingLinks: readonly ExistingContentSkillLink[],
  unresolvedSourceCount = 0,
): ContentSkillPlan {
  const expected = new Map<string, ResolvedContentSkillSource[]>();
  for (const target of sourceTargets) {
    const key = linkKey(target);
    const sources = expected.get(key) ?? [];
    sources.push(target);
    expected.set(key, sources);
  }
  const existingByKey = new Map(existingLinks.map((link) => [linkKey(link), link]));
  const plannedContentIds = new Set(sourceTargets.map(({ contentId }) => contentId));
  const missingPairs = [...expected]
    .filter(([key]) => !existingByKey.has(key))
    .map(([key, sources]) => {
      const [contentId, skillId] = JSON.parse(key) as [string, string];
      const first = sources[0]!;
      return {
        contentId,
        skillId,
        skillCode: first.skillCode,
        sourceReferences: [
          ...new Map(
            sources.map((source) => [
              JSON.stringify([
                source.pathCode,
                source.sourceStationKey,
                source.contentKey,
                source.reason,
              ]),
              {
                pathCode: source.pathCode,
                sourceStationKey: source.sourceStationKey,
                contentKey: source.contentKey,
                reason: source.reason,
              },
            ]),
          ).values(),
        ],
      };
    });
  const unexpectedRelations = existingLinks
    .filter((link) => plannedContentIds.has(link.contentId) && !expected.has(linkKey(link)))
    .map((link) => ({
      contentId: link.contentId,
      skillId: link.skillId,
      skillCode: link.skillCode,
      reason: "EXISTING_RELATION_NOT_IN_SOURCE_PLAN" as const,
    }));
  const uniqueUnexpected = [
    ...new Map(unexpectedRelations.map((link) => [linkKey(link), link])).values(),
  ];

  return {
    expectedUniquePairCount: expected.size,
    missingPairs,
    unexpectedRelations: uniqueUnexpected,
    decision:
      uniqueUnexpected.length > 0
        ? "STOP_CONFLICT"
        : unresolvedSourceCount > 0
          ? "STOP_UNRESOLVED_SOURCE_LINK"
          : "PLAN_ONLY_READY",
  };
}

/**
 * Compare only source-authorized ContentSkill relations. Missing expected links
 * are additive repairs; unexpected links remain conflicts and are never removed.
 */
export function compareContentSkillLinks(
  expectedLinks: readonly ContentSkillLink[],
  existingLinks: readonly ContentSkillLink[],
): ContentSkillLinkComparison {
  const expectedByKey = new Map(expectedLinks.map((link) => [linkKey(link), link]));
  const existingByKey = new Map(existingLinks.map((link) => [linkKey(link), link]));
  const missingLinks = [...expectedByKey]
    .filter(([key]) => !existingByKey.has(key))
    .map(([, link]) => link);
  const unexpectedLinks = [...existingByKey]
    .filter(([key]) => !expectedByKey.has(key))
    .map(([, link]) => link);

  return {
    state:
      unexpectedLinks.length > 0 ? "CONFLICT" : missingLinks.length > 0 ? "MISSING" : "COMPLETE",
    missingLinks,
    unexpectedLinks,
  };
}

export function expectedContentSkillLinks(
  plans: readonly {
    contentId: string;
    curriculumSkills: readonly { id: string }[];
  }[],
): ContentSkillLink[] {
  return [
    ...new Map(
      plans.flatMap((plan) =>
        plan.curriculumSkills.map((skill) => {
          const link = { contentId: plan.contentId, skillId: skill.id };
          return [linkKey(link), link] as const;
        }),
      ),
    ).values(),
  ];
}

export async function inspectContentSkillLinks(
  store: Pick<ContentSkillLinkStore, "findMany">,
  expectedLinks: readonly ContentSkillLink[],
): Promise<ContentSkillLinkComparison> {
  const contentIds = [...new Set(expectedLinks.map((link) => link.contentId))];
  if (contentIds.length === 0) return compareContentSkillLinks(expectedLinks, []);
  const existing = await store.findMany({
    where: { contentId: { in: contentIds } },
    select: { contentId: true, skillId: true },
  });
  return compareContentSkillLinks(expectedLinks, existing);
}

/** Adds only absent source links, re-reads them, and never repairs extras by deletion. */
export async function ensureContentSkillLinks(
  store: ContentSkillLinkStore,
  expectedLinks: readonly ContentSkillLink[],
): Promise<{ state: "COMPLETE" | "CONFLICT"; insertedCount: number }> {
  const initial = await inspectContentSkillLinks(store, expectedLinks);
  if (initial.state === "CONFLICT") return { state: "CONFLICT", insertedCount: 0 };
  if (initial.missingLinks.length === 0) return { state: "COMPLETE", insertedCount: 0 };

  const inserted = await store.createMany({ data: initial.missingLinks, skipDuplicates: true });
  const verified = await inspectContentSkillLinks(store, expectedLinks);
  if (verified.state !== "COMPLETE")
    throw new Error("ContentSkill source relation postcondition failed");
  return { state: "COMPLETE", insertedCount: inserted.count };
}
