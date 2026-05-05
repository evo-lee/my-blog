import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DATABASE_URL?.replace("sqlite:", "") || "./blog.db";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
