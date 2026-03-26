/**
 * Diagnostic utilities to help troubleshoot data loading issues
 */

import { database, ticketCollection, pmInstanceCollection, siteLogCollection } from "../database";
import logger from "./logger";

export const runDiagnostics = async () => {
  try {
    console.log("=== RUNNING DIAGNOSTICS ===");
    
    // Check database connection
    console.log("1. Checking database connection...");
    try {
      await database.write(async () => {
        // Simple write test
      });
      console.log("✅ Database connection OK");
    } catch (error) {
      console.error("❌ Database connection FAILED:", error);
      return;
    }

    // Check ticket count
    console.log("2. Checking tickets...");
    try {
      const ticketCount = await ticketCollection.query().fetchCount();
      console.log(`✅ Tickets in DB: ${ticketCount}`);
      
      if (ticketCount > 0) {
        const sample = await ticketCollection.query().fetch();
        console.log("Sample ticket:", {
          id: sample[0]?.id,
          serverId: sample[0]?.serverId,
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
      const pmCount = await pmInstanceCollection.query().fetchCount();
      console.log(`✅ PM instances in DB: ${pmCount}`);
      
      if (pmCount > 0) {
        const sample = await pmInstanceCollection.query().fetch();
        console.log("Sample PM:", {
          id: sample[0]?.id,
          serverId: sample[0]?.serverId,
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
      const logCount = await siteLogCollection.query().fetchCount();
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
    
    await database.write(async () => {
      const tickets = await ticketCollection.query().fetch();
      const pms = await pmInstanceCollection.query().fetch();
      const logs = await siteLogCollection.query().fetch();
      
      for (const ticket of tickets) {
        await ticket.destroyPermanently();
      }
      for (const pm of pms) {
        await pm.destroyPermanently();
      }
      for (const log of logs) {
        await log.destroyPermanently();
      }
    });
    
    console.log("✅ All data cleared");
  } catch (error) {
    console.error("❌ Clear data FAILED:", error);
  }
};
