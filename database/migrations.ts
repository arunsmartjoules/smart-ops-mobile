import {
  schemaMigrations,
  addColumns,
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
  ],
});
