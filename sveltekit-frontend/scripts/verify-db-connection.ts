
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL?.replace('5434', '5432') || "postgresql://legal_admin:123456@localhost:5434/legal_ai_db";

console.log(`Testing connection to: ${DATABASE_URL}`);

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

async function main() {
  try {
    const client = await pool.connect();
    console.log("✅ Successfully connected to PostgreSQL via pg.Pool");
    client.release();

    const db = drizzle(pool);
    // Use the sql tagged template from our patch/module
    const result = await db.execute(sql`SELECT NOW()`);

    console.log("✅ Drizzle ORM query execution successful");
    console.log("Query Result:", result.rows[0]);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }
}

main();
