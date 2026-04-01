/**
 * Drizzle ORM Schema — SmartOps Local Database
 *
 * These tables define the local SQLite structure used by the Drizzle query
 * builder. Data is populated via explicit API calls (cache-on-fetch) and
 * local writes are synced to the backend through the offline_queue + SyncEngine.
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Tickets ─────────────────────────────────────────────────────────────────

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  site_code: text("site_code").notNull(),
  ticket_number: text("ticket_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  category: text("category"),
  area: text("area"),
  assigned_to: text("assigned_to"),
  created_by: text("created_by").notNull(),
  due_date: real("due_date"),
  closed_at: real("closed_at"),
  before_temp: real("before_temp"),
  after_temp: real("after_temp"),
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});

// ─── Ticket Updates (local write queue) ──────────────────────────────────────

export const ticketUpdates = sqliteTable("ticket_updates", {
  id: text("id").primaryKey(),
  ticket_id: text("ticket_id").notNull(),
  update_type: text("update_type").notNull(),
  update_data: text("update_data").notNull(),
  created_at: real("created_at").notNull(),
});

// ─── Areas / Assets ──────────────────────────────────────────────────────────

export const areas = sqliteTable("areas", {
  id: text("id").primaryKey(),
  site_code: text("site_code").notNull(),
  asset_name: text("asset_name").notNull(),
  asset_type: text("asset_type"),
  location: text("location"),
  description: text("description"),
  created_at: real("created_at"),
  updated_at: real("updated_at"),
});

// ─── Complaint Categories ────────────────────────────────────────────────────

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  description: text("description"),
});

// ─── User Sites ──────────────────────────────────────────────────────────────

export const userSites = sqliteTable("user_sites", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  site_id: text("site_id"),
  site_code: text("site_code").notNull(),
  site_name: text("site_name").notNull(),
});

// ─── Site Logs ───────────────────────────────────────────────────────────────

export const siteLogs = sqliteTable("site_logs", {
  id: text("id").primaryKey(),
  site_code: text("site_code").notNull(),
  executor_id: text("executor_id").notNull(),
  log_name: text("log_name").notNull(),
  task_name: text("task_name"),
  temperature: real("temperature"),
  rh: real("rh"),
  tds: real("tds"),
  ph: real("ph"),
  hardness: real("hardness"),
  chemical_dosing: text("chemical_dosing"),
  remarks: text("remarks"),
  main_remarks: text("main_remarks"),
  entry_time: real("entry_time"),
  end_time: real("end_time"),
  signature: text("signature"),
  assigned_to: text("assigned_to"),
  attachment: text("attachment"),
  status: text("status"),
  scheduled_date: text("scheduled_date"), // YYYY-MM-DD
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});

// ─── Chiller Readings ────────────────────────────────────────────────────────

export const chillerReadings = sqliteTable("chiller_readings", {
  id: text("id").primaryKey(),
  log_id: text("log_id").notNull(),
  site_code: text("site_code").notNull(),
  chiller_id: text("chiller_id"),
  equipment_id: text("equipment_id"),
  asset_name: text("asset_name"),
  asset_type: text("asset_type"),
  executor_id: text("executor_id").notNull(),
  date_shift: text("date_shift"),
  assigned_to: text("assigned_to"),
  reading_time: real("reading_time"),
  start_datetime: real("start_datetime"),
  end_datetime: real("end_datetime"),
  condenser_inlet_temp: real("condenser_inlet_temp"),
  condenser_outlet_temp: real("condenser_outlet_temp"),
  evaporator_inlet_temp: real("evaporator_inlet_temp"),
  evaporator_outlet_temp: real("evaporator_outlet_temp"),
  compressor_suction_temp: real("compressor_suction_temp"),
  motor_temperature: real("motor_temperature"),
  saturated_condenser_temp: real("saturated_condenser_temp"),
  saturated_suction_temp: real("saturated_suction_temp"),
  set_point_celsius: real("set_point_celsius"),
  discharge_pressure: real("discharge_pressure"),
  main_suction_pressure: real("main_suction_pressure"),
  oil_pressure: real("oil_pressure"),
  oil_pressure_difference: real("oil_pressure_difference"),
  condenser_inlet_pressure: real("condenser_inlet_pressure"),
  condenser_outlet_pressure: real("condenser_outlet_pressure"),
  evaporator_inlet_pressure: real("evaporator_inlet_pressure"),
  evaporator_outlet_pressure: real("evaporator_outlet_pressure"),
  compressor_load_percentage: real("compressor_load_percentage"),
  inline_btu_meter: real("inline_btu_meter"),
  remarks: text("remarks"),
  sla_status: text("sla_status"),
  reviewed_by: text("reviewed_by"),
  signature_text: text("signature_text"),
  attachments: text("attachments"),
  status: text("status"),
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});

// ─── PM Instances ────────────────────────────────────────────────────────────

export const pmInstances = sqliteTable("pm_instances", {
  id: text("id").primaryKey(),
  site_code: text("site_code").notNull(),
  title: text("title").notNull(),
  asset_id: text("asset_id"),
  asset_type: text("asset_type").notNull(),
  location: text("location").notNull(),
  frequency: text("frequency").notNull(),
  status: text("status").notNull(),
  progress: text("progress").notNull(),
  assigned_to_name: text("assigned_to_name"),
  start_due_date: real("start_due_date"),
  maintenance_id: text("maintenance_id"),
  client_sign: text("client_sign"),
  before_image: text("before_image"),
  after_image: text("after_image"),
  completed_on: real("completed_on"),
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});

// ─── PM Checklist Master ─────────────────────────────────────────────────────

export const pmChecklistMaster = sqliteTable("pm_checklist_master", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  asset_type: text("asset_type"),
  frequency: text("frequency"),
  created_at: real("created_at"),
});

// ─── PM Checklist Items ──────────────────────────────────────────────────────

export const pmChecklistItems = sqliteTable("pm_checklist_items", {
  id: text("id").primaryKey(),
  checklist_id: text("checklist_id").notNull(),
  task_name: text("task_name").notNull(),
  field_type: text("field_type"),
  sequence_no: integer("sequence_no"),
  image_mandatory: integer("image_mandatory", { mode: "boolean" }),
  remarks_mandatory: integer("remarks_mandatory", { mode: "boolean" }),
});

// ─── PM Responses ────────────────────────────────────────────────────────────

export const pmResponses = sqliteTable("pm_responses", {
  id: text("id").primaryKey(),
  instance_id: text("instance_id").notNull(),
  checklist_item_id: text("checklist_item_id").notNull(),
  response_value: text("response_value"),
  readings: text("readings"),
  remarks: text("remarks"),
  image_url: text("image_url"),
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});

// ─── Log Master ──────────────────────────────────────────────────────────────

export const logMaster = sqliteTable("log_master", {
  id: text("id").primaryKey(),
  task_name: text("task_name").notNull(),
  log_name: text("log_name").notNull(),
  sequence_number: integer("sequence_number").notNull(),
  log_id: text("log_id"),
  dlr: text("dlr"),
  dbr: text("dbr"),
  nlt: text("nlt"),
  nmt: text("nmt"),
  created_at: real("created_at"),
  updated_at: real("updated_at"),
});

// ─── Offline Queue ───────────────────────────────────────────────────────────

export const offlineQueue = sqliteTable("offline_queue", {
  id:          text("id").primaryKey(),
  entity_type: text("entity_type").notNull(),
  operation:   text("operation").notNull(),
  payload:     text("payload").notNull(),
  created_at:  real("created_at").notNull(),
  retry_count: integer("retry_count").notNull().default(0),
  last_error:  text("last_error"),
  status:      text("status").notNull().default("pending"),
});

// ─── Sync Meta ───────────────────────────────────────────────────────────────

export const syncMeta = sqliteTable("sync_meta", {
  domain:         text("domain").primaryKey(),
  last_synced_at: real("last_synced_at"),
});

// ─── Attendance Logs ─────────────────────────────────────────────────────────

export const attendanceLogs = sqliteTable("attendance_logs", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  site_code: text("site_code").notNull(),
  date: text("date").notNull(),
  check_in_time: real("check_in_time"),
  check_out_time: real("check_out_time"),
  check_in_latitude: real("check_in_latitude"),
  check_in_longitude: real("check_in_longitude"),
  check_out_latitude: real("check_out_latitude"),
  check_out_longitude: real("check_out_longitude"),
  check_in_address: text("check_in_address"),
  check_out_address: text("check_out_address"),
  shift_id: text("shift_id"),
  status: text("status").notNull(),
  remarks: text("remarks"),
  fieldproxy_punch_id: integer("fieldproxy_punch_id"),
  created_at: real("created_at"),
  updated_at: real("updated_at"),
});

// ─── Attachment Queue ────────────────────────────────────────────────────────

export const attachmentQueue = sqliteTable("attachment_queue", {
  id: text("id").primaryKey(),
  local_uri: text("local_uri").notNull(),
  bucket_name: text("bucket_name").notNull(),
  remote_path: text("remote_path").notNull(),
  related_entity_type: text("related_entity_type").notNull(), // "site_log" | "chiller_reading" | "pm_response" | "pm_instance" | "ticket_line_item"
  related_entity_id: text("related_entity_id").notNull(),
  related_field: text("related_field").notNull(), // "attachment" | "image_url" | "before_image" | "after_image" | "attachments"
  status: text("status").notNull().default("pending"), // "pending" | "uploading" | "completed" | "failed"
  retry_count: integer("retry_count").notNull().default(0),
  last_error: text("last_error"),
  uploaded_url: text("uploaded_url"),
  created_at: real("created_at").notNull(),
  updated_at: real("updated_at").notNull(),
});
