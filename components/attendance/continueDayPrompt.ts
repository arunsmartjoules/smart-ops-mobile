/**
 * Asked when an operator taps Start Day after already ending today's session —
 * usually an End Day tapped by mistake. "Continue day" reopens that session
 * (one record: first Start Day → next End Day); "New shift" starts a separate
 * one as before. Kept to one line so it reads at a glance on site.
 */
import { Alert } from "react-native";
import type { AttendanceLog } from "@/services/AttendanceService";
import { safeTime } from "./lib";

export type ContinueDayChoice = "continue" | "new" | null;

/** True when today's session exists and is already ended. */
export function hasEndedSessionToday(today: AttendanceLog | null | undefined): boolean {
  return !!today?.check_in_time && !!today?.check_out_time;
}

/** Resolves "continue", "new", or null when the operator cancels. */
export function askContinueDay(endedSession: AttendanceLog): Promise<ContinueDayChoice> {
  const endedAt = safeTime(endedSession.check_out_time, "h:mm a");
  return new Promise((resolve) => {
    Alert.alert(
      "Ended by mistake?",
      `You ended your day at ${endedAt}. Continue the same day?`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        { text: "New shift", onPress: () => resolve("new") },
        { text: "Continue day", onPress: () => resolve("continue") },
      ],
      // Android: tapping outside the dialog dismisses it without a button.
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
