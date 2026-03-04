import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export default class PMChecklistItem extends Model {
  static table = "pm_checklist_items";

  @field("server_id") serverId!: string | null;
  @text("checklist_master_id") checklistMasterId!: string;
  @text("task_name") taskName!: string;
  @text("field_type") fieldType!: string | null;
  @field("sequence_no") sequenceNo!: number | null;
  @field("image_mandatory") imageMandatory!: boolean | null;
  @field("remarks_mandatory") remarksMandatory!: boolean | null;
  @field("cached_at") cachedAt!: number;
}
