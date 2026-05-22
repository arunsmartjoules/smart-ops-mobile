/**
 * App version — single source of truth.
 *
 * Bump APP_VERSION on EVERY release, OTA or native. It is plain JS, so an
 * `expo-updates` OTA delivers the new value to installed builds. It feeds:
 *   - the "App Version" row on the profile screen
 *   - the `X-App-Version` header sent to the backend
 *   - the force-update gate (VersionGateService)
 *
 * Keep it numeric ("1.0.79.7") — the backend gate compares it segment by
 * segment. Any label (e.g. "Beta") belongs in APP_VERSION_DISPLAY only.
 *
 * Note: this is independent of `app.json` `version` (1.0.7), which equals the
 * native runtimeVersion and must stay frozen across OTAs — bump that one only
 * when you cut a new native EAS build.
 */

export const APP_VERSION = "1.0.79.7";

/** Human-facing version string shown in the UI. */
export const APP_VERSION_DISPLAY = `${APP_VERSION} (Beta)`;
