import pg, { QueryResultRow } from "pg";

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on("error", (err) => {
  console.error("Unexpected DB client error", err);
});

export async function query<T extends QueryResultRow>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await db.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.SHOW_QUERY_LOG === "true") {
    console.log(`[DB] ${duration}ms | ${text}`);
  }

  return res;
}

export async function getClient() {
  return db.connect();
}
