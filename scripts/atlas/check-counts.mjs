import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function checkCounts() {
  const tables = ['panel_activity_log', 'error_suggestion_states'];
  for (const table of tables) {
    try {
      const res = await sql`SELECT COUNT(*) FROM ${sql(table)}`;
      console.log(`${table}: ${res[0].count} rows`);
    } catch (e) {
      console.log(`${table}: Error ${e.message}`);
    }
  }
  await sql.end();
}

checkCounts();
