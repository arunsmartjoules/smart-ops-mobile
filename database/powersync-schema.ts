/**
 * PowerSync Client Schema
 *
 * Defines the local SQLite table shapes that PowerSync manages. This schema
 * must match the columns returned by the sync rules in sync-rules.yaml.
 * It is used alongside the Drizzle schema (schema.ts) via the Drizzle driver.
 */

import { column, Schema, TableV2 } from "@powersync/react-native";

const tickets = new TableV2({
  site_code: column.text,
  ticket_number: column.text,
  title: column.text,
  description: column.text,
  status: column.text,
  priority: column.text,
  category: column.text,
  area: column.text,
  assigned_to: column.text,
  created_by: column.text,
  due_date: column.real,
  closed_at: column.real,
  created_at: column.real,
  updated_at: column.real,
});

const ticket_updates = new TableV2(
  {
    ticket_id: column.text,
    update_type: column.text,
    update_data: column.text,
    created_at: column.real,
  },
  { localOnly: true },
);

const areas = new TableV2({
  site_code: column.text,
  asset_name: column.text,
  asset_type: column.text,
  location: column.text,
  description: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const categories = new TableV2({
  category: column.text,
  description: column.text,
});

const user_sites = new TableV2({
  user_id: column.text,
  site_id: column.text,
  site_code: column.text,
  site_name: column.text,
});

const site_logs = new TableV2({
  site_code: column.text,
  executor_id: column.text,
  log_name: column.text,
  task_name: column.text,
  temperature: column.real,
  rh: column.real,
  tds: column.real,
  ph: column.real,
  hardness: column.real,
  chemical_dosing: column.text,
  remarks: column.text,
  entry_time: column.real,
  end_time: column.real,
  signature: column.text,
  assigned_to: column.text,
  attachment: column.text,
  status: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const chiller_readings = new TableV2({
  log_id: column.text,
  site_code: column.text,
  chiller_id: column.text,
  equipment_id: column.text,
  asset_name: column.text,
  asset_type: column.text,
  executor_id: column.text,
  date_shift: column.text,
  assigned_to: column.text,
  reading_time: column.real,
  start_datetime: column.real,
  end_datetime: column.real,
  condenser_inlet_temp: column.real,
  condenser_outlet_temp: column.real,
  evaporator_inlet_temp: column.real,
  evaporator_outlet_temp: column.real,
  compressor_suction_temp: column.real,
  motor_temperature: column.real,
  saturated_condenser_temp: column.real,
  saturated_suction_temp: column.real,
  set_point_celsius: column.real,
  discharge_pressure: column.real,
  main_suction_pressure: column.real,
  oil_pressure: column.real,
  oil_pressure_difference: column.real,
  condenser_inlet_pressure: column.real,
  condenser_outlet_pressure: column.real,
  evaporator_inlet_pressure: column.real,
  evaporator_outlet_pressure: column.real,
  compressor_load_percentage: column.real,
  inline_btu_meter: column.real,
  remarks: column.text,
  sla_status: column.text,
  reviewed_by: column.text,
  signature_text: column.text,
  attachments: column.text,
  status: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const pm_instances = new TableV2({
  site_code: column.text,
  title: column.text,
  asset_id: column.text,
  asset_type: column.text,
  location: column.text,
  frequency: column.text,
  status: column.text,
  progress: column.text,
  assigned_to_name: column.text,
  start_due_date: column.real,
  maintenance_id: column.text,
  client_sign: column.text,
  before_image: column.text,
  after_image: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const pm_checklist_master = new TableV2({
  title: column.text,
  asset_type: column.text,
  frequency: column.text,
  created_at: column.real,
});

const pm_checklist_items = new TableV2({
  checklist_id: column.text,
  task_name: column.text,
  field_type: column.text,
  sequence_no: column.integer,
  image_mandatory: column.integer,
  remarks_mandatory: column.integer,
});

const pm_responses = new TableV2({
  instance_id: column.text,
  checklist_item_id: column.text,
  response_value: column.text,
  readings: column.text,
  remarks: column.text,
  image_url: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const log_master = new TableV2({
  task_name: column.text,
  log_name: column.text,
  sequence_number: column.integer,
  log_id: column.text,
  dlr: column.text,
  dbr: column.text,
  nlt: column.text,
  nmt: column.text,
  created_at: column.real,
  updated_at: column.real,
});

const attendance_logs = new TableV2({
  user_id: column.text,
  site_code: column.text,
  date: column.text,
  check_in_time: column.real,
  check_out_time: column.real,
  check_in_latitude: column.real,
  check_in_longitude: column.real,
  check_out_latitude: column.real,
  check_out_longitude: column.real,
  check_in_address: column.text,
  check_out_address: column.text,
  shift_id: column.text,
  status: column.text,
  remarks: column.text,
  fieldproxy_punch_id: column.integer,
  created_at: column.real,
  updated_at: column.real,
});

export const powerSyncSchema = new Schema({
  tickets,
  ticket_updates,
  areas,
  categories,
  user_sites,
  site_logs,
  chiller_readings,
  pm_instances,
  pm_checklist_master,
  pm_checklist_items,
  pm_responses,
  log_master,
  attendance_logs,
});
