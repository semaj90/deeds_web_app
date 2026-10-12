import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './scripts/atlas/connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const paths = [
  'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
  'src/lib/server/ace/context-assembler.ts',
  'src/lib/server/features/ai/ace/context-assembler.ts'
];
const res = await pool.query(
  "SELECT id, relative_path, source_ref, line_start, line_end, length(content) as content_len FROM codebase_chunk_index WHERE source_ref = ANY($1) OR relative_path = ANY($1)",
  [paths]
);
console.log(`Found ${res.rows.length} chunks:`, res.rows);
await pool.end();
