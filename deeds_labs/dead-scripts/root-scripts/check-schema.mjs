import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    const enums = await sql`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'error_severity';
    `;
    console.log('Enum error_severity values:', enums.map(e => e.enumlabel));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

main();