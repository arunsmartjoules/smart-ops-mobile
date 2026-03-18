import {
  schemaMigrations,
  addColumns,
  createTable,
} from "@nozbe/watermelondb/Schema/migrations";

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: "pm_instances",
          columns: [{ name: "asset_id", type: "string", isOptional: true }],
        }),
        // WatermelonDB doesn't support easy type conversion in migrations via addColumns.
        // Changing 'progress' from number to string might require a complex migration or a reset.
        // However, for adding asset_id, we can safely use addColumns.
        // Since we already changed the schema to string for 'progress',
        // existing data in that column might stay 'number' internally until rewritten.
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: "pm_responses",
          columns: [{ name: "readings", type: "string", isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        createTable({
          name: "log_master",
          columns: [
            { name: "server_id", type: "string", isOptional: true, isIndexed: true },
            { name: "task_name", type: "string", isIndexed: true },
            { name: "log_name", type: "string", isIndexed: true },
            { name: "sequence_number", type: "number" },
            { name: "log_id", type: "string", isOptional: true },
            { name: "dlr", type: "string", isOptional: true },
            { name: "dbr", type: "string", isOptional: true },
            { name: "nlt", type: "string", isOptional: true },
            { name: "nmt", type: "string", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
  ],
});
