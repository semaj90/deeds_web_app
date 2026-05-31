#!/usr/bin/env node
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

const sql = `
SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
       CASE WHEN a.atttypmod > 0 THEN ((a.atttypmod - 4)/4) ELSE NULL END AS dim
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE a.atttypid = 'vector'::regtype
  AND a.attnum > 0
ORDER BY n.nspname, c.relname;
`;

async function main(){
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try{
    const res = await client.query(sql);
    if(!res.rows.length){
      console.log('No pgvector columns found.');
    } else {
      console.log(JSON.stringify(res.rows, null, 2));
    }
  }catch(err){
    console.error('Error querying Postgres:', err.message || err);
    process.exitCode = 2;
  } finally{
    await client.end();
  }
}

main();
