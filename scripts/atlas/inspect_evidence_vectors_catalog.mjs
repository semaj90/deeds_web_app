import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoEnv = loadRepoEnv();
const url = resolveDatabaseUrl(repoEnv);
const sql = postgres(url);

async function run() {
  try {
    const cols = await sql`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'evidence_vectors'
      ORDER BY ordinal_position
    `;
    console.log('Columns:', JSON.stringify(cols, null, 2));

    const atts = await sql`
      SELECT attribute.attname, format_type(attribute.atttypid, attribute.atttypmod) as full_type
      FROM pg_attribute attribute
      JOIN pg_class c ON c.oid = attribute.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'evidence_vectors' AND attribute.attnum > 0 AND NOT attribute.attisdropped
    `;
    console.log('Atts:', JSON.stringify(atts, null, 2));

    const cnt = await sql`SELECT count(*) FROM public.evidence_vectors`;
    console.log('Count:', cnt[0].count);

    const rows = await sql`SELECT id, evidence_id, chunk_index, embedding_type, source_field, model, source_revision, created_at, updated_at FROM public.evidence_vectors`;
    console.log('Existing rows:', JSON.stringify(rows, null, 2));

    const indexes = await sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'evidence_vectors'`;
    console.log('Indexes:', JSON.stringify(indexes, null, 2));

    const constraints = await sql`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'public.evidence_vectors'::regclass
    `;
    console.log('Constraints:', JSON.stringify(constraints, null, 2));
  } catch (err) {
    console.error('Error querying catalog:', err);
  } finally {
    await sql.end();
  }
}
run();
