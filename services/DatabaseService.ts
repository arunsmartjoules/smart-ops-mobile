import { Q } from "@nozbe/watermelondb";
import logger from "@/utils/logger";
import {
  database,
  attendanceCollection,
  ticketCollection,
  ticketUpdateCollection,
  areaCollection,
  categoryCollection,
  userSiteCollection,
} from "@/database";
import AttendanceRecord from "@/database/models/AttendanceRecord";
import Ticket from "@/database/models/Ticket";
import TicketUpdate from "@/database/models/TicketUpdate";
import Area from "@/database/models/Area";
import Category from "@/database/models/Category";
import UserSite from "@/database/models/UserSite";

// ============== ATTENDANCE ==============

export const AttendanceDB = {
  async create(data: {
    userId: string;
    siteId: string;
    checkInTime?: number;
    checkInLatitude?: number;
    checkInLongitude?: number;
    status: string;
    serverId?: string;
  }): Promise<AttendanceRecord> {
    try {
      return await database.write(async () => {
        return await attendanceCollection.create((record) => {
          record.userId = data.userId;
          record.siteId = data.siteId;
          record.checkInTime = data.checkInTime || null;
          record.checkInLatitude = data.checkInLatitude || null;
          record.checkInLongitude = data.checkInLongitude || null;
          record.status = data.status;
          record.serverId = data.serverId || null;
          record.isSynced = !!data.serverId;
        });
      });
    } catch (error: any) {
      logger.error("Database error creating attendance record", {
        module: "DATABASE_SERVICE",
        error: error.message,
        data,
      });
      throw error;
    }
  },

  async update(
    id: string,
    data: Partial<{
      checkOutTime: number;
      checkOutLatitude: number;
      checkOutLongitude: number;
      status: string;
      remarks: string;
      isSynced: boolean;
      serverId: string;
    }>
  ): Promise<void> {
    try {
      await database.write(async () => {
        const record = await attendanceCollection.find(id);
        await record.update((r: AttendanceRecord) => {
          if (data.checkOutTime !== undefined)
            r.checkOutTime = data.checkOutTime;
          if (data.checkOutLatitude !== undefined)
            r.checkOutLatitude = data.checkOutLatitude;
          if (data.checkOutLongitude !== undefined)
            r.checkOutLongitude = data.checkOutLongitude;
          if (data.status !== undefined) r.status = data.status;
          if (data.remarks !== undefined) r.remarks = data.remarks;
          if (data.isSynced !== undefined) r.isSynced = data.isSynced;
          if (data.serverId !== undefined) r.serverId = data.serverId;
        });
      });
    } catch (error: any) {
      logger.error("Database error updating attendance record", {
        module: "DATABASE_SERVICE",
        error: error.message,
        id,
        data,
      });
      throw error;
    }
  },

  async getByUserId(userId: string): Promise<AttendanceRecord[]> {
    return await attendanceCollection
      .query(Q.where("user_id", userId), Q.sortBy("created_at", Q.desc))
      .fetch();
  },

  async getTodayByUserId(userId: string): Promise<AttendanceRecord | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const records = await attendanceCollection
      .query(
        Q.where("user_id", userId),
        Q.where("created_at", Q.gte(todayTimestamp))
      )
      .fetch();

    return records.length > 0 ? records[0] : null;
  },

  async getUnsyncedRecords(): Promise<AttendanceRecord[]> {
    return await attendanceCollection
      .query(Q.where("is_synced", false))
      .fetch();
  },

  async markAsSynced(id: string, serverId: string): Promise<void> {
    await this.update(id, { isSynced: true, serverId });
  },
};

// ============== TICKETS ==============

export const TicketDB = {
  async upsertMany(tickets: any[], siteId: string): Promise<void> {
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
            t.siteId = siteId;
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

  async getBySiteId(siteId: string): Promise<Ticket[]> {
    return await ticketCollection
      .query(Q.where("site_id", siteId), Q.sortBy("created_at", Q.desc))
      .fetch();
  },

  async getAll(): Promise<Ticket[]> {
    return await ticketCollection.query(Q.sortBy("created_at", Q.desc)).fetch();
  },

  async queueUpdate(
    ticketId: string,
    updateType: string,
    updateData: any
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
  async upsertMany(areas: any[], siteId: string): Promise<void> {
    await database.write(async () => {
      // Clear old cached areas for this site
      const existing = await areaCollection
        .query(Q.where("site_id", siteId))
        .fetch();
      for (const area of existing) {
        await area.destroyPermanently();
      }

      // Insert new areas
      for (const area of areas) {
        await areaCollection.create((a) => {
          a.serverId = area.id?.toString() || area.value;
          a.siteId = siteId;
          a.name = area.asset_name || area.label || area.name;
          a.cachedAt = Date.now();
        });
      }
    });
  },

  async getBySiteId(siteId: string): Promise<Area[]> {
    return await areaCollection.query(Q.where("site_id", siteId)).fetch();
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
    attendance: number;
    ticketUpdates: number;
  }> {
    const attendance = await attendanceCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    const ticketUpdates = await ticketUpdateCollection
      .query(Q.where("is_synced", false))
      .fetchCount();
    return { attendance, ticketUpdates };
  },
};
