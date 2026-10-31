/* global api, csrfToken, openUserDetail, escapeHtml */

function openPackageModal(user) {
  const modal = document.getElementById("sa-package-modal");
  const body = document.getElementById("sa-package-modal-body");
  if (!modal || !body || !user) return;
  const entitlements = Array.isArray(window.currentUserEntitlements)
    ? window.currentUserEntitlements
    : [];
  body.innerHTML = `
    <div class="sa-form-grid">
      <h3>Paket başlat</h3>
      <form id="sa-package-create-form" class="sa-form-grid">
        <label class="sa-field"><span>Kapsam</span><select name="scope"><option value="PERSONAL">Kişisel</option><option value="ORGANIZATION">Kurum</option></select></label>
        <label class="sa-field"><span>Paket</span><select name="plan"><option value="PLAN_FREE">Ücretsiz</option><option value="PLAN_PREMIUM">Premium</option></select></label>
        <label class="sa-field"><span>Başlangıç</span><input name="effectiveAt" type="date" /></label>
        <label class="sa-field"><span>Bitiş (boş = süresiz)</span><input name="expiresAt" type="date" /></label>
        <div class="sa-form-actions"><button type="submit" class="sa-btn sa-btn-primary">Paketi başlat</button></div>
        <p id="sa-package-create-status" class="sa-muted" role="status"></p>
      </form>
    </div>
    ${entitlements
      .filter((right) => right.active)
      .map(
        (right) => `
      <div class="sa-form-grid" style="margin-top:16px">
        <h3>Paket işlemleri: ${escapeHtml(right.plan)}</h3>
        <form data-package-extend="${escapeHtml(right.id)}" class="sa-form-grid">
          <label class="sa-field"><span>Yeni bitiş</span><input name="expiresAt" type="date" /></label>
          <div class="sa-form-actions"><button type="submit" class="sa-btn sa-btn-secondary">Süreyi uzat</button></div>
          <p class="sa-muted" role="status"></p>
        </form>
        <form data-package-change="${escapeHtml(right.id)}" class="sa-form-grid">
          <label class="sa-field"><span>Yeni paket</span><select name="plan"><option value="PLAN_FREE">Ücretsiz</option><option value="PLAN_PREMIUM">Premium</option></select></label>
          <label class="sa-field"><span>Başlangıç</span><input name="effectiveAt" type="date" required /></label>
          <label class="sa-field"><span>Bitiş (boş = süresiz)</span><input name="expiresAt" type="date" /></label>
          <div class="sa-form-actions"><button type="submit" class="sa-btn sa-btn-secondary">Paketi değiştir</button></div>
          <p class="sa-muted" role="status"></p>
        </form>
        <div class="sa-form-actions">
          <button type="button" class="sa-btn sa-btn-secondary" data-package-end="${escapeHtml(right.id)}">Erişimi sonlandır</button>
        </div>
      </div>`,
      )
      .join("")}
  `;
  modal.classList.remove("hidden");

  const createForm = document.getElementById("sa-package-create-form");
  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("p[role='status']");
    const scope = form.scope.value;
    const payload = {
      scope,
      plan: form.plan.value,
      effectiveAt: form.effectiveAt.value
        ? new Date(form.effectiveAt.value).toISOString()
        : undefined,
      expiresAt: form.expiresAt.value ? new Date(form.expiresAt.value).toISOString() : null,
    };
    if (scope === "PERSONAL") payload.userId = user.id;
    else {
      const firstOrg = (user.memberships ?? []).find(
        (m) => m.tenantType === "ORGANIZATION" && !m.deletedAt,
      );
      if (!firstOrg) {
        if (status) status.textContent = "Kurumsal bağlam bulunamadı.";
        return;
      }
      payload.tenantId = firstOrg.tenantId;
    }
    try {
      await api("/admin/entitlements", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() },
        body: JSON.stringify(payload),
      });
      if (status) status.textContent = "Paket başlatıldı.";
      await openUserDetail(user.id);
      closePackageModal();
    } catch (error) {
      if (status) status.textContent = error.message || "Paket başlatılamadı.";
    }
  });

  document.querySelectorAll("[data-package-extend]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const target = event.currentTarget;
      const id = target.dataset.packageExtend;
      const status = target.querySelector("p[role='status']");
      try {
        await api("/admin/entitlements/" + id, {
          method: "PATCH",
          headers: { "x-csrf-token": csrfToken() },
          body: JSON.stringify({
            expiresAt: target.expiresAt.value
              ? new Date(target.expiresAt.value).toISOString()
              : null,
          }),
        });
        if (status) status.textContent = "Süre uzatıldı.";
        await openUserDetail(user.id);
        closePackageModal();
      } catch (error) {
        if (status) status.textContent = error.message || "Süre uzatılamadı.";
      }
    });
  });

  document.querySelectorAll("[data-package-change]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const target = event.currentTarget;
      const id = target.dataset.packageChange;
      const status = target.querySelector("p[role='status']");
      try {
        await api("/admin/entitlements/" + id + "/change-plan", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken() },
          body: JSON.stringify({
            plan: target.plan.value,
            effectiveAt: new Date(target.effectiveAt.value).toISOString(),
            expiresAt: target.expiresAt.value
              ? new Date(target.expiresAt.value).toISOString()
              : null,
          }),
        });
        if (status) status.textContent = "Paket değiştirildi.";
        await openUserDetail(user.id);
        closePackageModal();
      } catch (error) {
        if (status) status.textContent = error.message || "Paket değiştirilemedi.";
      }
    });
  });

  document.querySelectorAll("[data-package-end]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.packageEnd;
      if (!window.confirm("Erişimi sonlandırmak istiyor musunuz?")) return;
      try {
        await api("/admin/entitlements/" + id, {
          method: "PATCH",
          headers: { "x-csrf-token": csrfToken() },
          body: JSON.stringify({ active: false }),
        });
        await openUserDetail(user.id);
        closePackageModal();
      } catch (error) {
        alert(error.message || "Erişim sonlandırılamadı.");
      }
    });
  });
}

function closePackageModal() {
  document.getElementById("sa-package-modal")?.classList.add("hidden");
}

window.openPackageModal = openPackageModal;
window.closePackageModal = closePackageModal;

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const open = target.closest("#sa-open-package-modal");
  if (open && window.currentUser) void openPackageModal(window.currentUser);
});

document.getElementById("sa-package-modal")?.addEventListener("click", (event) => {
  if (event.target === document.getElementById("sa-package-modal")) closePackageModal();
});
document.getElementById("sa-package-modal-close")?.addEventListener("click", closePackageModal);
