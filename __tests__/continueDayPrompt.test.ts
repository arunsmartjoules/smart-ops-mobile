/**
 * Start Day after an ended day asks "Ended by mistake?" (components/attendance/
 * continueDayPrompt). The native Alert is mocked; a test "presses" a button by
 * calling its onPress.
 */
import { Alert } from "react-native";
import {
  askContinueDay,
  hasEndedSessionToday,
} from "@/components/attendance/continueDayPrompt";
import type { AttendanceLog } from "@/services/AttendanceService";

jest.mock("@/services/AttendanceService", () => ({
  getISTDateString: () => "2026-11-23",
}));

const ended: AttendanceLog = {
  id: "a1",
  user_id: "u1",
  site_code: "JCL-KIMSNASHIK",
  date: "2026-11-23",
  status: "Present",
  check_in_time: "2026-11-23T03:30:00.000Z",
  check_out_time: "2026-11-23T03:31:00.000Z",
};

type Button = { text: string; onPress?: () => void };
const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const lastCall = () => alertMock.mock.calls[alertMock.mock.calls.length - 1]!;
const press = (label: string) =>
  (lastCall()[2] as Button[]).find((b) => b.text === label)!.onPress!();

beforeEach(() => alertMock.mockClear());

describe("askContinueDay", () => {
  it("resolves 'continue' when Continue day is pressed", async () => {
    const answer = askContinueDay(ended);
    press("Continue day");
    await expect(answer).resolves.toBe("continue");
  });

  it("resolves 'new' when New shift is pressed", async () => {
    const answer = askContinueDay(ended);
    press("New shift");
    await expect(answer).resolves.toBe("new");
  });

  it("resolves null when Cancel is pressed", async () => {
    const answer = askContinueDay(ended);
    press("Cancel");
    await expect(answer).resolves.toBeNull();
  });

  it("resolves null when the dialog is dismissed without a button", async () => {
    const answer = askContinueDay(ended);
    (lastCall()[3] as { onDismiss: () => void }).onDismiss();
    await expect(answer).resolves.toBeNull();
  });

  it("names the time the day was ended in the message", () => {
    void askContinueDay(ended);
    // Device-local clock time (h:mm AM/PM); the zone depends on the runner.
    expect(lastCall()[1]).toMatch(
      /^You ended your day at \d{1,2}:\d{2} (AM|PM)\. Continue the same day\?$/,
    );
  });
});

describe("hasEndedSessionToday", () => {
  it("is true for a session with both check-in and check-out", () => {
    expect(hasEndedSessionToday(ended)).toBe(true);
  });

  it("is false for an open session", () => {
    expect(hasEndedSessionToday({ ...ended, check_out_time: undefined })).toBe(false);
  });

  it("is false when there is no session", () => {
    expect(hasEndedSessionToday(null)).toBe(false);
  });
});
