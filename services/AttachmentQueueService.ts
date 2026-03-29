/**
 * AttachmentQueueService — Unified offline attachment handling.
 *
 * Provides a single flow for all modules (site logs, chiller readings, PM, tickets):
 *  1. Copy captured image to persistent local storage
 *  2. Store metadata in the attachment_queue SQLite table
 *  3. Enqueue an offline_queue item for SyncEngine to process
 *  4. When online, upload to Supabase Storage and update the related record
 */

import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import * as FileSystem from "expo-file-system/legacy";

import { db, attachmentQueue, siteLogs, chillerReadings, pmResponses, pmInstances } from "@/database";
import { StorageService } from "./StorageService";
import cacheManager from "./CacheManager";
import logger from "@/utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RelatedEntityType =
  | "site_log"
  | "chiller_reading"
  | "pm_response"
  | "pm_instance"
  | "ticket_line_item";

export interface QueueAttachmentParams {
  localUri: string;
  bucketName: string;       // e.g. "jouleops-attachments"
  remotePath: string;       // e.g. "site-logs/{id}_{timestamp}.jpg"
  relatedEntityType: RelatedEntityType;
  relatedEntityId: string;
  relatedField: string;     // e.g. "attachment", "image_url", "before_image"
}

// Persistent local attachment directory
const ATTACHMENT_DIR = `${FileSystem.documentDirectory}attachments/`;

// ─── Service ──────────────────────────────────────────────────────────────────

export const AttachmentQueueService = {
  /**
   * Ensure the persistent attachments directory exists.
   */
  async _ensureDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
    }
  },

  /**
   * Copies a file to persistent local storage and queues it for upload.
   *
   * Returns the persistent local URI for immediate use in the record/UI.
   * The SyncEngine will upload the file and replace the local URI with
   * a remote URL when connectivity is available.
   */
  async queueAttachment(params: QueueAttachmentParams): Promise<string> {
    const {
      localUri,
      bucketName,
      remotePath,
      relatedEntityType,
      relatedEntityId,
      relatedField,
    } = params;

    await this._ensureDir();

    // Generate a unique filename to avoid collisions
    const ext = localUri.split(".").pop() || "jpg";
    const persistentFileName = `${uuidv4()}.${ext}`;
    const persistentUri = `${ATTACHMENT_DIR}${persistentFileName}`;

    // Copy the file from temp/cache to persistent document directory
    try {
      await FileSystem.copyAsync({ from: localUri, to: persistentUri });
    } catch (copyError: any) {
      logger.error("AttachmentQueueService: failed to copy file to persistent storage", {
        module: "ATTACHMENT_QUEUE",
        from: localUri,
        to: persistentUri,
        error: copyError.message,
      });
      // Fall back to using the original URI
      return localUri;
    }

    const now = Date.now();
    const queueId = uuidv4();

    // Insert into attachment_queue table
    try {
      await db.insert(attachmentQueue).values({
        id: queueId,
        local_uri: persistentUri,
        bucket_name: bucketName,
        remote_path: remotePath,
        related_entity_type: relatedEntityType,
        related_entity_id: relatedEntityId,
        related_field: relatedField,
        status: "pending",
        retry_count: 0,
        last_error: null,
        uploaded_url: null,
        created_at: now,
        updated_at: now,
      });
    } catch (dbError: any) {
      logger.error("AttachmentQueueService: failed to insert into attachment_queue", {
        module: "ATTACHMENT_QUEUE",
        error: dbError.message,
      });
    }

    // Enqueue in the offline_queue for SyncEngine to pick up
    await cacheManager.enqueue({
      entity_type: "attachment_upload",
      operation: "create",
      payload: {
        attachment_queue_id: queueId,
      },
    });

    logger.info("AttachmentQueueService: attachment queued", {
      module: "ATTACHMENT_QUEUE",
      queueId,
      relatedEntityType,
      relatedEntityId,
      relatedField,
      persistentUri,
    });

    return persistentUri;
  },

  /**
   * Process a single attachment upload.
   * Called by SyncEngine when processing the offline_queue.
   *
   * Steps:
   *  1. Read the attachment_queue row
   *  2. Upload via StorageService
   *  3. Update the related record's field with the remote URL
   *  4. Mark the attachment_queue row as completed
   *  5. Optionally clean up the local file
   */
  async processAttachment(queueItemId: string): Promise<void> {
    // Fetch the queue row
    const rows = await db
      .select()
      .from(attachmentQueue)
      .where(eq(attachmentQueue.id, queueItemId));

    if (rows.length === 0) {
      logger.warn("AttachmentQueueService: queue item not found, skipping", {
        module: "ATTACHMENT_QUEUE",
        queueItemId,
      });
      return;
    }

    const item = rows[0];

    if (item.status === "completed") {
      logger.debug("AttachmentQueueService: already completed, skipping", {
        module: "ATTACHMENT_QUEUE",
        queueItemId,
      });
      return;
    }

    // Mark as uploading
    await db
      .update(attachmentQueue)
      .set({ status: "uploading", updated_at: Date.now() })
      .where(eq(attachmentQueue.id, queueItemId));

    // Upload
    const uploadedUrl = await StorageService.uploadFile(
      item.bucket_name,
      item.remote_path,
      item.local_uri,
    );

    if (!uploadedUrl) {
      // Upload failed — mark as failed and increment retry
      await db
        .update(attachmentQueue)
        .set({
          status: "failed",
          retry_count: sql`${attachmentQueue.retry_count} + 1`,
          last_error: "Upload returned null",
          updated_at: Date.now(),
        })
        .where(eq(attachmentQueue.id, queueItemId));

      throw new Error("Attachment upload failed");
    }

    // Update the related record's field with the remote URL
    await this._updateRelatedRecord(
      item.related_entity_type,
      item.related_entity_id,
      item.related_field,
      uploadedUrl,
    );

    // Mark as completed
    await db
      .update(attachmentQueue)
      .set({
        status: "completed",
        uploaded_url: uploadedUrl,
        updated_at: Date.now(),
      })
      .where(eq(attachmentQueue.id, queueItemId));

    // Clean up the local file (best-effort)
    try {
      await FileSystem.deleteAsync(item.local_uri, { idempotent: true });
    } catch {
      // Non-fatal — local file cleanup is optional
    }

    logger.info("AttachmentQueueService: attachment uploaded successfully", {
      module: "ATTACHMENT_QUEUE",
      queueItemId,
      uploadedUrl,
      relatedEntityType: item.related_entity_type,
      relatedEntityId: item.related_entity_id,
    });
  },

  /**
   * Update the related SQLite record's field with the uploaded URL.
   */
  async _updateRelatedRecord(
    entityType: string,
    entityId: string,
    field: string,
    url: string,
  ): Promise<void> {
    try {
      switch (entityType) {
        case "site_log":
          await db
            .update(siteLogs)
            .set({ [field]: url, updated_at: Date.now() })
            .where(eq(siteLogs.id, entityId));
          break;

        case "chiller_reading":
          await db
            .update(chillerReadings)
            .set({ [field]: url, updated_at: Date.now() })
            .where(eq(chillerReadings.id, entityId));
          break;

        case "pm_response":
          await db
            .update(pmResponses)
            .set({ [field]: url, updated_at: Date.now() })
            .where(eq(pmResponses.id, entityId));
          break;

        case "pm_instance":
          await db
            .update(pmInstances)
            .set({ [field]: url, updated_at: Date.now() })
            .where(eq(pmInstances.id, entityId));
          break;

        case "ticket_line_item":
          // Ticket line items are managed as API-only records; 
          // the URL is included in the queued line-item payload,
          // so no local DB update is needed here.
          break;

        default:
          logger.warn("AttachmentQueueService: unknown entity type for record update", {
            module: "ATTACHMENT_QUEUE",
            entityType,
          });
      }
    } catch (error: any) {
      logger.error("AttachmentQueueService: failed to update related record", {
        module: "ATTACHMENT_QUEUE",
        entityType,
        entityId,
        field,
        error: error.message,
      });
    }
  },

  /**
   * Get count of pending attachments (for UI display).
   */
  async getPendingCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(attachmentQueue)
        .where(eq(attachmentQueue.status, "pending"));
      return result[0]?.count ?? 0;
    } catch {
      return 0;
    }
  },

  /**
   * Get all pending/failed attachments (for sync status UI).
   */
  async getPendingAttachments(): Promise<Array<{
    id: string;
    related_entity_type: string;
    related_entity_id: string;
    status: string;
    retry_count: number;
    last_error: string | null;
    created_at: number;
  }>> {
    try {
      return db
        .select({
          id: attachmentQueue.id,
          related_entity_type: attachmentQueue.related_entity_type,
          related_entity_id: attachmentQueue.related_entity_id,
          status: attachmentQueue.status,
          retry_count: attachmentQueue.retry_count,
          last_error: attachmentQueue.last_error,
          created_at: attachmentQueue.created_at,
        })
        .from(attachmentQueue)
        .where(
          sql`${attachmentQueue.status} IN ('pending', 'failed', 'uploading')`,
        );
    } catch {
      return [];
    }
  },
};

export default AttachmentQueueService;
