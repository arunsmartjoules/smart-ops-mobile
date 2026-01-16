import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs";
import { Platform } from "react-native";
import { schema } from "./schema";
import AttendanceRecord from "./models/AttendanceRecord";
import Ticket from "./models/Ticket";
import TicketUpdate from "./models/TicketUpdate";
import Area from "./models/Area";
import Category from "./models/Category";
import UserSite from "./models/UserSite";

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
  modelClasses: [
    AttendanceRecord,
    Ticket,
    TicketUpdate,
    Area,
    Category,
    UserSite,
  ],
});

// Export collections for easy access
export const attendanceCollection =
  database.get<AttendanceRecord>("attendance_records");
export const ticketCollection = database.get<Ticket>("tickets");
export const ticketUpdateCollection =
  database.get<TicketUpdate>("ticket_updates");
export const areaCollection = database.get<Area>("areas");
export const categoryCollection = database.get<Category>("categories");
export const userSiteCollection = database.get<UserSite>("user_sites");
