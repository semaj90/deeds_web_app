import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const sql = postgres(connectionString);

async function main() {
  console.log('Clearing error_suggestions table...');
  await sql`DELETE FROM error_suggestions`;
  console.log('error_suggestions table cleared.');
  process.exit(0);
}

main().catch(console.error);