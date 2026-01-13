import { Model } from "@nozbe/watermelondb";
import { field, date, readonly } from "@nozbe/watermelondb/decorators";

export default class SiteLog extends Model {
  static table = "site_logs";

  @field("server_id") serverId!: string;
  @field("site_name") siteName!: string;
  @field("log_type") logType!: "chiller" | "temperature" | "pressure" | "other";
  @field("reading_value") readingValue!: number;
  @field("unit") unit!: string;
  @field("notes") notes!: string;
  @field("logged_by") loggedBy!: string;
  @date("logged_at") loggedAt!: Date;
  @field("is_synced") isSynced!: boolean;
  @field("_deleted") isDeleted!: boolean;
  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
