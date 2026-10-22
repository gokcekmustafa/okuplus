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

export function formatGoogleLoginError(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;
  const code = typeof error?.code === "string" ? error.code : null;

  if (code === "GOOGLE_SIGN_IN_CANCELLED") {
    return "Google girişi iptal edildi. İstediğinde tekrar deneyebilirsin.";
  }
  if (code === "GOOGLE_CONFIGURATION_ERROR" || code === "GOOGLE_PROVIDER_CONFIGURATION") {
    return "Google girişi bu uygulama için henüz yapılandırılmamış.";
  }
  if (code === "GOOGLE_AUTH_FAILED" || code === "GOOGLE_NATIVE_UNAVAILABLE") {
    return "Google girişi başlatılamadı. İnternet bağlantını ve cihazındaki Google hizmetlerini kontrol edip tekrar dene.";
  }
  if (code === "GOOGLE_NO_CREDENTIAL") {
    return "Cihazda kullanılabilir bir Google hesabı bulunamadı.";
  }
  if (code === "GOOGLE_INVALID_CREDENTIAL" || status === 401 || code === "UNAUTHORIZED") {
    return "Google hesabı doğrulanamadı. Tekrar giriş yapmayı dene.";
  }
  if (code === "SECURE_STORAGE_UNAVAILABLE" || code === "SECURE_RANDOM_UNAVAILABLE") {
    return "Oturum bu cihazda güvenli biçimde başlatılamadı. Uygulamayı güncelle ve tekrar dene.";
  }
  if (status !== null && status >= 500) {
    return "Google giriş hizmetinde geçici bir sorun var. Biraz sonra tekrar dene.";
  }
  if (status === 403) {
    return "Google giriş isteği güvenlik doğrulamasından geçemedi. Uygulamayı güncelle veya daha sonra tekrar dene.";
  }
  if (status === 429) {
    return "Çok fazla Google giriş denemesi yapıldı. Biraz bekleyip tekrar dene.";
  }
  if (status === null || status === 404) {
    return "Google giriş hizmetine bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.";
  }
  return "Google ile giriş tamamlanamadı. Lütfen tekrar dene.";
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
