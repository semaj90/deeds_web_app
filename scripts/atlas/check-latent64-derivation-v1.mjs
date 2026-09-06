#!/usr/bin/env node
// Read-only empirical check: is codebase_chunk_index.latent_64 a slice+L2-renormalize of
// latent_256 (standard Matryoshka Representation Learning), or a separately-learned output?
// Resolves the contradiction flagged in parent-atlas-memory-architecture-freeze's sixth addendum
// between latent-derive.ts (slice hypothesis) and the LATENT-SCHEMA-ALIGN-01 comment
// (separately-learned hypothesis). No writes.
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

const { rows } = await pool.query(`
  SELECT id, latent_256::text AS l256, latent_64::text AS l64
  FROM codebase_chunk_index
  WHERE latent_256 IS NOT NULL AND latent_64 IS NOT NULL
  LIMIT 10
`);
await pool.end();

function parseVec(s) { return s.replace(/^\[|\]$/g, '').split(',').map(Number); }
function l2normalize(v) { const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)); return n === 0 ? v : v.map((x) => x / n); }

const results = rows.map((row) => {
  const l256 = parseVec(row.l256);
  const l64 = parseVec(row.l64);
  const slicePred = l2normalize(l256.slice(0, 64));
  const maxDelta = Math.max(...l64.map((v, i) => Math.abs(v - slicePred[i])));
  const dot = l64.reduce((a, v, i) => a + v * slicePred[i], 0);
  const normA = Math.sqrt(l64.reduce((a, v) => a + v * v, 0));
  const normB = Math.sqrt(slicePred.reduce((a, v) => a + v * v, 0));
  const cosine = dot / (normA * normB);
  return { id: row.id, l256Len: l256.length, l64Len: l64.length, maxDeltaVsSliceHypothesis: maxDelta, cosineVsSliceHypothesis: cosine };
});

// halfvec is float16-backed storage; expect ~1e-3-scale rounding noise on a unit vector, not
// bit-exact equality. Distinguish "matches slice hypothesis within float16 precision" from
// "genuinely different vector" via cosine similarity, which is insensitive to that quantization.
const allMatchSlice = results.every((r) => r.cosineVsSliceHypothesis > 0.999);
const verdict = allMatchSlice ? 'LATENT_64_IS_SLICE_OF_LATENT_256' : 'LATENT_64_IS_NOT_A_SLICE_OF_LATENT_256';
console.log(JSON.stringify({ verdict, sampleCount: results.length, results }, null, 2));
