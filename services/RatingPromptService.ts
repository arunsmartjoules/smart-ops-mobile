/**
 * RatingPromptService
 *
 * Device level memory for the "Rate JouleOps" stars card on Home
 * (components/home/RatingPromptCard.tsx). The rules for WHEN it is due live
 * in utils/ratingPromptRules.ts; this file only loads, updates and saves.
 *
 *  - Android only. Apple (guideline 5.6.1) forbids custom rating prompts, so
 *    iOS would have to use the system StoreKit sheet instead.
 *  - Stored in SecureStore, NOT AsyncStorage: sign out wipes AsyncStorage,
 *    and devices are shared, so a per sign in memory would re-ask every
 *    technician. The Play review belongs to the device's Google account anyway.
 *  - Any star opens the Play Store listing. No review gating (sending low
 *    ratings elsewhere), per Google Play's review guidance.
 *  - Storage failures never surface: worst case the card just doesn't show.
 */

import { Platform } from "react-native";
import { SecureStorage } from "@/utils/secureStorage";
import { istTodayString } from "@/utils/istDate";
import logger from "@/utils/logger";
import VersionGateService from "@/services/VersionGateService";
import {
  initialRatingState,
  isRatingPromptDue,
  parseRatingState,
  withActiveDay,
  type RatingPromptState,
} from "@/utils/ratingPromptRules";

const STORAGE_KEY = "rating_prompt_v1";

class RatingPromptService {
  private state: RatingPromptState | null = null;
  /** Serialises read-modify-write so launch + foreground can't race. */
  private chain: Promise<unknown> = Promise.resolve();

  get supported(): boolean {
    return Platform.OS === "android";
  }

  private async load(): Promise<RatingPromptState> {
    if (this.state) return this.state;
    let raw: string | null = null;
    try {
      raw = await SecureStorage.getItem(STORAGE_KEY);
    } catch (e: any) {
      logger.warn("Rating prompt: read failed", { module: "RATING_PROMPT", error: e?.message });
    }
    this.state = parseRatingState(raw) ?? initialRatingState(Date.now());
    return this.state;
  }

  private update(fn: (s: RatingPromptState) => RatingPromptState): Promise<RatingPromptState | null> {
    const run = this.chain.then(async () => {
      const prev = await this.load();
      const next = fn(prev);
      this.state = next;
      if (next !== prev) {
        try {
          await SecureStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e: any) {
          logger.warn("Rating prompt: save failed", { module: "RATING_PROMPT", error: e?.message });
        }
      }
      return next;
    });
    // A failure must not jam every later update behind a rejected promise.
    this.chain = run.catch(() => undefined);
    return run.catch(() => null);
  }

  /** Call on launch and on every return to the foreground; counts each IST day once. */
  recordActiveDay(): void {
    if (!this.supported) return;
    void this.update((s) => withActiveDay(s, istTodayString()));
  }

  async isDue(): Promise<boolean> {
    if (!this.supported) return false;
    // Asked from Home, so the app is in use today: count it here too, in case
    // launch hasn't recorded it yet (its init waits on permission prompts).
    const s = await this.update((x) => withActiveDay(x, istTodayString()));
    return !!s && isRatingPromptDue(s, Date.now());
  }

  /** The card became visible: start the cooldown even if it's then ignored. */
  markShown(): void {
    void this.update((s) => ({ ...s, lastShownAt: Date.now(), shownCount: s.shownCount + 1 }));
  }

  /** A star was tapped: never ask again, and send them to the listing. */
  async rate(stars: number): Promise<void> {
    logger.info("Rating prompt: star tapped", { module: "RATING_PROMPT", stars });
    await this.update((s) => ({ ...s, rated: true }));
    await VersionGateService.openStore();
  }
}

export default new RatingPromptService();
