import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function checkSchema() {
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'error_suggestions';
  `;
  console.log('Columns in error_suggestions:', columns);
  await sql.end();
}

checkSchema();
