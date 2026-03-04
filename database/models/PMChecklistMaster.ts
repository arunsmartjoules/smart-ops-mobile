import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class PMChecklistMaster extends Model {
  static table = "pm_checklist_master";

  @field("server_id") serverId!: string | null;
  @text("title") title!: string;
  @text("asset_type") assetType!: string | null;
  @text("frequency") frequency!: string | null;
  @field("cached_at") cachedAt!: number;
}
