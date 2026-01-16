import { Model } from "@nozbe/watermelondb";
import { field, date, readonly } from "@nozbe/watermelondb/decorators";

export default class TicketUpdate extends Model {
  static table = "ticket_updates";

  @field("ticket_id") ticketId!: string;
  @field("update_type") updateType!: string;
  @field("update_data") updateData!: string;
  @field("is_synced") isSynced!: boolean;
  @readonly @date("created_at") createdAt!: Date;
}
