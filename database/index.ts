import { openDatabaseSync, SQLiteDatabase } from "expo-sqlite";
import { drizzle, ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";
import logger from "@/utils/logger";

// ─── Database Lifecycle ──────────────────────────────────────────────────────

let sqlite: SQLiteDatabase;
export let db: ExpoSQLiteDatabase<typeof schema>;

function ensureSiteLogsMainRemarksColumn() {
  try {
    sqlite.execSync("ALTER TABLE site_logs ADD COLUMN main_remarks TEXT");
  } catch {
    // Column already exists or table is unavailable during boot.
  }
}

/**
 * Initializes or re-initializes the database connection and schema.
 * Called at module load and during recovery from native failures.
 */
function init() {
  try {
    sqlite = openDatabaseSync("smartops.db");
    db = drizzle(sqlite, { schema });

    // Run migrations synchronously to ensure tables always exist.
    sqlite.execSync(`
        CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          site_code TEXT NOT NULL,
          ticket_number TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          category TEXT,
          area TEXT,
          assigned_to TEXT,
          created_by TEXT NOT NULL,
          due_date REAL,
          closed_at REAL,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          incident_id TEXT NOT NULL,
          source TEXT NOT NULL,
          ticket_id TEXT,
          site_code TEXT NOT NULL,
          asset_location TEXT,
          raised_by TEXT,
          incident_created_time REAL NOT NULL,
          incident_updated_time REAL,
          incident_resolved_time REAL,
          fault_symptom TEXT NOT NULL,
          fault_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          operating_condition TEXT,
          immediate_action_taken TEXT,
          attachments TEXT,
          rca_attachments TEXT,
          remarks TEXT,
          status TEXT NOT NULL,
          rca_status TEXT NOT NULL,
          assigned_by TEXT,
          assignment_type TEXT,
          vendor_tagged TEXT,
          rca_maker TEXT,
          rca_checker TEXT,
          assigned_to TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ticket_updates (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          update_type TEXT NOT NULL,
          update_data TEXT NOT NULL,
          created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS areas (
          id TEXT PRIMARY KEY,
          site_code TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          asset_type TEXT,
          location TEXT,
          description TEXT,
          created_at REAL,
          updated_at REAL
        );
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          description TEXT
        );
        CREATE TABLE IF NOT EXISTS user_sites (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          site_id TEXT,
          site_code TEXT NOT NULL,
          site_name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS site_logs (
          id TEXT PRIMARY KEY,
          site_code TEXT NOT NULL,
          executor_id TEXT NOT NULL,
          log_name TEXT NOT NULL,
          task_name TEXT,
          temperature REAL,
          rh REAL,
          tds REAL,
          ph REAL,
          hardness REAL,
          chemical_dosing TEXT,
          remarks TEXT,
          main_remarks TEXT,
          entry_time REAL,
          end_time REAL,
          signature TEXT,
          assigned_to TEXT,
          attachment TEXT,
          status TEXT,
          scheduled_date TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chiller_readings (
          id TEXT PRIMARY KEY,
          log_id TEXT NOT NULL,
          site_code TEXT NOT NULL,
          chiller_id TEXT,
          equipment_id TEXT,
          asset_name TEXT,
          asset_type TEXT,
          executor_id TEXT NOT NULL,
          date_shift TEXT,
          assigned_to TEXT,
          reading_time REAL,
          start_datetime REAL,
          end_datetime REAL,
          condenser_inlet_temp REAL,
          condenser_outlet_temp REAL,
          evaporator_inlet_temp REAL,
          evaporator_outlet_temp REAL,
          compressor_suction_temp REAL,
          motor_temperature REAL,
          saturated_condenser_temp REAL,
          saturated_suction_temp REAL,
          set_point_celsius REAL,
          discharge_pressure REAL,
          main_suction_pressure REAL,
          oil_pressure REAL,
          oil_pressure_difference REAL,
          condenser_inlet_pressure REAL,
          condenser_outlet_pressure REAL,
          evaporator_inlet_pressure REAL,
          evaporator_outlet_pressure REAL,
          compressor_load_percentage REAL,
          inline_btu_meter REAL,
          remarks TEXT,
          sla_status TEXT,
          reviewed_by TEXT,
          signature_text TEXT,
          attachments TEXT,
          status TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pm_instances (
          id TEXT PRIMARY KEY,
          site_code TEXT NOT NULL,
          title TEXT NOT NULL,
          asset_id TEXT,
          asset_type TEXT NOT NULL,
          location TEXT NOT NULL,
          frequency TEXT NOT NULL,
          status TEXT NOT NULL,
          progress TEXT NOT NULL,
          assigned_to_name TEXT,
          start_due_date REAL,
          maintenance_id TEXT,
          client_sign TEXT,
          before_image TEXT,
          after_image TEXT,
          completed_on REAL,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          action_type TEXT NOT NULL,
          description TEXT NOT NULL,
          site_code TEXT,
          created_at REAL NOT NULL
        );
        -- Performance Indexes
        CREATE INDEX IF NOT EXISTS idx_site_logs_lookup ON site_logs (site_code, scheduled_date, log_name);
        CREATE INDEX IF NOT EXISTS idx_site_logs_status ON site_logs (status);
        CREATE INDEX IF NOT EXISTS idx_chiller_readings_lookup ON chiller_readings (site_code, date_shift, log_id);
        CREATE INDEX IF NOT EXISTS idx_chiller_readings_status ON chiller_readings (status);
        CREATE INDEX IF NOT EXISTS idx_tickets_site ON tickets (site_code, status);
        CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents (site_code, status, rca_status);
        CREATE INDEX IF NOT EXISTS idx_activities_user ON activities (user_id, created_at);
        CREATE TABLE IF NOT EXISTS pm_checklist_master (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          asset_type TEXT,
          frequency TEXT,
          created_at REAL
        );
        CREATE TABLE IF NOT EXISTS pm_checklist_items (
          id TEXT PRIMARY KEY,
          checklist_id TEXT NOT NULL,
          task_name TEXT NOT NULL,
          field_type TEXT,
          sequence_no INTEGER,
          image_mandatory INTEGER,
          remarks_mandatory INTEGER
        );
        CREATE TABLE IF NOT EXISTS pm_responses (
          id TEXT PRIMARY KEY,
          instance_id TEXT NOT NULL,
          checklist_item_id TEXT NOT NULL,
          response_value TEXT,
          readings TEXT,
          remarks TEXT,
          image_url TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS log_master (
          id TEXT PRIMARY KEY,
          task_name TEXT NOT NULL,
          log_name TEXT NOT NULL,
          sequence_number INTEGER NOT NULL,
          log_id TEXT,
          dlr TEXT,
          dbr TEXT,
          nlt TEXT,
          nmt TEXT,
          created_at REAL,
          updated_at REAL
        );
        CREATE TABLE IF NOT EXISTS offline_queue (
          id           TEXT PRIMARY KEY,
          entity_type  TEXT NOT NULL,
          operation    TEXT NOT NULL,
          payload      TEXT NOT NULL,
          created_at   REAL NOT NULL,
          retry_count  INTEGER NOT NULL DEFAULT 0,
          last_error   TEXT,
          status       TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS sync_meta (
          domain         TEXT PRIMARY KEY,
          last_synced_at REAL
        );
        CREATE TABLE IF NOT EXISTS attendance_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          site_code TEXT NOT NULL,
          date TEXT NOT NULL,
          check_in_time REAL,
          check_out_time REAL,
          check_in_latitude REAL,
          check_in_longitude REAL,
          check_out_latitude REAL,
          check_out_longitude REAL,
          check_in_address TEXT,
          check_out_address TEXT,
          shift_id TEXT,
          status TEXT NOT NULL,
          remarks TEXT,
          fieldproxy_punch_id INTEGER,
          created_at REAL,
          updated_at REAL
        );
        CREATE TABLE IF NOT EXISTS attachment_queue (
          id TEXT PRIMARY KEY,
          local_uri TEXT NOT NULL,
          bucket_name TEXT NOT NULL,
          remote_path TEXT NOT NULL,
          related_entity_type TEXT NOT NULL,
          related_entity_id TEXT NOT NULL,
          related_field TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          uploaded_url TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );
    `);

    // Run column migrations
    const columnMigrations = [
      "ALTER TABLE site_logs ADD COLUMN scheduled_date TEXT",
      "ALTER TABLE site_logs ADD COLUMN main_remarks TEXT",
      "ALTER TABLE tickets ADD COLUMN before_temp REAL",
      "ALTER TABLE tickets ADD COLUMN after_temp REAL",
      "ALTER TABLE tickets ADD COLUMN due_date REAL",
      "ALTER TABLE tickets ADD COLUMN closed_at REAL",
      "ALTER TABLE pm_instances ADD COLUMN completed_on REAL",
      "ALTER TABLE incidents ADD COLUMN rca_attachments TEXT",
    ];

    for (const migration of columnMigrations) {
      try {
        sqlite.execSync(migration);
      } catch {
        // Column already exists — safe to ignore
      }
    }
    ensureSiteLogsMainRemarksColumn();
  } catch (error) {
    logger.error("Database initialization failed", { module: "DATABASE", error });
  }
}

// Initial boot
init();

/**
 * Ensures the native database handle is valid and connected.
 * If a native failure (like NPE on Android) is detected, it attempts re-initialization.
 */
export function ensureDatabaseConnection(): boolean {
  try {
    if (!sqlite) {
      init();
      return !!sqlite;
    }
    // Lightweight check to see if the native handle is still alive
    sqlite.execSync("SELECT 1");
    ensureSiteLogsMainRemarksColumn();
    return true;
  } catch (error: any) {
    logger.warn("Database connection check failed, attempting recovery", {
      module: "DATABASE",
      error: error.message,
    });
    try {
      init();
      return true;
    } catch (reinitError) {
      logger.error("Database recovery failed", { module: "DATABASE", error: reinitError });
      return false;
    }
  }
}

export function ensureSiteLogsSchema() {
  ensureDatabaseConnection();
  ensureSiteLogsMainRemarksColumn();
}

// Re-export schema tables for convenient imports
export {
  tickets,
  incidents,
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
  offlineQueue,
  syncMeta,
  attachmentQueue,
} from "./schema";

export function initDatabase() {
  // Legacy shim, initialization now handled by ensuring connection on access
  ensureDatabaseConnection();
}

/**
 * Wipes all data from all tables, keeping the schema intact.
 * Essential for multi-user device security on logout.
 */
export async function clearDatabase() {
  try {
    if (!ensureDatabaseConnection()) return;
    
    const tables = [
      "tickets",
      "incidents",
      "ticket_updates",
      "areas",
      "categories",
      "user_sites",
      "site_logs",
      "chiller_readings",
      "pm_instances",
      "activities",
      "pm_checklist_master",
      "pm_checklist_items",
      "pm_responses",
      "log_master",
      "offline_queue",
      "sync_meta",
      "attendance_logs",
      "attachment_queue"
    ];

    sqlite.withTransactionSync(() => {
      for (const table of tables) {
        sqlite.execSync(`DELETE FROM ${table}`);
      }
    });

    logger.info("Database wiped successfully", { module: "DATABASE" });
  } catch (error) {
    logger.error("Failed to wipe database", { module: "DATABASE", error });
  }
}
