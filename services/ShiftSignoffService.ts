/**
 * ShiftSignoffService
 *
 * Persists the "End Day" sign-off (summary snapshot + notes + optional images +
 * declaration) to the backend. Offline-safe: when the network is unavailable the
 * whole record is queued; SyncEngine's `shift_signoff` handler POSTs it later.
 *
 * NOTE: this does NOT check the operator out — the sign-off screen calls
 * `AttendanceService.checkOut` separately so the existing online/offline +
 * early-checkout handling is reused unchanged. Images are uploaded to S3 at
 * pick time (the screen stores their public URLs), so the payload only carries
 * already-hosted URLs.
 */

import { v4 as uuidv4 } from "uuid";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { cacheManager } from "./CacheManager";
import logger from "../utils/logger";
import type { ShiftSummary } from "./ShiftSummaryService";

export interface SubmitSignoffInput {
  attendanceId: string;
  userId: string;
  siteCode: string;
  date: string; // IST YYYY-MM-DD
  summary: ShiftSummary;
  notes: string;
  images: string[]; // already-uploaded public URLs
  sectionsAck: Record<string, boolean>;
}

export interface SubmitSignoffResult {
  success: boolean;
  queued?: boolean;
  error?: string;
}

export const ShiftSignoffService = {
  async submit(input: SubmitSignoffInput): Promise<SubmitSignoffResult> {
    const payload = {
      client_request_id: uuidv4(),
      attendance_id: input.attendanceId,
      user_id: input.userId,
      site_code: input.siteCode,
      date: input.date,
      summary: input.summary,
      notes: input.notes || null,
      images: input.images ?? [],
      sections_ack: input.sectionsAck,
      declaration_accepted: true,
    };

    // Try to POST now; on any network/non-2xx failure, queue for later sync.
    try {
      const res = await centralApiFetch(
        `${API_BASE_URL}/api/attendance/${input.attendanceId}/signoff`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (res.ok) {
        logger.info("ShiftSignoffService: sign-off posted", {
          module: "SHIFT_SIGNOFF",
          attendanceId: input.attendanceId,
        });
        return { success: true };
      }
      logger.warn("ShiftSignoffService: POST non-ok, queueing", {
        module: "SHIFT_SIGNOFF",
        status: res.status,
      });
    } catch (e) {
      logger.warn("ShiftSignoffService: POST failed, queueing", {
        module: "SHIFT_SIGNOFF",
        error: e,
      });
    }

    await cacheManager.enqueue({
      entity_type: "shift_signoff",
      operation: "create",
      payload,
    });
    return { success: true, queued: true };
  },
};

export default ShiftSignoffService;
