import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)) });
const chunks = await pool.query(`
  SELECT id, chunk_id, source_ref, content_hash, file_content_hash, line_start, line_end
  FROM codebase_chunk_index
  WHERE source_ref IN ('crates/atlas_packet_parser/Cargo.toml', 'crates/atlas_packet_parser/index.js')
  ORDER BY source_ref, line_start;
`);
console.log("Chunk rows:", chunks.rows);
await pool.end();
