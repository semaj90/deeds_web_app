import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log('🔄 Resetting applied status for Phase 79 suggestions...');
  const result = await sql`
    UPDATE error_suggestions
    SET applied = false
    WHERE source = 'phase79-engine'
  `;
  console.log(`✅ Reset ${result.count} suggestions.`);
  await sql.end();
}

main();
