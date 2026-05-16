import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: 'sveltekit-frontend/.env' });

const sql = postgres(process.env.DATABASE_URL);

async function repair() {
  console.log('--- STARTING SCHEMA REPAIR (UUID -> INTEGER) ---');
  
  const queries = [
    // chat_messages
    'ALTER TABLE chat_messages ALTER COLUMN user_id TYPE integer USING NULL',
    
    // chat_metadata
    'ALTER TABLE chat_metadata ALTER COLUMN user_id TYPE integer USING NULL',
    
    // evidence
    'ALTER TABLE evidence ALTER COLUMN user_id TYPE integer USING NULL',
    
    // audit_log
    'ALTER TABLE audit_log ALTER COLUMN user_id TYPE integer USING NULL'
  ];

  for (const query of queries) {
    try {
      console.log(`Executing: ${query}...`);
      await sql.unsafe(query);
      console.log('  Success.');
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  await sql.end();
  console.log('--- REPAIR COMPLETE ---');
}

repair();
