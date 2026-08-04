import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const pool = new Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5434),
  database: process.env.PGDATABASE ?? "legal_ai_db",
  user: process.env.PGUSER ?? "legal_admin",
  password: process.env.PGPASSWORD,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 20_000,
  application_name: "parent-atlas-drizzle-json-audit",
});

const db = drizzle({ client: pool });

try {
  const result = await db.execute(sql`
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable
    FROM information_schema.columns AS c
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.data_type IN ('json', 'jsonb')
    ORDER BY
      c.table_schema,
      c.table_name,
      c.ordinal_position
  `);

  console.log(JSON.stringify({
    status: "PASS",
    mode: "READ_ONLY",
    json_columns: result.rows,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
