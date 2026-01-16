import { Model } from "@nozbe/watermelondb";
import { field, date, readonly } from "@nozbe/watermelondb/decorators";

export default class AttendanceRecord extends Model {
  static table = "attendance_records";

  @field("server_id") serverId!: string | null;
  @field("user_id") userId!: string;
  @field("site_id") siteId!: string;
  @field("check_in_time") checkInTime!: number | null;
  @field("check_out_time") checkOutTime!: number | null;
  @field("check_in_latitude") checkInLatitude!: number | null;
  @field("check_in_longitude") checkInLongitude!: number | null;
  @field("check_out_latitude") checkOutLatitude!: number | null;
  @field("check_out_longitude") checkOutLongitude!: number | null;
  @field("status") status!: string;
  @field("remarks") remarks!: string | null;
  @field("is_synced") isSynced!: boolean;
  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
