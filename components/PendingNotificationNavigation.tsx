import { useEffect, useRef } from "react";
import { useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { applyNotificationNavigation } from "@/utils/notificationDeepLink";
import logger from "@/utils/logger";

/** One cold-start consume per JS runtime (avoids Strict Mode double-invoke races). */
let coldStartConsumeStarted = false;

/**
 * Consumes the notification that launched the app (cold start) only after
 * auth is ready, then clears it so the next launch does not replay the same deep link.
 */
export function PendingNotificationNavigation() {
  const { token, isLoading, isEmailVerified } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  // Navigating before the root navigator has mounted updates expo-router's
  // store too early — wait for its state key (see AuthGuard in app/_layout).
  const navigatorReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (
      isLoading ||
      !navigatorReady ||
      !token ||
      !isEmailVerified ||
      coldStartConsumeStarted
    )
      return;
    coldStartConsumeStarted = true;

    (async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return;

        const navigated = applyNotificationNavigation(routerRef.current, response, {
          replace: true,
        });
        if (navigated) {
          await Notifications.clearLastNotificationResponseAsync();
        }
      } catch (e) {
        logger.warn("Failed to restore last notification response", {
          module: "PENDING_NOTIF_NAV",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, [isLoading, navigatorReady, token, isEmailVerified]);

  return null;
}
