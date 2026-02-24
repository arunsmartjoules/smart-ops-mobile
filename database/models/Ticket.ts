import { Model } from "@nozbe/watermelondb";
import { field, date, readonly } from "@nozbe/watermelondb/decorators";

export default class Ticket extends Model {
  static table = "tickets";

  @field("server_id") serverId!: string | null;
  @field("site_code") siteCode!: string;
  @field("ticket_number") ticketNumber!: string;
  @field("title") title!: string;
  @field("description") description!: string | null;
  @field("status") status!: string;
  @field("priority") priority!: string;
  @field("category") category!: string | null;
  @field("area") area!: string | null;
  @field("assigned_to") assignedTo!: string | null;
  @field("created_by") createdBy!: string;
  @field("due_date") dueDate!: number | null;
  @field("closed_at") closedAt!: number | null;
  @field("is_synced") isSynced!: boolean;
  @field("has_pending_updates") hasPendingUpdates!: boolean;
  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
