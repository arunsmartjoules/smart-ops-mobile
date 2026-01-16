import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export default class Area extends Model {
  static table = "areas";

  @field("server_id") serverId!: string;
  @field("site_id") siteId!: string;
  @field("name") name!: string;
  @field("cached_at") cachedAt!: number;
}
