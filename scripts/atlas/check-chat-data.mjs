import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: 'sveltekit-frontend/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const res = await sql`SELECT COUNT(*) FROM chat_messages WHERE user_id IS NOT NULL`;
  console.log('Rows with non-null user_id:', res[0].count);
  
  const res2 = await sql`SELECT user_id FROM chat_messages WHERE user_id IS NOT NULL LIMIT 5`;
  console.log('Sample user_ids:', res2.map(r => r.user_id));
  
  await sql.end();
}

run();
