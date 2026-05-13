import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const dbPath = process.env.DATABASE_URL?.replace("sqlite:", "") || "./blog.db";
    const client = new Database(dbPath);
    // Enforce ON DELETE CASCADE and FK validity. Required for nested-comment
    // cascade + the comment-submit race handling (FK error → tRPC CONFLICT).
    client.pragma("foreign_keys = ON");
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
