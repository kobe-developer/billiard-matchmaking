import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const { Client } = pg;

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  const sql = readFileSync(
    join(import.meta.dir, "migrations/001_init.sql"),
    "utf-8"
  );

  await client.query(sql);
  console.log("✅ Migration completed successfully");
  await client.end();
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
