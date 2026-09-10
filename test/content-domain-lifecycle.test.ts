import { describe, expect, it } from "vitest";
import {
  assertCanApprove,
  assertCanArchive,
  assertCanCreateDraft,
  assertCanEditDraft,
  assertCanPublish,
  assertCanRetire,
  assertCanSubmitForReview,
  assertLifecycleTransition,
  buildLifecycleAuditEntry,
  buildVersionCreatedAuditEntry,
  canTransitionLifecycle,
  isSelectablePublishedStatus,
  LifecyclePolicyError,
} from "../src/modules/contents/lifecycle.js";

describe("content/question lifecycle policy", () => {
  it("allows the forward lifecycle and preserves legacy archive recovery", () => {
    expect(canTransitionLifecycle("DRAFT", "REVIEW")).toBe(true);
    expect(canTransitionLifecycle("REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionLifecycle("APPROVED", "PUBLISHED")).toBe(true);
    expect(canTransitionLifecycle("PUBLISHED", "RETIRED")).toBe(true);
    expect(canTransitionLifecycle("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransitionLifecycle("PUBLISHED", "DRAFT")).toBe(false);
  });

  it("rejects lifecycle skips and reverse transitions", () => {
    expect(() => assertLifecycleTransition("CONTENT_VERSION", "DRAFT", "PUBLISHED")).toThrow(
      LifecyclePolicyError,
    );
    expect(() => assertLifecycleTransition("QUESTION_VERSION", "RETIRED", "PUBLISHED")).toThrow(
      LifecyclePolicyError,
    );
  });

  it("requires a reviewer role and prevents self-approval", () => {
    expect(() =>
      assertCanApprove({
        actorRole: "CONTENT_EDITOR",
        actorUserId: "editor",
        createdById: "author",
      }),
    ).toThrow("inceleme yetkisi");
    expect(() =>
      assertCanApprove({
        actorRole: "CONTENT_REVIEWER",
        actorUserId: "author",
        createdById: "author",
      }),
    ).toThrow("kendi içeriğini onaylayamaz");
    expect(() =>
      assertCanApprove({
        actorRole: "CONTENT_REVIEWER",
        actorUserId: "reviewer",
        createdById: "author",
      }),
    ).not.toThrow();
  });

  it("keeps authoring and review permissions separate", () => {
    expect(() =>
      assertCanCreateDraft({
        userId: "editor",
        tenantId: null,
        platformRole: "CONTENT_EDITOR",
      }),
    ).not.toThrow();
    expect(() =>
      assertCanCreateDraft({
        userId: "reviewer",
        tenantId: null,
        platformRole: "CONTENT_REVIEWER",
      }),
    ).toThrow();
    expect(() =>
      assertCanEditDraft(
        { userId: "editor", tenantId: null, platformRole: "CONTENT_EDITOR" },
        "another-editor",
      ),
    ).toThrow();
    expect(() =>
      assertCanSubmitForReview({
        userId: "support",
        tenantId: null,
        platformRole: "SUPPORT",
      }),
    ).toThrow();
  });

  it("publishes only approved content through the new policy", () => {
    expect(() => assertCanPublish({ actorRole: "CONTENT_REVIEWER", status: "REVIEW" })).toThrow(
      "onaylanmış",
    );
    expect(() =>
      assertCanPublish({ actorRole: "CONTENT_REVIEWER", status: "APPROVED" }),
    ).not.toThrow();
    expect(() => assertCanPublish({ actorRole: "CONTENT_EDITOR", status: "APPROVED" })).toThrow(
      "yayınlama yetkisi",
    );
  });

  it("retires published versions and excludes retired data from selection", () => {
    expect(() =>
      assertCanRetire({ actorRole: "CONTENT_REVIEWER", status: "PUBLISHED" }),
    ).not.toThrow();
    expect(() => assertCanRetire({ actorRole: "CONTENT_REVIEWER", status: "DRAFT" })).toThrow();
    expect(isSelectablePublishedStatus("PUBLISHED")).toBe(true);
    expect(isSelectablePublishedStatus("RETIRED")).toBe(false);
    expect(() =>
      assertCanArchive({ actorRole: "CONTENT_REVIEWER", status: "PUBLISHED" }),
    ).not.toThrow();
    expect(() => assertCanArchive({ actorRole: "CONTENT_EDITOR", status: "PUBLISHED" })).toThrow();
  });

  it("builds redacted, status-only audit entries", () => {
    expect(
      buildLifecycleAuditEntry({
        tenantId: null,
        actorUserId: "reviewer",
        entityType: "CONTENT_VERSION",
        entityId: "version-1",
        from: "REVIEW",
        to: "APPROVED",
      }),
    ).toEqual({
      tenantId: null,
      actorUserId: "reviewer",
      action: "APPROVED",
      entityType: "CONTENT_VERSION",
      entityId: "version-1",
      before: { status: "REVIEW" },
      after: { status: "APPROVED" },
    });

    expect(
      buildVersionCreatedAuditEntry({
        tenantId: "tenant-1",
        actorUserId: "author",
        entityType: "QUESTION_VERSION",
        entityId: "question-version-1",
        version: 2,
      }).action,
    ).toBe("VERSION_CREATED");
  });
});
