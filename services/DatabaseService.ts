/**
 * Database Service — Drizzle + PowerSync Edition
 *
 * Provides typed CRUD helpers over the Drizzle schema. Write operations
 * go through PowerSync's tracked mutations and are automatically queued
 * for upload via the SmartOpsConnector.
 */

import { eq, desc, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  db,
  powerSync,
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
    await powerSync.disconnectAndClear();
    logger.info("Database cleared via PowerSync", {
      module: "DATABASE_SERVICE",
    });
  },
};
