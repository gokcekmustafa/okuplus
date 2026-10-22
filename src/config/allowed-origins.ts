/** Capacitor Android serves its bundled web app from this fixed WebView origin. */
export const CAPACITOR_ANDROID_ORIGIN = "https://localhost";

/**
 * Keep browser origins explicitly configured, while allowing only the exact
 * origin used by our HTTPS Android WebView. This is not a wildcard.
 */
export function getAllowedOrigins(configuredOrigins: string): string[] {
  const configured = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...configured, CAPACITOR_ANDROID_ORIGIN])];
}
