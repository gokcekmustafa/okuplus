// Presentation only: these helpers never fetch, persist, unlock or score anything.
// Final server state is rendered first. Callers may await presentation before
// opening a server-unlocked station; motion never determines access itself.
export function planRoadmapTransition(previous, current) {
  if (!previous?.length || !current?.length) return null;
  const from = previous.find((node) => node.status === "active");
  const completed = current.find((node) => node.id === from?.id);
  if (!from || completed?.status !== "completed") return null;
  const to = current.find((node) => node.status === "active");
  const fromIndex = current.indexOf(completed);
  const toIndex = current.indexOf(to);
  const previousTarget = previous.find((node) => node.id === to?.id);
  const next =
    to &&
    toIndex > fromIndex &&
    (!previousTarget || previousTarget.status === "locked") &&
    current.slice(fromIndex + 1, toIndex).every((node) => node.status === "completed")
      ? to
      : null;
  const unitKey = (node) => {
    const unit = node.unitId || node.unitTitle;
    return unit ? `${node.learningPathId || node.learningPathCode || ""}:${unit}` : null;
  };
  const unit = unitKey(completed);
  const unitNodes = unit ? current.filter((node) => unitKey(node) === unit) : [];
  const cycleComplete = current.every((node) => node.status === "completed");
  const unitComplete =
    unitNodes.length > 0 && unitNodes.every((node) => node.status === "completed");
  return {
    fromId: from.id,
    toId: next?.id || null,
    milestone: cycleComplete ? "cycle" : unitComplete ? "unit" : null,
    milestoneKey: cycleComplete
      ? `cycle:${current.map((node) => node.id).join(":")}`
      : `unit:${unit}`,
  };
}

export function loadingSkeleton(kind) {
  const cards = Array.from(
    { length: kind === "training" ? 3 : 4 },
    () => '<div class="motion-skeleton-card"><i></i><span></span><span></span></div>',
  ).join("");
  return `<div class="motion-skeleton motion-skeleton-${kind === "training" ? "training" : "map"}" aria-hidden="true">${cards}</div>`;
}

export function createUiMotion(env = globalThis) {
  const media = env.matchMedia?.("(prefers-reduced-motion: reduce)");
  const animations = new Set();
  const byTarget = new WeakMap();
  const entered = new WeakMap();
  const progress = new Map();
  const awards = new Set();
  let scope = "";
  let snapshot = [];
  let roadmapContainer = null;
  let frame = null;
  let roadmapRun = null;
  const allowed = () => !media?.matches && env.document?.visibilityState !== "hidden";

  function cancel() {
    if (frame !== null) env.cancelAnimationFrame?.(frame);
    frame = null;
    roadmapRun?.finish(true);
    for (const animation of animations) animation.cancel();
    animations.clear();
  }

  function reset() {
    cancel();
    scope = "";
    snapshot = [];
    roadmapContainer = null;
    progress.clear();
    awards.clear();
  }

  function play(element, keyframes, duration = 180, easing = "cubic-bezier(.2,.7,.25,1)") {
    if (!allowed() || !element?.animate || element.isConnected === false) return null;
    try {
      byTarget.get(element)?.cancel();
      const animation = element.animate(keyframes, {
        duration,
        easing,
      });
      byTarget.set(element, animation);
      animations.add(animation);
      const clean = () => {
        animations.delete(animation);
        if (byTarget.get(element) === animation) byTarget.delete(element);
      };
      animation.finished.then(clean, clean);
      return animation;
    } catch {
      // Unsupported animation APIs must never interrupt a learning action.
      return null;
    }
  }

  function enter(element, key) {
    if (!element || !key || entered.get(element) === key) return;
    entered.set(element, key);
    play(element, [
      { opacity: 0.65, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ]);
  }

  function enhanceRoadmap(container, nodes, identity, onMilestone, completedStepId = null) {
    if (identity !== scope) {
      reset();
      scope = identity;
    }
    // A resumed session may have a stale/missing map snapshot. Its confirmed
    // completion provides the origin, but the fresh server map must mark it complete
    // and expose the next active station without an incomplete intervening step.
    const plan = planRoadmapTransition(
      completedStepId ? [{ id: completedStepId, status: "active" }] : snapshot,
      nodes,
    );
    roadmapContainer = container;
    snapshot = nodes.map(({ id, status, unitId, unitTitle, learningPathId, learningPathCode }) => ({
      id,
      status,
      unitId,
      unitTitle,
      learningPathId,
      learningPathCode,
    }));
    if (frame !== null) env.cancelAnimationFrame?.(frame);
    roadmapRun?.finish(true);
    let resolve;
    const settled = new Promise((done) => {
      resolve = done;
    });
    const run = {
      finish(cancelled = false) {
        if (roadmapRun !== run) return;
        roadmapRun = null;
        resolve({ cancelled, plan });
      },
    };
    roadmapRun = run;
    frame =
      env.requestAnimationFrame?.(() => {
        frame = null;
        if (container.isConnected === false || env.document?.visibilityState === "hidden") {
          run.finish(true);
          return;
        }
        const buttons = Array.from(container.querySelectorAll(".learning-map-v6-node"));
        const current = buttons.find((button) => button.getAttribute("aria-current") === "step");
        if (current) {
          const rect = current.getBoundingClientRect();
          const bottomInset =
            env.document?.querySelector("#student-bottom-nav")?.getBoundingClientRect().height ||
            72;
          if (rect.top < 72 || rect.bottom > env.innerHeight - bottomInset) {
            const nearby = Math.abs(rect.top - env.innerHeight / 2) < env.innerHeight * 1.5;
            current.scrollIntoView({
              block: "center",
              behavior: plan && !completedStepId && nearby && allowed() ? "smooth" : "auto",
            });
          }
        }
        if (!plan) {
          run.finish();
          return;
        }
        let movement = null;
        const from = buttons.find((button) => button.dataset.nodeId === plan.fromId);
        const to = buttons.find((button) => button.dataset.nodeId === plan.toId);
        const fromMarker = from?.querySelector(".learning-map-v6-marker-wrap");
        const toMarker = to?.querySelector(".learning-map-v6-marker-wrap");
        if (fromMarker && toMarker) {
          const a = fromMarker.getBoundingClientRect();
          const b = toMarker.getBoundingClientRect();
          const dx = a.left + a.width / 2 - b.left - b.width / 2;
          const dy = a.top - b.top;
          const frames = Array.from({ length: 9 }, (_, i) => {
            const p = i / 8;
            const bend = Math.sin(Math.PI * p);
            return {
              transform: `translate(${dx * (1 - p) + bend * 12}px, ${dy * (1 - p) - bend * 6}px)`,
            };
          });
          const character = to.querySelector(".learning-map-v6-character img");
          if (Math.abs(dy) <= env.innerHeight * 1.5)
            movement = play(character, frames, 1400, "ease-in-out");
          else movement = play(character, [{ opacity: 0.5 }, { opacity: 1 }], 400);
          play(
            to.querySelector(".learning-map-v6-marker"),
            [
              { transform: "scale(.94)" },
              { transform: "scale(1.06)", offset: 0.6 },
              { transform: "scale(1)" },
            ],
            340,
          );
        }
        play(from?.querySelector(".learning-map-v6-marker-check"), [
          { opacity: 0, transform: "scale(.7)" },
          { opacity: 1, transform: "scale(1)" },
        ]);
        if (plan.milestone && !awards.has(plan.milestoneKey)) {
          awards.add(plan.milestoneKey);
          try {
            onMilestone?.(plan.milestone);
          } catch {
            /* Celebration is optional. */
          }
        }
        if (movement)
          movement.finished.then(
            () => run.finish(),
            () => run.finish(true),
          );
        else run.finish();
      }) ?? null;
    if (frame === null) run.finish();
    return settled;
  }

  function enhanceProgress(container, keyPrefix) {
    for (const bar of container?.querySelectorAll?.(
      ".insight-bar > span, .learning-map-v6-progress > i",
    ) || []) {
      const key = `${keyPrefix}:${bar.parentElement.getAttribute("aria-label") || "route"}`;
      const value = Number.parseFloat(bar.style.width);
      if (!Number.isFinite(value) || value < 0 || value > 100) continue;
      const before = progress.get(key);
      progress.set(key, value);
      if (progress.size > 128) progress.delete(progress.keys().next().value);
      if (before !== undefined && value > before && value > 0) {
        play(bar, [{ transform: `scaleX(${before / value})` }, { transform: "scaleX(1)" }], 320);
      }
    }
  }

  function enhanceAwards(container, keyPrefix) {
    let animated = 0;
    for (const badge of container?.querySelectorAll?.(".badge-new") || []) {
      const key = `${keyPrefix}:${badge.querySelector("strong")?.textContent || ""}:${badge.querySelector("small")?.textContent || ""}`;
      if (awards.has(key)) continue;
      awards.add(key);
      if (awards.size > 128) awards.delete(awards.values().next().value);
      if (animated++ < 6)
        play(
          badge,
          [
            { opacity: 0.5, transform: "translateY(8px) scale(.96)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          260,
        );
    }
  }

  media?.addEventListener?.("change", () => {
    if (media.matches) cancel();
  });
  env.document?.addEventListener?.("visibilitychange", () => {
    if (!allowed()) cancel();
  });
  const hasRoadmap = (container, identity) => roadmapContainer === container && scope === identity;
  return { reset, cancel, enter, enhanceRoadmap, enhanceProgress, enhanceAwards, play, hasRoadmap };
}
