import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 2,
  tables: [
    // Attendance records for offline sync
    tableSchema({
      name: "attendance_records",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "user_id", type: "string", isIndexed: true },
        { name: "site_id", type: "string", isIndexed: true },
        { name: "check_in_time", type: "number", isOptional: true },
        { name: "check_out_time", type: "number", isOptional: true },
        { name: "check_in_latitude", type: "number", isOptional: true },
        { name: "check_in_longitude", type: "number", isOptional: true },
        { name: "check_out_latitude", type: "number", isOptional: true },
        { name: "check_out_longitude", type: "number", isOptional: true },
        { name: "status", type: "string" }, // 'checked_in' | 'completed' | 'pending'
        { name: "remarks", type: "string", isOptional: true },
        { name: "is_synced", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    // Tickets for offline access and updates
    tableSchema({
      name: "tickets",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "site_id", type: "string", isIndexed: true },
        { name: "ticket_number", type: "string" },
        { name: "title", type: "string" },
        { name: "description", type: "string", isOptional: true },
        { name: "status", type: "string" },
        { name: "priority", type: "string" },
        { name: "category", type: "string", isOptional: true },
        { name: "area", type: "string", isOptional: true },
        { name: "assigned_to", type: "string", isOptional: true },
        { name: "created_by", type: "string" },
        { name: "due_date", type: "number", isOptional: true },
        { name: "closed_at", type: "number", isOptional: true },
        { name: "is_synced", type: "boolean" },
        { name: "has_pending_updates", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    // Pending ticket updates for offline sync
    tableSchema({
      name: "ticket_updates",
      columns: [
        { name: "ticket_id", type: "string", isIndexed: true },
        { name: "update_type", type: "string" }, // 'status' | 'details' | 'comment'
        { name: "update_data", type: "string" }, // JSON stringified
        { name: "is_synced", type: "boolean" },
        { name: "created_at", type: "number" },
      ],
    }),
    // Cached areas/assets
    tableSchema({
      name: "areas",
      columns: [
        { name: "server_id", type: "string", isIndexed: true },
        { name: "site_id", type: "string", isIndexed: true },
        { name: "name", type: "string" },
        { name: "cached_at", type: "number" },
      ],
    }),
    // Cached categories
    tableSchema({
      name: "categories",
      columns: [
        { name: "server_id", type: "string", isIndexed: true },
        { name: "name", type: "string" },
        { name: "cached_at", type: "number" },
      ],
    }),
    // User sites for quick access
    tableSchema({
      name: "user_sites",
      columns: [
        { name: "server_id", type: "string", isIndexed: true },
        { name: "user_id", type: "string", isIndexed: true },
        { name: "site_name", type: "string" },
        { name: "cached_at", type: "number" },
      ],
    }),
    // Site logs for Temp RH, Water, and Chemical Dosing
    tableSchema({
      name: "site_logs",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "log_id", type: "string" },
        { name: "task_line_id", type: "string", isOptional: true },
        { name: "sequence_no", type: "number", isOptional: true },
        { name: "site_id", type: "string", isIndexed: true },
        { name: "executor_id", type: "string" },
        { name: "scheduled_date", type: "number", isOptional: true },
        { name: "entry_time", type: "number", isOptional: true },
        { name: "end_time", type: "number", isOptional: true },
        { name: "temperature", type: "number", isOptional: true },
        { name: "rh", type: "number", isOptional: true },
        { name: "tds", type: "number", isOptional: true },
        { name: "ph", type: "number", isOptional: true },
        { name: "hardness", type: "number", isOptional: true },
        { name: "chemical_dosing", type: "string", isOptional: true },
        { name: "remarks", type: "string", isOptional: true },
        { name: "main_remarks", type: "string", isOptional: true },
        { name: "attachment", type: "string", isOptional: true },
        { name: "signature", type: "string", isOptional: true },
        { name: "log_name", type: "string", isIndexed: true },
        { name: "task_name", type: "string", isOptional: true },
        { name: "is_synced", type: "boolean" },
        { name: "last_sync", type: "number", isOptional: true },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    // Chiller equipment readings
    tableSchema({
      name: "chiller_readings",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "log_id", type: "string" },
        { name: "site_id", type: "string", isIndexed: true },
        { name: "chiller_id", type: "string", isOptional: true },
        { name: "equipment_id", type: "string", isOptional: true },
        { name: "executor_id", type: "string" },
        { name: "date_shift", type: "string", isOptional: true },
        { name: "reading_time", type: "number", isOptional: true },
        { name: "start_datetime", type: "number", isOptional: true },
        { name: "end_datetime", type: "number", isOptional: true },
        { name: "condenser_inlet_temp", type: "number", isOptional: true },
        { name: "condenser_outlet_temp", type: "number", isOptional: true },
        { name: "evaporator_inlet_temp", type: "number", isOptional: true },
        { name: "evaporator_outlet_temp", type: "number", isOptional: true },
        { name: "compressor_suction_temp", type: "number", isOptional: true },
        { name: "motor_temperature", type: "number", isOptional: true },
        { name: "saturated_condenser_temp", type: "number", isOptional: true },
        { name: "saturated_suction_temp", type: "number", isOptional: true },
        { name: "set_point_celsius", type: "number", isOptional: true },
        { name: "discharge_pressure", type: "number", isOptional: true },
        { name: "main_suction_pressure", type: "number", isOptional: true },
        { name: "oil_pressure", type: "number", isOptional: true },
        { name: "oil_pressure_difference", type: "number", isOptional: true },
        { name: "condenser_inlet_pressure", type: "number", isOptional: true },
        { name: "condenser_outlet_pressure", type: "number", isOptional: true },
        { name: "evaporator_inlet_pressure", type: "number", isOptional: true },
        {
          name: "evaporator_outlet_pressure",
          type: "number",
          isOptional: true,
        },
        {
          name: "compressor_load_percentage",
          type: "number",
          isOptional: true,
        },
        { name: "inline_btu_meter", type: "number", isOptional: true },
        { name: "remarks", type: "string", isOptional: true },
        { name: "sla_status", type: "string", isOptional: true },
        { name: "reviewed_by", type: "string", isOptional: true },
        { name: "signature_text", type: "string", isOptional: true },
        { name: "attachments", type: "string", isOptional: true },
        { name: "is_synced", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
  ],
});
