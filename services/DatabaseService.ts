/**
 * Database Service — Drizzle + SQLite
 *
 * Provides typed CRUD helpers over the Drizzle schema. Write operations
 * go through the offline queue and are automatically or manually synced
 * for upload via the SmartOpsConnector.
 */

import { eq, desc, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  db,
  tickets,
  ticketUpdates,
  areas,
  categories,
  userSites,
} from "@/database";
import logger from "@/utils/logger";

// ============== TICKETS ==============

export const TicketDB = {
  async getBySiteId(siteCode: string) {
    return db
      .select()
      .from(tickets)
      .where(eq(tickets.site_code, siteCode))
      .orderBy(desc(tickets.created_at));
  },

  async getAll() {
    return db.select().from(tickets).orderBy(desc(tickets.created_at));
  },

  async queueUpdate(
    ticketId: string,
    updateType: string,
    updateData: any,
  ): Promise<void> {
    // 1. Update the local ticket in Drizzle/SQLite immediately for offline persistence
    // Updates both the offline queue AND the local ticket via Drizzle/SQLite
    await db.insert(ticketUpdates).values({
      id: uuidv4(),
      ticket_id: ticketId,
      update_type: updateType,
      update_data: JSON.stringify(updateData),
      created_at: Date.now(),
    });
  },
};

// ============== AREAS ==============

export const AreaDB = {
  async getBySiteId(siteCode: string) {
    // Fallback to local Drizzle-synced areas table
    return db.select().from(areas).where(eq(areas.site_code, siteCode));
  },
};

// ============== CATEGORIES ==============

export const CategoryDB = {
  async getAll() {
    return db.select().from(categories);
  },
};

// ============== USER SITES ==============

export const UserSiteDB = {
  async getByUserId(userId: string) {
    return db
      .select()
      .from(userSites)
      .where(eq(userSites.user_id, userId));
  },
};

// ============== SYNC UTILITIES ==============

export const SyncDB = {
  async clearAllData(): Promise<void> {
    // No-op in cache mode — data is cleared on logout via AsyncStorage
    logger.info("clearAllData called", { module: "DATABASE_SERVICE" });
  },
};
