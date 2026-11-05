/**
 * When the Play Store rating card may appear (utils/ratingPromptRules).
 * Pure rules with injected time, so no wall clock and no native mocks.
 */
import {
  RATING_RULES,
  initialRatingState,
  isRatingPromptDue,
  parseRatingState,
  withActiveDay,
  type RatingPromptState,
} from "@/utils/ratingPromptRules";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 4, 30); // fixed instant, 1 Nov 2026 10:00 IST

/** A device that has met every rule: used for a week on enough days, never asked. */
const ready = (patch: Partial<RatingPromptState> = {}): RatingPromptState => ({
  ...initialRatingState(T0),
  activeDays: RATING_RULES.minActiveDays,
  lastActiveDay: "2026-11-08",
  ...patch,
});
const afterWeek = T0 + RATING_RULES.minDaysSinceFirstUse * DAY;

describe("isRatingPromptDue", () => {
  it("is due once installed a week and used on enough days", () => {
    expect(isRatingPromptDue(ready(), afterWeek)).toBe(true);
  });

  it("is not due before a week since first use", () => {
    expect(isRatingPromptDue(ready(), afterWeek - 1)).toBe(false);
  });

  it("is not due with fewer active days than required", () => {
    expect(
      isRatingPromptDue(ready({ activeDays: RATING_RULES.minActiveDays - 1 }), afterWeek),
    ).toBe(false);
  });

  it("is never due again after the user rated", () => {
    expect(isRatingPromptDue(ready({ rated: true }), afterWeek + 365 * DAY)).toBe(false);
  });

  it("is not due inside the cooldown after being shown", () => {
    const shownAt = afterWeek;
    const s = ready({ lastShownAt: shownAt, shownCount: 1 });
    expect(isRatingPromptDue(s, shownAt + RATING_RULES.cooldownDays * DAY - 1)).toBe(false);
  });

  it("is due again once the cooldown has passed", () => {
    const shownAt = afterWeek;
    const s = ready({ lastShownAt: shownAt, shownCount: 1 });
    expect(isRatingPromptDue(s, shownAt + RATING_RULES.cooldownDays * DAY)).toBe(true);
  });

  it("stops after the maximum number of shows", () => {
    const s = ready({ lastShownAt: T0, shownCount: RATING_RULES.maxShows });
    expect(isRatingPromptDue(s, T0 + 365 * DAY)).toBe(false);
  });
});

describe("withActiveDay", () => {
  it("counts a new day once", () => {
    expect(withActiveDay(initialRatingState(T0), "2026-11-01").activeDays).toBe(1);
  });

  it("ignores a second open on the same day", () => {
    const once = withActiveDay(initialRatingState(T0), "2026-11-01");
    expect(withActiveDay(once, "2026-11-01")).toBe(once);
  });
});

describe("parseRatingState", () => {
  it("round trips a saved state", () => {
    const s = ready({ lastShownAt: T0, shownCount: 2, rated: true });
    expect(parseRatingState(JSON.stringify(s))).toEqual(s);
  });

  it("returns null for corrupt storage so the device starts fresh", () => {
    expect(parseRatingState("{not json")).toBeNull();
  });

  it("returns null for a blob without firstSeenAt", () => {
    expect(parseRatingState(JSON.stringify({ activeDays: 9 }))).toBeNull();
  });
});
