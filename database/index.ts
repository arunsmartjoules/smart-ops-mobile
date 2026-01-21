import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs";
import { Platform, NativeModules } from "react-native";
import { schema } from "./schema";
import AttendanceRecord from "./models/AttendanceRecord";
import Ticket from "./models/Ticket";
import TicketUpdate from "./models/TicketUpdate";
import Area from "./models/Area";
import Category from "./models/Category";
import UserSite from "./models/UserSite";
import SiteLog from "./models/SiteLog";
import ChillerReading from "./models/ChillerReading";

// Choose adapter based on platform and availability
// We check for the native bridge to decide between SQLite (Production/Dev Client)
// and LokiJS (Expo Go / Web). This "Method" ensures zero-config stability in any environment.
const isNative = Platform.OS !== "web";
const hasNativeBridge = !!NativeModules.WMDatabaseBridge;

const getAdapter = () => {
  if (!isNative || !hasNativeBridge) {
    return new LokiJSAdapter({
      schema,
      useWebWorker: false,
      useIncrementalIndexedDB: false, // More stable for simple local storage shims
    });
  }

  return new SQLiteAdapter({
    schema,
    jsi: false, // JSI can be enabled for performance in fully native builds
    onSetUpError: (error) => {
      console.error("Database setup error:", error);
    },
  });
};

const adapter = getAdapter();

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
    SiteLog,
    ChillerReading,
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
export const siteLogCollection = database.get<SiteLog>("site_logs");
export const chillerReadingCollection =
  database.get<ChillerReading>("chiller_readings");
