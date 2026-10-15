import { describe, expect, it, vi } from "vitest";
import { createUiMotion, loadingSkeleton, planRoadmapTransition } from "../public/ui-motion.js";

const before = () => [
  { id: "31", status: "active", unitId: "unit-1" },
  { id: "32", status: "locked", unitId: "unit-1" },
];
const after = () => [
  { id: "31", status: "completed", unitId: "unit-1" },
  { id: "32", status: "active", unitId: "unit-1" },
];

function harness(reduced = false) {
  const callbacks = new Map<number, () => void>();
  const media = { matches: reduced, addEventListener: vi.fn() };
  const document = {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    querySelector: () => null,
  };
  const animations: { cancel: ReturnType<typeof vi.fn>; finished: Promise<unknown> }[] = [];
  const animate = vi.fn((_frames: unknown[], _options: unknown) => {
    const animation = { cancel: vi.fn(), finished: new Promise(() => {}) };
    animations.push(animation);
    return animation;
  });
  const env = {
    matchMedia: () => media,
    document,
    innerHeight: 800,
    requestAnimationFrame: (callback: () => void) => {
      const id = callbacks.size + 1;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
  };
  const element = () => ({ animate, isConnected: true });
  const button = (id: string, current: boolean, top: number) => ({
    dataset: { nodeId: id },
    getAttribute: (name: string) => (name === "aria-current" && current ? "step" : null),
    getBoundingClientRect: () => ({ top, bottom: top + 136 }),
    scrollIntoView: vi.fn(),
    querySelector: (selector: string) =>
      selector.endsWith("marker-wrap")
        ? { getBoundingClientRect: () => ({ left: 100, top, width: 66 }) }
        : element(),
  });
  const buttons = [button("31", false, 200), button("32", true, 336)];
  const container = { isConnected: true, querySelectorAll: () => buttons };
  const flush = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((cb) => cb());
  };
  return {
    motion: createUiMotion(env),
    env,
    media,
    document,
    callbacks,
    animate,
    animations,
    element,
    buttons,
    container,
    flush,
  };
}

describe("server-confirmed, optional UI motion", () => {
  it("never invents movement on first load, an unchanged path or an incomplete source", () => {
    expect(planRoadmapTransition([], after())).toBeNull();
    expect(planRoadmapTransition(before(), before())).toBeNull();
    expect(planRoadmapTransition(after(), after())).toBeNull();
    expect(
      planRoadmapTransition(before(), [
        { id: "31", status: "active" },
        { id: "32", status: "active" },
      ]),
    ).toBeNull();
  });

  it("moves only from a server-completed station to the newly active station", () => {
    expect(planRoadmapTransition(before(), after())).toMatchObject({
      fromId: "31",
      toId: "32",
      milestone: null,
    });
    const h = harness();
    const nodes = after();
    h.motion.enhanceRoadmap(h.container, before(), "student-a");
    h.flush();
    expect(h.animate).not.toHaveBeenCalled();
    h.motion.enhanceRoadmap(h.container, nodes, "student-a");
    h.flush();
    expect(h.animate).toHaveBeenCalled();
    expect(h.animate.mock.calls.some(([frames]) => frames.length === 9)).toBe(true);
    expect(nodes).toEqual(after());
    const count = h.animate.mock.calls.length;
    h.motion.enhanceRoadmap(h.container, nodes, "student-a");
    h.flush();
    expect(h.animate).toHaveBeenCalledTimes(count);
  });

  it("does not animate unlocking past incomplete stations or a previously open destination", () => {
    const current = [
      { id: "31", status: "completed" },
      { id: "gap", status: "locked" },
      { id: "32", status: "active" },
    ];
    expect(planRoadmapTransition(before(), current)?.toId).toBeNull();
    expect(
      planRoadmapTransition(
        [
          { id: "31", status: "active" },
          { id: "32", status: "active" },
        ],
        after(),
      )?.toId,
    ).toBeNull();
  });

  it("celebrates only verified unit/cycle completion, not a score threshold", () => {
    const completed = after().map((node) => ({ ...node, status: "completed" }));
    expect(planRoadmapTransition(after(), completed)?.milestone).toBe("cycle");
    const h = harness();
    const celebration = vi.fn();
    const unitBefore = [
      { id: "31", status: "active", unitId: "unit-1" },
      { id: "32", status: "locked", unitId: "unit-2" },
      { id: "33", status: "locked", unitId: "unit-2" },
    ];
    const unitAfter = [
      { id: "31", status: "completed", unitId: "unit-1" },
      { id: "32", status: "active", unitId: "unit-2" },
      { id: "33", status: "locked", unitId: "unit-2" },
    ];
    h.motion.enhanceRoadmap(h.container, unitBefore, "student-a", celebration);
    h.flush();
    h.motion.enhanceRoadmap(h.container, unitAfter, "student-a", celebration);
    h.flush();
    expect(celebration).toHaveBeenCalledExactlyOnceWith("unit");
    h.motion.enhanceRoadmap(h.container, unitAfter, "student-a", celebration);
    h.flush();
    expect(celebration).toHaveBeenCalledTimes(1);
  });

  it("resets identity-scoped snapshots and cancels a stale scheduled render", () => {
    const h = harness();
    expect(h.motion.hasRoadmap(h.container, "student-a")).toBe(false);
    h.motion.enhanceRoadmap(h.container, before(), "student-a");
    expect(h.motion.hasRoadmap(h.container, "student-a")).toBe(true);
    expect(h.motion.hasRoadmap(h.container, "student-b")).toBe(false);
    h.motion.enhanceRoadmap(h.container, after(), "student-b");
    h.flush();
    expect(h.animate).not.toHaveBeenCalled();
    h.motion.enhanceRoadmap(h.container, before(), "student-b");
    h.motion.cancel();
    h.flush();
    expect(h.callbacks.size).toBe(0);
    h.motion.reset();
    expect(h.motion.hasRoadmap(h.container, "student-b")).toBe(false);
    h.motion.enhanceRoadmap(h.container, after(), "student-b");
    h.flush();
    expect(h.animate).not.toHaveBeenCalled();
  });

  it("does not mix units with identical titles on different learning paths", () => {
    const previous = [
      { id: "31", status: "active", unitTitle: "Uygulama", learningPathId: "cycle-1" },
      { id: "32", status: "locked", unitTitle: "Uygulama", learningPathId: "cycle-2" },
    ];
    const current = previous.map((node, index) => ({
      ...node,
      status: index === 0 ? "completed" : "active",
    }));
    expect(planRoadmapTransition(previous, current)).toMatchObject({
      milestone: "unit",
      milestoneKey: "unit:cycle-1:Uygulama",
    });
  });

  it("uses no animation or smooth scrolling under reduced motion", () => {
    const h = harness(true);
    h.motion.enhanceRoadmap(h.container, before(), "student");
    h.flush();
    h.buttons[1]!.getBoundingClientRect = () => ({ top: 900, bottom: 1036 });
    h.motion.enhanceRoadmap(h.container, after(), "student");
    h.flush();
    expect(h.animate).not.toHaveBeenCalled();
    expect(h.buttons[1]!.scrollIntoView).toHaveBeenLastCalledWith({
      block: "center",
      behavior: "auto",
    });
  });

  it("cancels active animations when motion preference changes or the tab hides", () => {
    const h = harness();
    h.motion.enter(h.element(), "q1");
    h.media.matches = true;
    h.media.addEventListener.mock.calls[0]![1]();
    expect(h.animations[0]!.cancel).toHaveBeenCalledOnce();
    h.media.matches = false;
    h.motion.enter(h.element(), "q2");
    h.document.visibilityState = "hidden";
    h.document.addEventListener.mock.calls[0]![1]();
    expect(h.animations[1]!.cancel).toHaveBeenCalledOnce();
  });

  it("keeps the final UI usable if animation APIs fail or are unavailable", () => {
    const h = harness();
    h.animate.mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(() => h.motion.enter(h.element(), "q1")).not.toThrow();
    expect(() => createUiMotion({}).enter({}, "q1")).not.toThrow();
    const detached = { ...h.element(), isConnected: false };
    h.animate.mockClear();
    h.motion.enter(detached, "q2");
    expect(h.animate).not.toHaveBeenCalled();
  });

  it("only animates genuine progress increases and fresh awards once", () => {
    const h = harness();
    const bar = {
      ...h.element(),
      style: { width: "30%" },
      parentElement: { getAttribute: () => "Dikkat" },
    };
    const root = { querySelectorAll: () => [bar] };
    h.motion.enhanceProgress(root, "skills");
    expect(h.animate).not.toHaveBeenCalled();
    bar.style.width = "50%";
    h.motion.enhanceProgress(root, "skills");
    expect(h.animate).toHaveBeenCalledOnce();
    h.motion.enhanceProgress(root, "skills");
    bar.style.width = "20%";
    h.motion.enhanceProgress(root, "skills");
    expect(h.animate).toHaveBeenCalledOnce();
    const badge = {
      ...h.element(),
      querySelector: (selector: string) => ({
        textContent: selector === "strong" ? "Gerçek rozet" : "15 Ekim",
      }),
    };
    const badges = { querySelectorAll: () => [badge] };
    h.motion.enhanceAwards(badges, "badges");
    h.motion.enhanceAwards(badges, "badges");
    expect(h.animate).toHaveBeenCalledTimes(2);
  });

  it("does not replay feedback on the same attempt and keeps skeletons noninteractive", () => {
    const h = harness();
    const target = h.element();
    h.motion.enter(target, "attempt-1");
    h.motion.enter(target, "attempt-1");
    expect(h.animate).toHaveBeenCalledOnce();
    h.motion.enter(target, "attempt-2");
    expect(h.animate).toHaveBeenCalledTimes(2);
    expect(loadingSkeleton("training")).toContain('aria-hidden="true"');
    expect(loadingSkeleton("training")).not.toMatch(/button|input|tabindex/u);
    expect(loadingSkeleton("<script>")).not.toContain("<script>");
  });
});
