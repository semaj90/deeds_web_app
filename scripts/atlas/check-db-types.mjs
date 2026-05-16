import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function checkTypes() {
  console.log('--- DB COLUMN TYPE CHECK ---');
  
  const tables = await client`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  `;

  console.log(`Checking ${tables.length} tables...`);

  for (const tableRow of tables) {
    const table = tableRow.table_name;
    try {
      const result = await client`
        SELECT column_name, data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = ${table}
        AND (column_name LIKE '%user_id%' 
             OR column_name LIKE '%created_by%' 
             OR column_name LIKE '%assigned_%' 
             OR column_name LIKE '%verified_by%'
             OR column_name LIKE '%author_id%'
             OR column_name LIKE '%actor_id%')
      `;
      
      if (result.length > 0) {
        console.log(`\nTable: ${table}`);
        result.forEach(row => {
          console.log(`  - ${row.column_name}: ${row.data_type} (${row.udt_name})`);
        });
      }
    } catch (err) {
      console.log(`Error checking table ${table}: ${err.message}`);
    }
  }
  
  await client.end();
}

checkTypes();
