import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class PMInstance extends Model {
  static table = "pm_instances";

  @field("server_id") serverId!: string | null;
  @text("site_code") siteCode!: string;
  @text("title") title!: string;
  @text("asset_type") assetType!: string;
  @text("location") location!: string;
  @text("frequency") frequency!: string;
  @text("status") status!: string;
  @field("progress") progress!: number;
  @text("assigned_to_name") assignedToName!: string | null;
  @field("start_due_date") startDueDate!: number | null;
  @field("is_synced") isSynced!: boolean;

  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
