export function formatLoginError(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;
  const code = typeof error?.code === "string" ? error.code : null;

  if (status === 401 || code === "UNAUTHORIZED") {
    return "E-posta veya şifre yanlış. Bilgilerini kontrol edip tekrar dene.";
  }
  if (status === 400 || code === "VALIDATION_ERROR") {
    return "Giriş bilgilerini kontrol edip tekrar dene.";
  }
  if (status === 403 || code === "FORBIDDEN") {
    return "Giriş isteği güvenlik doğrulamasından geçemedi. Uygulamayı güncelle veya daha sonra tekrar dene.";
  }
  if (status === 429 || code === "RATE_LIMITED") {
    return "Çok fazla giriş denemesi yapıldı. Biraz bekleyip tekrar dene.";
  }
  if (code === "SECURE_STORAGE_UNAVAILABLE") {
    return "Oturum bu cihazda güvenli biçimde kaydedilemedi. Uygulamayı güncelle ve tekrar dene.";
  }
  if (status !== null && status >= 500) {
    return "Giriş hizmetinde geçici bir sorun var. Biraz sonra tekrar dene.";
  }
  if (status === null || status === 404) {
    return "Giriş hizmetine bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.";
  }
  return "Giriş şu anda tamamlanamadı. Biraz sonra tekrar dene.";
}

export function setupPasswordVisibilityToggle(passwordInput, toggleButton) {
  if (!passwordInput || !toggleButton) return;

  const setVisible = (visible) => {
    passwordInput.type = visible ? "text" : "password";
    toggleButton.setAttribute("aria-label", visible ? "Şifreyi gizle" : "Şifreyi göster");
    toggleButton.setAttribute("aria-pressed", String(visible));
    toggleButton.textContent = visible ? "Gizle" : "Göster";
  };

  // Keep the input focused on touch/mouse so the on-screen keyboard stays open.
  toggleButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "keyboard") event.preventDefault();
  });
  toggleButton.addEventListener("click", () => {
    setVisible(passwordInput.type === "password");
  });
  setVisible(false);
}
