import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "preventive_maintenance",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "title", type: "string" },
        { name: "description", type: "string", isOptional: true },
        { name: "site_name", type: "string" },
        { name: "equipment_type", type: "string" },
        { name: "priority", type: "string" }, // 'low' | 'medium' | 'high'
        { name: "status", type: "string" }, // 'pending' | 'in_progress' | 'completed'
        { name: "assigned_to", type: "string", isOptional: true },
        { name: "due_date", type: "number" }, // Timestamp
        { name: "completed_at", type: "number", isOptional: true },
        { name: "is_synced", type: "boolean" },
        { name: "_deleted", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "site_logs",
      columns: [
        {
          name: "server_id",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "site_name", type: "string" },
        { name: "log_type", type: "string" }, // 'chiller' | 'temperature' | 'pressure' | 'other'
        { name: "reading_value", type: "number" },
        { name: "unit", type: "string" },
        { name: "notes", type: "string", isOptional: true },
        { name: "logged_by", type: "string" },
        { name: "logged_at", type: "number" },
        { name: "is_synced", type: "boolean" },
        { name: "_deleted", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
  ],
});
