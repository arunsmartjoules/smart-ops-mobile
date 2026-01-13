import { Model } from "@nozbe/watermelondb";
import { field, date, readonly } from "@nozbe/watermelondb/decorators";

export default class PreventiveMaintenance extends Model {
  static table = "preventive_maintenance";

  @field("server_id") serverId!: string;
  @field("title") title!: string;
  @field("description") description!: string;
  @field("site_name") siteName!: string;
  @field("equipment_type") equipmentType!: string;
  @field("priority") priority!: "low" | "medium" | "high";
  @field("status") status!: "pending" | "in_progress" | "completed";
  @field("assigned_to") assignedTo!: string;
  @date("due_date") dueDate!: Date;
  @date("completed_at") completedAt!: Date;
  @field("is_synced") isSynced!: boolean;
  @field("_deleted") isDeleted!: boolean;
  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
