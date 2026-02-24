import { Q } from "@nozbe/watermelondb";
import logger from "@/utils/logger";
import {
  database,
  ticketCollection,
  ticketUpdateCollection,
  areaCollection,
  categoryCollection,
  userSiteCollection,
} from "@/database";
import Ticket from "@/database/models/Ticket";
import TicketUpdate from "@/database/models/TicketUpdate";
import Area from "@/database/models/Area";
import Category from "@/database/models/Category";
import UserSite from "@/database/models/UserSite";

// ============== TICKETS ==============

export const TicketDB = {
  async upsertMany(tickets: any[], siteCode: string): Promise<void> {
    await database.write(async () => {
      for (const ticket of tickets) {
        const existing = await ticketCollection
          .query(Q.where("server_id", ticket.id.toString()))
          .fetch();

        if (existing.length > 0) {
          await existing[0].update((t) => {
            t.title = ticket.title || ticket.complaint;
            t.description = ticket.description;
            t.status = ticket.status;
            t.priority = ticket.priority;
            t.category = ticket.category;
            t.area = ticket.area || ticket.asset_name;
            t.assignedTo = ticket.assigned_to;
            t.dueDate = ticket.due_date
              ? new Date(ticket.due_date).getTime()
              : null;
            t.closedAt = ticket.closed_at
              ? new Date(ticket.closed_at).getTime()
              : null;
            t.isSynced = true;
          });
        } else {
          await ticketCollection.create((t) => {
            t.serverId = ticket.id.toString();
            t.siteCode = siteCode;
            t.ticketNumber = ticket.ticket_number || `TKT-${ticket.id}`;
            t.title = ticket.title || ticket.complaint;
            t.description = ticket.description || null;
            t.status = ticket.status;
            t.priority = ticket.priority || "medium";
            t.category = ticket.category || null;
            t.area = ticket.area || ticket.asset_name || null;
            t.assignedTo = ticket.assigned_to || null;
            t.createdBy = ticket.created_by || "";
            t.dueDate = ticket.due_date
              ? new Date(ticket.due_date).getTime()
              : null;
            t.closedAt = ticket.closed_at
              ? new Date(ticket.closed_at).getTime()
              : null;
            t.isSynced = true;
            t.hasPendingUpdates = false;
          });
        }
      }
    });
  },

  async getBySiteId(siteCode: string): Promise<Ticket[]> {
    return await ticketCollection
      .query(Q.where("site_code", siteCode), Q.sortBy("created_at", Q.desc))
      .fetch();
  },

  async getAll(): Promise<Ticket[]> {
    return await ticketCollection.query(Q.sortBy("created_at", Q.desc)).fetch();
  },

  async queueUpdate(
    ticketId: string,
    updateType: string,
    updateData: any,
  ): Promise<void> {
    await database.write(async () => {
      await ticketUpdateCollection.create((u) => {
        u.ticketId = ticketId;
        u.updateType = updateType;
        u.updateData = JSON.stringify(updateData);
        u.isSynced = false;
      });

      // Mark ticket as having pending updates
      const ticket = await ticketCollection.find(ticketId);
      await ticket.update((t) => {
        t.hasPendingUpdates = true;
      });
    });
  },

  async getPendingUpdates(): Promise<TicketUpdate[]> {
    return await ticketUpdateCollection
      .query(Q.where("is_synced", false))
      .fetch();
  },

  async markUpdateSynced(updateId: string): Promise<void> {
    await database.write(async () => {
      const update = await ticketUpdateCollection.find(updateId);
      await update.update((u) => {
        u.isSynced = true;
      });
    });
  },
};

// ============== AREAS ==============

export const AreaDB = {
  async upsertMany(areas: any[], siteCode: string): Promise<void> {
    await database.write(async () => {
      // Clear old cached areas for this site
      const existing = await areaCollection
        .query(Q.where("site_code", siteCode))
        .fetch();
      for (const area of existing) {
        await area.destroyPermanently();
      }

      // Insert new areas
      for (const area of areas) {
        await areaCollection.create((a) => {
          a.serverId = area.id?.toString() || area.value;
          a.siteCode = siteCode;
          a.name = area.asset_name || area.label || area.name;
          a.cachedAt = Date.now();
        });
      }
    });
  },

  async getBySiteId(siteCode: string): Promise<Area[]> {
    return await areaCollection.query(Q.where("site_code", siteCode)).fetch();
  },
};

// ============== CATEGORIES ==============

export const CategoryDB = {
  async upsertMany(categories: any[]): Promise<void> {
    await database.write(async () => {
      // Clear old cached categories
      const existing = await categoryCollection.query().fetch();
      for (const cat of existing) {
        await cat.destroyPermanently();
      }

      // Insert new categories
      for (const cat of categories) {
        await categoryCollection.create((c) => {
          c.serverId = cat.id?.toString() || cat.value;
          c.name = cat.category || cat.label || cat.name;
          c.cachedAt = Date.now();
        });
      }
    });
  },

  async getAll(): Promise<Category[]> {
    return await categoryCollection.query().fetch();
  },
};

// ============== USER SITES ==============

export const UserSiteDB = {
  async upsertMany(sites: any[], userId: string): Promise<void> {
    await database.write(async () => {
      // Clear old cached sites for this user
      const existing = await userSiteCollection
        .query(Q.where("user_id", userId))
        .fetch();
      for (const site of existing) {
        await site.destroyPermanently();
      }

      // Insert new sites
      for (const site of sites) {
        await userSiteCollection.create((s) => {
          s.serverId = site.id?.toString() || site.site_id;
          s.userId = userId;
          s.siteName = site.site_name || site.name;
          s.siteCode = site.site_code;
          s.cachedAt = Date.now();
        });
      }
    });
  },

  async getByUserId(userId: string): Promise<UserSite[]> {
    return await userSiteCollection.query(Q.where("user_id", userId)).fetch();
  },
};

// ============== SYNC UTILITIES ==============

export const SyncDB = {
  async clearAllData(): Promise<void> {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  },

  async getUnsyncedCounts(): Promise<{
    ticketUpdates: number;
  }> {
    const ticketUpdates = await ticketUpdateCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    return { ticketUpdates };
  },
};
