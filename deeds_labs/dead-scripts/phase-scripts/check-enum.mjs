import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const sql = postgres(DATABASE_URL);

async function main() {
  console.log('🔍 Checking evidence_type enum...');
  try {
    const result = await sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'evidence_type';
    `;
    console.log('Enum values:', result.map(r => r.enumlabel));
  } catch (e) {
    console.error('Error checking enum:', e);
  } finally {
    await sql.end();
  }
}

main();
