/**
 * Database Initialization — PowerSync + Drizzle
 *
 * Replaces the previous WatermelonDB setup. PowerSync manages the local SQLite
 * database and syncs it with the backend PostgreSQL via logical replication.
 * Drizzle provides type-safe query building on top of the PowerSync database.
 */

import { PowerSyncDatabase } from "@powersync/react-native";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import { powerSyncSchema } from "./powersync-schema";

// PowerSync database instance (manages SQLite + sync)
// Using Quick SQLite (the stable, recommended driver for React Native)
export const powerSync = new PowerSyncDatabase({
  database: {
    dbFilename: "smartops.db",
  },
  schema: powerSyncSchema,
});

// Drizzle query builder wrapping PowerSync for type-safe queries
export const db = wrapPowerSyncWithDrizzle(powerSync);

// Re-export schema tables for convenient imports
export {
  tickets,
  ticketUpdates,
  areas,
  categories,
  userSites,
  siteLogs,
  chillerReadings,
  pmInstances,
  pmChecklistMaster,
  pmChecklistItems,
  pmResponses,
  logMaster,
  attendanceLogs,
} from "./schema";
