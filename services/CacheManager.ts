/**
 * CacheManager — Unified SQLite read/write for all cached server data.
 *
 * This is the ONLY module that directly executes INSERT/UPDATE/DELETE
 * against the local SQLite database for cached server data.
 * All errors are caught and logged; methods never throw.
 */

import { eq, asc, desc, and, sql, count } from "drizzle-orm";
import * as FileSystem from "expo-file-system/legacy";
import { v4 as uuidv4 } from "uuid";
import {
  db,
  tickets,
  incidents,
  siteLogs,
  chillerReadings,
  pmInstances,
  pmChecklistItems,
  pmResponses,
  attendanceLogs,
  userSites,
  areas,
  categories,
  logMaster,
  offlineQueue,
  syncMeta,
  ensureDatabaseConnection,
  ensureSiteLogsSchema,
} from "@/database";
import logger from "@/utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataDomain =
  | "tickets"
  | "incidents"
  | "site_logs"
  | "chiller_readings"
  | "pm_instances"
  | "pm_checklist_items"
  | "pm_responses"
  | "attendance"
  | "sites"
  | "areas"
  | "categories"
  | "log_master";

export const ALL_DOMAINS: DataDomain[] = [
  "tickets",
  "incidents",
  "site_logs",
  "chiller_readings",
  "pm_instances",
  "pm_checklist_items",
  "pm_responses",
  "attendance",
  "sites",
  "areas",
  "categories",
  "log_master",
];

export interface CacheQuery {
  where?: Record<string, any>;
  orderBy?: { column: string; direction: "asc" | "desc" };
  limit?: number;
}

export interface OfflineQueueItem {
  entity_type:
    | "ticket_update"
    | "incident_create"
    | "incident_update"
    | "incident_status_update"
    | "incident_rca_status_update"
    | "incident_attachment_add"
    | "ticket_line_item"
    | "attendance_check_in"
    | "attendance_check_out"
    | "notification_token_registration"
    | "site_log_create"
    | "site_log_update"
    | "site_log_delete"
    | "chiller_reading_create"
    | "chiller_reading_update"
    | "chiller_reading_delete"
    | "pm_response_upsert"
    | "pm_instance_update"
    | "attachment_upload";
  operation: "create" | "update" | "delete";
  payload: Record<string, any>;
}

export interface OfflineQueueRow extends OfflineQueueItem {
  id: string;
  created_at: number;
  retry_count: number;
  last_error: string | null;
  status: "pending" | "dead_letter";
}

// ─── Domain → Drizzle table mapping ──────────────────────────────────────────

function getTable(domain: DataDomain) {
  switch (domain) {
    case "tickets":          return tickets;
    case "incidents":        return incidents;
    case "site_logs":        return siteLogs;
    case "chiller_readings": return chillerReadings;
    case "pm_instances":     return pmInstances;
    case "pm_checklist_items": return pmChecklistItems;
    case "pm_responses":     return pmResponses;
    case "attendance":       return attendanceLogs;
    case "sites":            return userSites;
    case "areas":            return areas;
    case "categories":       return categories;
    case "log_master":       return logMaster;
    default:                 return null;
  }
}

// ─── CacheManager implementation ─────────────────────────────────────────────

class CacheManagerImpl {
  // ── read ──────────────────────────────────────────────────────────────────

  async read<T = Record<string, any>>(
    domain: DataDomain,
    query?: CacheQuery,
  ): Promise<T[]> {
    try {
      ensureDatabaseConnection();
      if (domain === "site_logs") {
        ensureSiteLogsSchema();
      }
      const table = getTable(domain);
      if (!table) {
        logger.warn("CacheManager.read: unsupported domain", {
          module: "CACHE_MANAGER",
          domain,
        });
        return [];
      }

      const tableColumns = (table as any);

      // Build where clause from query.where record
      let whereClause: any = undefined;
      if (query?.where && Object.keys(query.where).length > 0) {
        const conditions = Object.entries(query.where)
          .filter(([, val]) => val !== undefined && val !== null)
          .map(([col, val]) => eq(tableColumns[col], val));
        if (conditions.length === 1) {
          whereClause = conditions[0];
        } else if (conditions.length > 1) {
          whereClause = and(...conditions);
        }
      }

      const executeQuery = async () => {
        let q = db.select().from(table as any);
        if (whereClause) q = (q as any).where(whereClause);

        // Apply orderBy
        if (query?.orderBy) {
          const col = tableColumns[query.orderBy.column];
          if (col) {
            q = (q as any).orderBy(
              query.orderBy.direction === "desc" ? desc(col) : asc(col),
            );
          }
        }

        // Apply limit
        if (query?.limit) {
          q = (q as any).limit(query.limit);
        }
        return await q;
      };

      try {
        const rows = await executeQuery();
        return rows as T[];
      } catch (innerError: any) {
        // Recovery attempt for native NPE
        if (innerError.message?.includes("prepareSync") || innerError.message?.includes("NullPointerException")) {
          ensureDatabaseConnection();
          const rows = await executeQuery();
          return rows as T[];
        }
        throw innerError;
      }
    } catch (error) {
      logger.error("CacheManager.read failed", {
        module: "CACHE_MANAGER",
        domain,
        error,
      });
      return [];
    }
  }

  // ── write ─────────────────────────────────────────────────────────────────

  async write(domain: DataDomain, records: Record<string, any>[]): Promise<void> {
    if (!records || records.length === 0) return;

    try {
      ensureDatabaseConnection();
      const table = getTable(domain);
      if (!table) {
        logger.warn("CacheManager.write: unsupported domain", {
          module: "CACHE_MANAGER",
          domain,
        });
        return;
      }

      // ─── Performance Optimization: Batch Upsert ───────────────────────────
      const CHUNK_SIZE = 50; 
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE).map((r) => {
          const normalized: Record<string, any> = {};
          Object.keys(r).forEach((k) => {
            normalized[k] = r[k] === undefined ? null : r[k];
          });
          return normalized;
        });
        
        try {
          const firstRecord = chunk[0];
          const setObj: Record<string, any> = {};
          
          Object.keys(firstRecord).forEach((key) => {
            if (key !== "id" && key !== "created_at" && firstRecord[key] !== undefined) {
              setObj[key] = sql.raw(`excluded.${key}`);
            }
          });

          const performUpsert = async () => {
            await db
              .insert(table as any)
              .values(chunk)
              .onConflictDoUpdate({
                target: (table as any).id,
                set: Object.keys(setObj).length > 0 ? setObj : { updated_at: Date.now() },
              });
          };

          try {
            await performUpsert();
          } catch (innerError: any) {
            // Recovery attempt for native NPE
            if (innerError.message?.includes("prepareSync") || innerError.message?.includes("NullPointerException")) {
              ensureDatabaseConnection();
              await performUpsert();
            } else {
              throw innerError;
            }
          }
        } catch (chunkError: any) {
          logger.error("CacheManager.write: bulk upsert failed, falling back to manual", {
            module: "CACHE_MANAGER",
            domain,
            error: chunkError.message,
          });

          for (const record of chunk) {
            try {
              if (!record?.id) continue;
              const existing = await db
                .select({ id: (table as any).id })
                .from(table as any)
                .where(eq((table as any).id, record.id))
                .limit(1);

              if (existing.length > 0) {
                const { id, created_at, ...updatePart } = record;
                await db
                  .update(table as any)
                  .set({ ...updatePart, updated_at: Date.now() })
                  .where(eq((table as any).id, id));
              } else {
                await db.insert(table as any).values(record);
              }
            } catch (innerErr: any) {
              logger.error("CacheManager.write: manual fallback item failed", {
                module: "CACHE_MANAGER",
                domain,
                recordId: record?.id,
                error: innerErr.message,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error("CacheManager.write failed", {
        module: "CACHE_MANAGER",
        domain,
        error,
      });
      return;
    }

    // Update sync_meta
    try {
      await db
        .insert(syncMeta)
        .values({ domain, last_synced_at: Date.now() })
        .onConflictDoUpdate({
          target: syncMeta.domain,
          set: { last_synced_at: Date.now() },
        });
    } catch (metaError) {
      logger.error("CacheManager.write: sync_meta update failed (non-fatal)", {
        module: "CACHE_MANAGER",
        domain,
        error: metaError,
      });
    }
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  async clear(domain: DataDomain): Promise<void> {
    try {
      const table = getTable(domain);
      if (!table) {
        logger.warn("CacheManager.clear: unsupported domain", {
          module: "CACHE_MANAGER",
          domain,
        });
        return;
      }
      await db.delete(table as any);
    } catch (error) {
      logger.error("CacheManager.clear failed", {
        module: "CACHE_MANAGER",
        domain,
        error,
      });
    }
  }

  // ── clearAll ──────────────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    for (const domain of ALL_DOMAINS) {
      await this.clear(domain);
    }
  }

  // ── getQueueCount ─────────────────────────────────────────────────────────

  async getQueueCount(): Promise<number> {
    try {
      ensureDatabaseConnection();
      if (!db) return 0;
      
      const execute = async () => {
        const result = await db
          .select({ value: count() })
          .from(offlineQueue)
          .where(eq(offlineQueue.status, "pending"));
        return result[0]?.value ?? 0;
      };

      try {
        return await execute();
      } catch (innerError: any) {
        if (innerError.message?.includes("prepareSync") || innerError.message?.includes("NullPointerException")) {
          ensureDatabaseConnection();
          return await execute();
        }
        throw innerError;
      }
    } catch (error) {
      logger.error("CacheManager.getQueueCount failed", {
        module: "CACHE_MANAGER",
        error,
      });
      return 0;
    }
  }

  /**
   * Calculates the total physical cache usage in bytes.
   */
  async getCacheUsage(): Promise<{ totalDbSize: number; attachmentSize: number }> {
    let totalDbSize = 0;
    let attachmentSize = 0;

    try {
      // 1. Get database file size via SQLite PRAGMA
      // Native FileSystem call for 'SQLite/smartops.db' is more reliable
      const dbPath = `${FileSystem.documentDirectory}SQLite/smartops.db`;
      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (dbInfo.exists) {
        totalDbSize = dbInfo.size;
      } else {
        // Fallback for some Android configurations
        const result = await db.run(sql`PRAGMA page_count`);
        const result2 = await db.run(sql`PRAGMA page_size`);
        // Note: db.run might return differently depending on the adapter
        // but FileSystem.getInfoAsync is the standard Expo way.
      }

      // 2. Get attachment directory size
      const attachDir = `${FileSystem.documentDirectory}attachments/`;
      const dirInfo = await FileSystem.getInfoAsync(attachDir);
      if (dirInfo.exists && dirInfo.isDirectory) {
        const files = await FileSystem.readDirectoryAsync(attachDir);
        for (const file of files) {
          const fileInfo = await FileSystem.getInfoAsync(attachDir + file);
          if (fileInfo.exists) {
            attachmentSize += fileInfo.size;
          }
        }
      }
    } catch (error) {
      logger.error("CacheManager.getCacheUsage failed", { module: "CACHE_MANAGER", error });
    }

    return { totalDbSize, attachmentSize };
  }

  // ── enqueue ───────────────────────────────────────────────────────────────

  async enqueue(item: OfflineQueueItem): Promise<void> {
    try {
      await db.insert(offlineQueue).values({
        id: uuidv4(),
        entity_type: item.entity_type,
        operation: item.operation,
        payload: JSON.stringify(item.payload),
        created_at: Date.now(),
        retry_count: 0,
        last_error: null,
        status: "pending",
      });
    } catch (error) {
      logger.error("CacheManager.enqueue failed", {
        module: "CACHE_MANAGER",
        error,
      });
    }
  }

  // ── getQueue ──────────────────────────────────────────────────────────────

  async getQueue(): Promise<OfflineQueueRow[]> {
    try {
      const rows = await db
        .select()
        .from(offlineQueue)
        .where(eq(offlineQueue.status, "pending"))
        .orderBy(asc(offlineQueue.created_at));

      return rows.map((row) => ({
        id: row.id,
        entity_type: row.entity_type as OfflineQueueRow["entity_type"],
        operation: row.operation as OfflineQueueRow["operation"],
        payload: JSON.parse(row.payload),
        created_at: row.created_at,
        retry_count: row.retry_count,
        last_error: row.last_error ?? null,
        status: row.status as OfflineQueueRow["status"],
      }));
    } catch (error) {
      logger.error("CacheManager.getQueue failed", {
        module: "CACHE_MANAGER",
        error,
      });
      return [];
    }
  }

  // ── dequeue ───────────────────────────────────────────────────────────────

  async dequeue(id: string): Promise<void> {
    try {
      await db.delete(offlineQueue).where(eq(offlineQueue.id, id));
    } catch (error) {
      logger.error("CacheManager.dequeue failed", {
        module: "CACHE_MANAGER",
        id,
        error,
      });
    }
  }

  // ── markQueueItemFailed ───────────────────────────────────────────────────

  async markQueueItemFailed(id: string, error: string): Promise<void> {
    try {
      await db
        .update(offlineQueue)
        .set({
          retry_count: sql`${offlineQueue.retry_count} + 1`,
          last_error: error,
        })
        .where(eq(offlineQueue.id, id));
    } catch (err) {
      logger.error("CacheManager.markQueueItemFailed failed", {
        module: "CACHE_MANAGER",
        id,
        error: err,
      });
    }
  }

  // ── deadLetterQueueItem ───────────────────────────────────────────────────

  async deadLetterQueueItem(id: string): Promise<void> {
    try {
      await db
        .update(offlineQueue)
        .set({ status: "dead_letter" })
        .where(eq(offlineQueue.id, id));
    } catch (error) {
      logger.error("CacheManager.deadLetterQueueItem failed", {
        module: "CACHE_MANAGER",
        id,
        error,
      });
    }
  }

  // ── getLastSyncedAt ───────────────────────────────────────────────────────

  async getLastSyncedAt(domain: DataDomain): Promise<number | null> {
    try {
      const rows = await db
        .select()
        .from(syncMeta)
        .where(eq(syncMeta.domain, domain));
      if (rows.length === 0) return null;
      return rows[0].last_synced_at ?? null;
    } catch (error) {
      logger.error("CacheManager.getLastSyncedAt failed", {
        module: "CACHE_MANAGER",
        domain,
        error,
      });
      return null;
    }
  }

  // ── resetAllSyncMeta ──────────────────────────────────────────────────────

  async resetAllSyncMeta(): Promise<void> {
    try {
      await db.delete(syncMeta);
    } catch (error) {
      logger.error("CacheManager.resetAllSyncMeta failed", {
        module: "CACHE_MANAGER",
        error,
      });
    }
  }

  // ── getPendingQueueItemsByType ────────────────────────────────────────────

  /**
   * Returns pending queue items filtered by entity_type.
   * Useful for services that need to check for unsynced local changes
   * before overwriting cached data with API results.
   */
  async getPendingQueueItemsByType(
    entityType: OfflineQueueItem["entity_type"],
  ): Promise<OfflineQueueRow[]> {
    try {
      const rows = await db
        .select()
        .from(offlineQueue)
        .where(
          and(
            eq(offlineQueue.status, "pending"),
            eq(offlineQueue.entity_type, entityType),
          ),
        )
        .orderBy(asc(offlineQueue.created_at));

      return rows.map((row) => ({
        id: row.id,
        entity_type: row.entity_type as OfflineQueueRow["entity_type"],
        operation: row.operation as OfflineQueueRow["operation"],
        payload: JSON.parse(row.payload),
        created_at: row.created_at,
        retry_count: row.retry_count,
        last_error: row.last_error ?? null,
        status: row.status as OfflineQueueRow["status"],
      }));
    } catch (error) {
      logger.error("CacheManager.getPendingQueueItemsByType failed", {
        module: "CACHE_MANAGER",
        entityType,
        error,
      });
      return [];
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const cacheManager = new CacheManagerImpl();
export default cacheManager;
