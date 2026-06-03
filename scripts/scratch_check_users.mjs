import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  const result = await sql`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'id'
  `;
  console.log('--- USERS.ID COLUMN TYPE ---');
  result.forEach(row => {
    console.log(`  - ${row.column_name}: ${row.data_type} (${row.udt_name})`);
  });
  await sql.end();
}

main().catch(console.error);


