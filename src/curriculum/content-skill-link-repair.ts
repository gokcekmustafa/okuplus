export type ContentSkillLink = { contentId: string; skillId: string };

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
