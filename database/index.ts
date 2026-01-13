import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs";
import { Platform } from "react-native";
import { schema } from "./schema";
import PreventiveMaintenance from "./models/PreventiveMaintenance";
import SiteLog from "./models/SiteLog";

// Choose adapter based on platform
const adapter =
  Platform.OS === "web"
    ? new LokiJSAdapter({
        schema,
        useWebWorker: false,
        useIncrementalIndexedDB: true,
      })
    : new SQLiteAdapter({
        schema,
        jsi: true, // Enable JSI for better performance
        onSetUpError: (error) => {
          console.error("Database setup error:", error);
        },
      });

// Create database instance
export const database = new Database({
  adapter,
  modelClasses: [PreventiveMaintenance, SiteLog],
});
