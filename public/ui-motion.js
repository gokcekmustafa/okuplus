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

  function stepIsOutsideViewport(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return false;
    const bottomInset =
      env.document?.querySelector("#student-bottom-nav")?.getBoundingClientRect().height || 72;
    return rect.top < 72 || rect.bottom > env.innerHeight - bottomInset;
  }

  function scrollByInstantly(delta) {
    const scrollingElement = env.document?.scrollingElement || env.document?.documentElement;
    const root = env.document?.documentElement;
    const previousBehavior = root?.style?.scrollBehavior;
    try {
      if (root?.style) root.style.scrollBehavior = "auto";
      if (scrollingElement && Number.isFinite(Number(scrollingElement.scrollTop))) {
        scrollingElement.scrollTop = Number(scrollingElement.scrollTop) + delta;
        return;
      }
      if (typeof env.scrollTo !== "function") return;
      env.scrollTo(env.scrollX || 0, (env.scrollY || 0) + delta);
    } finally {
      if (root?.style) root.style.scrollBehavior = previousBehavior || "";
    }
  }

  function alignStep(element, viewportTop = null) {
    if (!element) return;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return;
    if (Number.isFinite(viewportTop)) {
      const delta = rect.top - viewportTop;
      if (Math.abs(delta) > 1) scrollByInstantly(delta);
    } else if (stepIsOutsideViewport(element)) {
      const bottomInset =
        env.document?.querySelector("#student-bottom-nav")?.getBoundingClientRect().height || 72;
      const topInset = 72;
      const visibleCenter = (topInset + env.innerHeight - bottomInset) / 2;
      const targetTop = Math.max(topInset, visibleCenter - rect.height / 2);
      scrollByInstantly(rect.top - targetTop);
    }
  }

  function transitionFrames(dx, dy) {
    return Array.from({ length: 9 }, (_, i) => {
      const p = i / 8;
      const bend = Math.sin(Math.PI * p);
      const x = dx * (1 - p) + bend * 12;
      const y = dy * (1 - p) - bend * 6;
      return {
        // The character wrapper is already centered by CSS; animate only this
        // image's offset so the source and destination markers remain aligned.
        transform: `translate(${x}px, ${y}px)`,
      };
    });
  }

  function enhanceRoadmap(
    container,
    nodes,
    identity,
    onMilestone,
    completedStepId = null,
    originPosition = null,
    onMotionStart = null,
  ) {
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
      character: null,
      finish(cancelled = false) {
        if (roadmapRun !== run) return;
        roadmapRun = null;
        if (run.character?.style) run.character.style.transform = "";
        resolve({ cancelled, plan });
      },
    };
    roadmapRun = run;
    const notifyMotionStart = (detail) => {
      try {
        onMotionStart?.(detail);
      } catch {
        /* Timing and status updates are optional. */
      }
    };

    const buttons = Array.from(container.querySelectorAll(".learning-map-v6-node"));
    const current = buttons.find((button) => button.getAttribute("aria-current") === "step");
    const from = plan && buttons.find((button) => button.dataset.nodeId === plan.fromId);
    const to = plan && buttons.find((button) => button.dataset.nodeId === plan.toId);
    const originViewportTop =
      originPosition &&
      originPosition.stepId === plan?.fromId &&
      Number.isFinite(originPosition.viewportTop)
        ? originPosition.viewportTop
        : null;
    let preparedMovement = null;

    // A completed station is the visual anchor while the refreshed map settles.
    // Reduced motion goes straight to the server-selected destination.
    if (plan && allowed() && from) alignStep(from, originViewportTop);
    else if (completedStepId) {
      const completedButton = buttons.find((button) => button.dataset.nodeId === completedStepId);
      if (completedButton) alignStep(completedButton);
      else if (current) alignStep(current);
    } else if (current) alignStep(current);

    if (plan && allowed() && from && to) {
      const fromStep = from.closest?.(".learning-map-v6-step");
      const toStep = to.closest?.(".learning-map-v6-step");
      const character = to.querySelector(".learning-map-v6-character img");
      if (fromStep && toStep && character?.style) {
        const a = fromStep.getBoundingClientRect();
        const b = toStep.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dy) <= env.innerHeight * 1.5) {
          preparedMovement = { character, dx, dy };
          run.character = character;
          character.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      }
    }

    frame =
      env.requestAnimationFrame?.(() => {
        frame = null;
        if (container.isConnected === false || env.document?.visibilityState === "hidden") {
          run.finish(true);
          return;
        }
        if (!plan) {
          run.finish();
          return;
        }
        let movement = null;
        if (preparedMovement) {
          movement = play(
            preparedMovement.character,
            transitionFrames(preparedMovement.dx, preparedMovement.dy),
            1400,
            "ease-in-out",
          );
          if (!movement) run.finish();
          play(
            to.querySelector(".learning-map-v6-marker"),
            [
              { transform: "scale(.94)" },
              { transform: "scale(1.06)", offset: 0.6 },
              { transform: "scale(1)" },
            ],
            340,
          );
        } else if (allowed()) {
          // If the optional animation cannot be prepared, still settle at the
          // server-confirmed active or completed node rather than leaving a
          // stale viewport.
          const destination = to || current;
          if (destination) alignStep(destination);
        }
        // Signal after the existing character animation has actually been
        // created; in reduced-motion/fallback mode this still marks the
        // immediate server-confirmed destination handling.
        notifyMotionStart({ animated: Boolean(movement), started: true });
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
