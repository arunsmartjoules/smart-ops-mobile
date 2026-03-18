import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs";
import { Platform, NativeModules } from "react-native";
import { schema } from "./schema";
import { migrations } from "./migrations";
import Ticket from "./models/Ticket";
import TicketUpdate from "./models/TicketUpdate";
import Area from "./models/Area";
import Category from "./models/Category";
import UserSite from "./models/UserSite";
import SiteLog from "./models/SiteLog";
import ChillerReading from "./models/ChillerReading";
import PMInstance from "./models/PMInstance";
import PMChecklistMaster from "./models/PMChecklistMaster";
import PMChecklistItem from "./models/PMChecklistItem";
import PMResponse from "./models/PMResponse";
import LogMaster from "./models/LogMaster";

// Choose adapter based on platform and availability
// We check for the native bridge to decide between SQLite (Production/Dev Client)
// and LokiJS (Expo Go / Web). This "Method" ensures zero-config stability in any environment.
const isNative = Platform.OS !== "web";
const hasNativeBridge = !!NativeModules.WMDatabaseBridge;

const getAdapter = () => {
  if (!isNative || !hasNativeBridge) {
    return new LokiJSAdapter({
      schema,
      migrations,
      useWebWorker: false,
      useIncrementalIndexedDB: false, // More stable for simple local storage shims
    });
  }

  return new SQLiteAdapter({
    schema,
    migrations,
    jsi: true,
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
    Ticket,
    TicketUpdate,
    Area,
    Category,
    UserSite,
    SiteLog,
    ChillerReading,
    PMInstance,
    PMChecklistMaster,
    PMChecklistItem,
    PMResponse,
    LogMaster,
  ],
});

// Export collections for easy access
export const ticketCollection = database.get<Ticket>("tickets");
export const ticketUpdateCollection =
  database.get<TicketUpdate>("ticket_updates");
export const areaCollection = database.get<Area>("areas");
export const categoryCollection = database.get<Category>("categories");
export const userSiteCollection = database.get<UserSite>("user_sites");
export const siteLogCollection = database.get<SiteLog>("site_logs");
export const chillerReadingCollection =
  database.get<ChillerReading>("chiller_readings");
export const pmInstanceCollection = database.get<PMInstance>("pm_instances");
export const pmChecklistMasterCollection = database.get<PMChecklistMaster>(
  "pm_checklist_master",
);
export const pmChecklistItemCollection =
  database.get<PMChecklistItem>("pm_checklist_items");
export const pmResponseCollection = database.get<PMResponse>("pm_responses");
export const logMasterCollection = database.get<LogMaster>("log_master");
