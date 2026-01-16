import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 1,
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
  ],
});
