import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoEnv = loadRepoEnv();
const url = resolveDatabaseUrl(repoEnv);
const sql = postgres(url);

async function run() {
  try {
    const cols = await sql`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'legal_glossary'
      ORDER BY ordinal_position
    `;
    console.log('legal_glossary columns in live DB:', JSON.stringify(cols, null, 2));

    const atts = await sql`
      SELECT attribute.attname, format_type(attribute.atttypid, attribute.atttypmod) as full_type
      FROM pg_attribute attribute
      JOIN pg_class c ON c.oid = attribute.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'legal_glossary' AND attribute.attnum > 0 AND NOT attribute.attisdropped
    `;
    console.log('legal_glossary Atts:', JSON.stringify(atts, null, 2));
  } finally {
    await sql.end();
  }
}

run();
