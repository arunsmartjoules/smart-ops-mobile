/**
 * ShiftSignoffService
 *
 * Persists the "End Day" sign-off (summary snapshot + notes + signature +
 * declaration) to the backend. Offline-safe: when the network is unavailable
 * the signature is copied to durable storage and the whole record is queued;
 * SyncEngine's `shift_signoff` handler uploads the image and POSTs later.
 *
 * NOTE: this does NOT check the operator out — the sign-off screen calls
 * `AttendanceService.checkOut` separately so the existing online/offline +
 * early-checkout handling is reused unchanged.
 */

import * as FileSystem from "expo-file-system/legacy";
import { v4 as uuidv4 } from "uuid";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { StorageService } from "./StorageService";
import { cacheManager } from "./CacheManager";
import logger from "../utils/logger";
import type { ShiftSummary } from "./ShiftSummaryService";

const SIGNATURE_DIR = `${FileSystem.documentDirectory}shift-signoffs/`;
const S3_BUCKET = "jouleops-attachments";

export interface SubmitSignoffInput {
  attendanceId: string;
  userId: string;
  siteCode: string;
  date: string; // IST YYYY-MM-DD
  summary: ShiftSummary;
  notes: string;
  signatureUri: string; // local ViewShot JPG from SignaturePad
  sectionsAck: Record<string, boolean>;
}

export interface SubmitSignoffResult {
  success: boolean;
  queued?: boolean;
  error?: string;
}

async function persistSignature(
  localUri: string,
  key: string,
): Promise<string> {
  // Copy the (GC-eligible) ViewShot temp file into durable app storage so a
  // queued upload survives app restarts.
  try {
    const info = await FileSystem.getInfoAsync(SIGNATURE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(SIGNATURE_DIR, {
        intermediates: true,
      });
    }
    const dest = `${SIGNATURE_DIR}${key.split("/").pop()}`;
    await FileSystem.copyAsync({ from: localUri, to: dest });
    return dest;
  } catch (e) {
    logger.warn("ShiftSignoffService: failed to persist signature locally", {
      module: "SHIFT_SIGNOFF",
      error: e,
    });
    return localUri; // fall back to the temp URI
  }
}

export const ShiftSignoffService = {
  async submit(input: SubmitSignoffInput): Promise<SubmitSignoffResult> {
    const clientRequestId = uuidv4();
    const signatureKey = `shift-signoffs/${input.attendanceId}_${clientRequestId}.jpg`;

    // 1. Try to upload the signature immediately (online path).
    let signatureUrl: string | null = null;
    try {
      signatureUrl = await StorageService.uploadFile(
        S3_BUCKET,
        signatureKey,
        input.signatureUri,
      );
    } catch (e) {
      logger.warn("ShiftSignoffService: signature upload threw", {
        module: "SHIFT_SIGNOFF",
        error: e,
      });
    }

    const payload = {
      client_request_id: clientRequestId,
      attendance_id: input.attendanceId,
      user_id: input.userId,
      site_code: input.siteCode,
      date: input.date,
      summary: input.summary,
      notes: input.notes || null,
      signature_url: signatureUrl, // real S3 URL, or null → set to local below
      signature_key: signatureKey,
      sections_ack: input.sectionsAck,
      declaration_accepted: true,
    };

    // 2a. Signature uploaded → try to POST the record now.
    if (signatureUrl) {
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
        // Non-2xx (e.g. transient 5xx, or endpoint not deployed yet) → queue.
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
    }

    // 2b. Offline / upload failed → persist signature durably + queue with the
    // local URI; SyncEngine re-uploads before POSTing.
    const durableUri = await persistSignature(input.signatureUri, signatureKey);
    await cacheManager.enqueue({
      entity_type: "shift_signoff",
      operation: "create",
      payload: { ...payload, signature_url: durableUri },
    });
    logger.info("ShiftSignoffService: sign-off queued offline", {
      module: "SHIFT_SIGNOFF",
      attendanceId: input.attendanceId,
    });
    return { success: true, queued: true };
  },
};

export default ShiftSignoffService;
