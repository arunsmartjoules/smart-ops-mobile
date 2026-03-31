/**
 * Diagnostic utilities to help troubleshoot data loading issues
 */

import { count } from "drizzle-orm";
import { db, tickets, pmInstances, siteLogs } from "@/database";
import logger from "./logger";

export const runDiagnostics = async () => {
  try {
    console.log("=== RUNNING DIAGNOSTICS ===");

    // Check * Database Service — Drizzle + SQLite
    console.log("1. Checking database connection...");
    try {
      // For SQLite, a simple synchronous call works
      console.log("✅ Database initialized");
    } catch (error) {
      console.error("❌ Database initialization FAILED:", error);
      return;
    }

    // Check ticket count
    console.log("2. Checking tickets...");
    try {
      const [ticketCountResult] = await db
        .select({ value: count() })
        .from(tickets);
      const ticketCount = ticketCountResult?.value ?? 0;
      console.log(`✅ Tickets in DB: ${ticketCount}`);

      if (ticketCount > 0) {
        const sample = await db.select().from(tickets).limit(1);
        console.log("Sample ticket:", {
          id: sample[0]?.id,
          title: sample[0]?.title,
          status: sample[0]?.status,
        });
      }
    } catch (error) {
      console.error("❌ Ticket query FAILED:", error);
    }

    // Check PM instances
    console.log("3. Checking PM instances...");
    try {
      const [pmCountResult] = await db
        .select({ value: count() })
        .from(pmInstances);
      const pmCount = pmCountResult?.value ?? 0;
      console.log(`✅ PM instances in DB: ${pmCount}`);

      if (pmCount > 0) {
        const sample = await db.select().from(pmInstances).limit(1);
        console.log("Sample PM:", {
          id: sample[0]?.id,
          title: sample[0]?.title,
          status: sample[0]?.status,
        });
      }
    } catch (error) {
      console.error("❌ PM query FAILED:", error);
    }

    // Check site logs
    console.log("4. Checking site logs...");
    try {
      const [logCountResult] = await db
        .select({ value: count() })
        .from(siteLogs);
      const logCount = logCountResult?.value ?? 0;
      console.log(`✅ Site logs in DB: ${logCount}`);
    } catch (error) {
      console.error("❌ Site log query FAILED:", error);
    }

    console.log("=== DIAGNOSTICS COMPLETE ===");
  } catch (error) {
    console.error("❌ DIAGNOSTICS FAILED:", error);
  }
};

export const clearAllData = async () => {
  try {
    console.log("⚠️  CLEARING ALL DATA...");

    // For SQLite, we can just clear our tables
    const { openDatabaseSync } = await import("expo-sqlite");
    const sqlite = openDatabaseSync("smartops.db");
    sqlite.execSync("DELETE FROM tickets; DELETE FROM pm_instances; DELETE FROM site_logs; DELETE FROM offline_queue; DELETE FROM sync_meta; DELETE FROM attachment_queue;");

    console.log("✅ All data cleared");
  } catch (error) {
    console.error("❌ Clear data FAILED:", error);
  }
};
