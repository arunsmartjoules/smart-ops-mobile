import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
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

  useEffect(() => {
    if (isLoading || !token || !isEmailVerified || coldStartConsumeStarted) return;
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
  }, [isLoading, token, isEmailVerified]);

  return null;
}
