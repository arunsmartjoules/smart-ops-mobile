import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export default class Category extends Model {
  static table = "categories";

  @field("server_id") serverId!: string;
  @field("name") name!: string;
  @field("cached_at") cachedAt!: number;
}
