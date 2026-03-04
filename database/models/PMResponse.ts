import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class PMResponse extends Model {
  static table = "pm_responses";

  @field("server_id") serverId!: string | null;
  @text("instance_id") instanceId!: string;
  @text("checklist_item_id") checklistItemId!: string;
  @text("response_value") responseValue!: string | null;
  @text("remarks") remarks!: string | null;
  @text("image_url") imageUrl!: string | null;
  @field("is_synced") isSynced!: boolean;

  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
