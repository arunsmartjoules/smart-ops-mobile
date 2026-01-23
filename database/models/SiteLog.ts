import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class SiteLog extends Model {
  static table = "site_logs";

  @field("server_id") serverId!: string | null;
  @text("site_id") siteId!: string;
  @text("executor_id") executorId!: string;
  @text("log_name") logName!: string;
  @text("task_name") taskName!: string | null;

  // Temp RH
  @field("temperature") temperature!: number | null;
  @field("rh") rh!: number | null;

  // Water Parameters
  @field("tds") tds!: number | null;
  @field("ph") ph!: number | null;
  @field("hardness") hardness!: number | null;

  // Chemical Dosing
  @text("chemical_dosing") chemicalDosing!: string | null;

  @text("remarks") remarks!: string | null;
  @field("entry_time") entryTime!: number | null;
  @field("end_time") endTime!: number | null;
  @text("signature") signature!: string | null;
  @text("attachment") attachment!: string | null;
  @text("status") status!: string | null;
  @field("is_synced") isSynced!: boolean;

  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
