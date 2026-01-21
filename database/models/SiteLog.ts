import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class SiteLog extends Model {
  static table = "site_logs";

  @field("server_id") serverId!: string | null;
  @text("log_id") logId!: string;
  @text("task_line_id") taskLineId!: string | null;
  @field("sequence_no") sequenceNo!: number | null;
  @text("site_id") siteId!: string;
  @text("executor_id") executorId!: string;

  @field("scheduled_date") scheduledDate!: number | null;
  @field("entry_time") entryTime!: number | null;
  @field("end_time") endTime!: number | null;

  @field("temperature") temperature!: number | null;
  @field("rh") rh!: number | null;

  @field("tds") tds!: number | null;
  @field("ph") ph!: number | null;
  @field("hardness") hardness!: number | null;

  @text("chemical_dosing") chemicalDosing!: string | null;
  @text("remarks") remarks!: string | null;
  @text("main_remarks") mainRemarks!: string | null;
  @text("attachment") attachment!: string | null;
  @text("signature") signature!: string | null;

  @text("log_name") logName!: string;
  @text("task_name") taskName!: string | null;

  @field("is_synced") isSynced!: boolean;
  @field("last_sync") lastSync!: number | null;

  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
