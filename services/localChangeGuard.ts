import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/database";
import { attachmentQueue, offlineQueue } from "@/database/schema";

/**
 * "Does this device still hold changes to this record that the server hasn't
 * got yet?" — asked before a live update (or any server refresh) overwrites
 * the local copy.
 *
 * Local writes land in the cached row FIRST and are queued to sync after
 * (offline-first), so replacing that row with the server's copy before the
 * queue drains would make a technician's just-saved change vanish from the
 * screen. Two queues can hold such changes:
 *  - offline_queue: rows stay "pending" until the server confirms (then they
 *    are deleted) or are dead-lettered — pending is exactly "unsynced";
 *  - attachment_queue: photos still uploading or waiting to retry.
 *
 * Callers check before fetching AND again right before writing, so a tap that
 * happens while the fetch is in flight is still respected.
 */

const QUEUE_TYPES = {
  incident: ["incident_update", "incident_status_update", "incident_rca_status_update", "incident_attachment_add"],
  pm_instance: ["pm_instance_update", "pm_response_upsert"],
} as const;

/** Which payload field names the record, per queue entity type. */
const PAYLOAD_ID_FIELD: Record<string, string> = {
  pm_response_upsert: "instance_id",
};

const UNFINISHED_UPLOADS = ["pending", "uploading", "failed"];

export async function hasUnsyncedLocalChanges(
  kind: keyof typeof QUEUE_TYPES,
  id: string,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ entity_type: offlineQueue.entity_type, payload: offlineQueue.payload })
      .from(offlineQueue)
      .where(and(eq(offlineQueue.status, "pending"), inArray(offlineQueue.entity_type, [...QUEUE_TYPES[kind]])));
    const queued = rows.some((row) => {
      try {
        const payload = JSON.parse(row.payload);
        return String(payload?.[PAYLOAD_ID_FIELD[row.entity_type] ?? "id"] ?? "") === id;
      } catch {
        return false;
      }
    });
    if (queued) return true;

    if (kind === "pm_instance") {
      const uploads = await db
        .select({ id: attachmentQueue.id })
        .from(attachmentQueue)
        .where(
          and(
            eq(attachmentQueue.related_entity_type, "pm_instance"),
            eq(attachmentQueue.related_entity_id, id),
            inArray(attachmentQueue.status, UNFINISHED_UPLOADS),
          ),
        )
        .limit(1);
      if (uploads.length > 0) return true;
    }
    return false;
  } catch {
    // If we can't tell, keep the local copy — a stale screen beats lost work.
    return true;
  }
}

/**
 * Every record of this kind with unsynced queued edits — one query, for list
 * refreshes that must keep those rows' local copies.
 */
export async function unsyncedIds(kind: keyof typeof QUEUE_TYPES): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const rows = await db
      .select({ entity_type: offlineQueue.entity_type, payload: offlineQueue.payload })
      .from(offlineQueue)
      .where(and(eq(offlineQueue.status, "pending"), inArray(offlineQueue.entity_type, [...QUEUE_TYPES[kind]])));
    for (const row of rows) {
      try {
        const id = JSON.parse(row.payload)?.[PAYLOAD_ID_FIELD[row.entity_type] ?? "id"];
        if (id) ids.add(String(id));
      } catch {
        // unreadable payload — ignore
      }
    }
  } catch {
    // best-effort
  }
  return ids;
}
