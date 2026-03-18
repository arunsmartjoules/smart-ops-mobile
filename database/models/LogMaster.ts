import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class LogMaster extends Model {
  static table = "log_master";

  @field("server_id") serverId!: string | null;
  @text("task_name") taskName!: string;
  @text("log_name") logName!: string;
  @field("sequence_number") sequenceNumber!: number;
  @text("log_id") logId!: string | null;
  @text("dlr") dlr!: string | null;
  @text("dbr") dbr!: string | null;
  @text("nlt") nlt!: string | null;
  @text("nmt") nmt!: string | null;

  @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
