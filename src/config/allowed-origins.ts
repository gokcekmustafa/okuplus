/** Capacitor Android serves its bundled web app from this fixed WebView origin. */
export const CAPACITOR_ANDROID_ORIGIN = "https://localhost";
/** Capacitor iOS uses its fixed custom-scheme WebView origin. */
export const CAPACITOR_IOS_ORIGIN = "capacitor://localhost";

/**
 * Keep browser origins explicitly configured, while allowing only the exact
 * origins used by our native WebViews. These are not wildcards.
 */
export function getAllowedOrigins(configuredOrigins: string): string[] {
  const configured = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...configured, CAPACITOR_ANDROID_ORIGIN, CAPACITOR_IOS_ORIGIN])];
}
