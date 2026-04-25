import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function checkTable() {
  const client = postgres(process.env.DATABASE_URL);

  try {
    console.log('Checking ai_reports table structure...');

    const tableInfo = await client`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ai_reports'
      ORDER BY ordinal_position
    `;
    console.log('ai_reports columns:', tableInfo);

    // Check if FK exists
    const fkInfo = await client`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'ai_reports'
        AND kcu.column_name = 'created_by'
    `;
    console.log('FK constraints on created_by:', fkInfo);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

checkTable();