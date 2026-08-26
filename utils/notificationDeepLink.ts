import * as Notifications from "expo-notifications";
import logger from "@/utils/logger";

type RouterNav = {
  push: (href: any) => void;
  replace: (href: any) => void;
};

/**
 * Navigate from a notification response (warm tap or cold-start replay).
 * Returns true if navigation was performed (caller may clear last response).
 */
export function applyNotificationNavigation(
  router: RouterNav,
  response: Notifications.NotificationResponse,
  options: { replace?: boolean } = {},
): boolean {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  logger.info("Notification tapped", { data });

  return navigateFromNotificationData(router, data, options);
}

/**
 * The routing itself, split out from the push-response wrapper so the
 * in-app notification feed can reuse it. Feed rows carry the same `data`
 * payload the push did (persisted in `notification_logs.data`), so a tap in
 * the list lands on the same screen as a tap on the notification.
 */
export function navigateFromNotificationData(
  router: RouterNav,
  data: Record<string, unknown> | undefined | null,
  options: { replace?: boolean } = {},
): boolean {
  const nav = options.replace ? router.replace : router.push;

  if (data?.ticket_no) {
    nav({
      pathname: "/(tabs)/tickets",
      params: {
        ticketId: String(data.ticket_no),
        ...(data.site_code != null && data.site_code !== ""
          ? { siteCode: String(data.site_code) }
          : {}),
      },
    });
    return true;
  }

  if (data?.incident_id) {
    nav({
      pathname: "/(tabs)/incidents",
      params: {
        incidentId: String(data.incident_id),
        ...(data.site_code != null && data.site_code !== ""
          ? { siteCode: String(data.site_code) }
          : {}),
      },
    });
    return true;
  }

  if (
    data?.screen === "attendance" ||
    String(data?.type || "").includes("attendance")
  ) {
    nav("/attendance");
    return true;
  }

  if (data?.screen) {
    nav(data.screen as any);
    return true;
  }

  return false;
}
