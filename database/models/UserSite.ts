import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export default class UserSite extends Model {
  static table = "user_sites";

  @field("server_id") serverId!: string;
  @field("user_id") userId!: string;
  @field("site_name") siteName!: string;
  @field("cached_at") cachedAt!: number;
}
