/**
 * When the "Rate JouleOps" stars card may appear. Pure (no React Native
 * imports) so the rules are unit tested; RatingPromptService owns storage.
 *
 * The rules exist so the ask never lands on someone mid task or too early:
 *  - only after the app has been in real use (installed a week, opened on 5
 *    different days),
 *  - at most once every 30 days, and never more than 3 times on a device,
 *  - never again once the user has tapped a star.
 * Where it shows (Home only, after a few settled seconds) is the card's job.
 */

export interface RatingPromptState {
  /** Epoch ms of the first app open we recorded on this device. */
  firstSeenAt: number;
  /** Distinct IST calendar days the app was opened. */
  activeDays: number;
  /** Last IST day (YYYY-MM-DD) counted in activeDays. */
  lastActiveDay: string | null;
  /** Epoch ms the card was last shown (null = never). */
  lastShownAt: number | null;
  /** How many times the card has been shown. */
  shownCount: number;
  /** A star was tapped: never ask again. */
  rated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const RATING_RULES = {
  minDaysSinceFirstUse: 7,
  minActiveDays: 5,
  cooldownDays: 30,
  maxShows: 3,
} as const;

export function initialRatingState(now: number): RatingPromptState {
  return {
    firstSeenAt: now,
    activeDays: 0,
    lastActiveDay: null,
    lastShownAt: null,
    shownCount: 0,
    rated: false,
  };
}

/** Counts `today` (IST YYYY-MM-DD) once; repeat opens on the same day are a no-op. */
export function withActiveDay(state: RatingPromptState, today: string): RatingPromptState {
  if (state.lastActiveDay === today) return state;
  return { ...state, activeDays: state.activeDays + 1, lastActiveDay: today };
}

export function isRatingPromptDue(state: RatingPromptState, now: number): boolean {
  if (state.rated) return false;
  if (state.shownCount >= RATING_RULES.maxShows) return false;
  if (now - state.firstSeenAt < RATING_RULES.minDaysSinceFirstUse * DAY_MS) return false;
  if (state.activeDays < RATING_RULES.minActiveDays) return false;
  if (state.lastShownAt != null && now - state.lastShownAt < RATING_RULES.cooldownDays * DAY_MS) {
    return false;
  }
  return true;
}

/**
 * Reads a stored blob back into a state, or null when it is missing or not
 * ours (corrupt JSON, an older shape). Null means "start fresh".
 */
export function parseRatingState(raw: string | null): RatingPromptState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RatingPromptState>;
    if (typeof v.firstSeenAt !== "number" || !Number.isFinite(v.firstSeenAt)) return null;
    return {
      firstSeenAt: v.firstSeenAt,
      activeDays: typeof v.activeDays === "number" ? v.activeDays : 0,
      lastActiveDay: typeof v.lastActiveDay === "string" ? v.lastActiveDay : null,
      lastShownAt: typeof v.lastShownAt === "number" ? v.lastShownAt : null,
      shownCount: typeof v.shownCount === "number" ? v.shownCount : 0,
      rated: v.rated === true,
    };
  } catch {
    return null;
  }
}
