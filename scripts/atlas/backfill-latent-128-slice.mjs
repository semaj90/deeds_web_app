#!/usr/bin/env node
/** Deterministic latent_128 backfill: SLICE_FIRST_N(latent_256, 128) + L2 renormalize.
 * NOT a new training run, NOT MRL truncation of the raw 768d embedding -- a prefix slice of
 * an already-computed autoencoder output. See openspec/changes/parent-atlas-error-embedding-768-migration
 * task 5.2/5.3 and drizzle/manual/20260912_latent_128_columns.sql. */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const APPLY = flags.has('--apply');
const LANE = String(arg('lane', 'content')); // 'content' or 'error'
const BATCH = Math.max(1, Math.min(2000, Number(arg('batch-size', 500))));
const LIMIT = Math.max(1, Number(arg('limit', 1_000_000)));

const LANES = {
  content: { source: 'latent_256', target: 'latent_128' },
  error: { source: 'error_embedding_latent_256', target: 'error_embedding_latent_128' },
};
if (!LANES[LANE]) throw new Error(`Unknown --lane: ${LANE} (expected 'content' or 'error')`);
const { source, target } = LANES[LANE];

function sliceAndNormalize(vector, dimension) {
  const output = vector.slice(0, dimension);
  const norm = Math.sqrt(output.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('SLICE_ZERO_NORM');
  return output.map((value) => value / norm);
}

function parseHalfvec(raw) {
  if (Array.isArray(raw)) return raw.map(Number);
  return String(raw).replace(/^\[|\]$/g, '').split(',').map(Number);
}

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'latent-128-slice-backfill' });
  const report = { schema: 'atlas.latent-128-slice-backfill.v1', generatedAt: new Date().toISOString(), lane: LANE, source, target, apply: APPLY, selected: 0, written: 0, errors: [] };
  try {
    let offset = 0;
    while (offset < LIMIT) {
      const result = await pool.query(
        `SELECT id::text, ${source} AS source_latent
         FROM codebase_chunk_index
         WHERE ${source} IS NOT NULL AND ${target} IS NULL
         ORDER BY id
         LIMIT $1`,
        [Math.min(BATCH, LIMIT - offset)]
      );
      if (result.rows.length === 0) break;
      report.selected += result.rows.length;

      if (APPLY) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const row of result.rows) {
            const sourceVector = parseHalfvec(row.source_latent);
            const sliced = sliceAndNormalize(sourceVector, 128);
            const literal = `[${sliced.join(',')}]`;
            const updateResult = await client.query(
              `UPDATE codebase_chunk_index SET ${target} = $1::halfvec(128) WHERE id = $2::uuid AND ${target} IS NULL`,
              [literal, row.id]
            );
            report.written += updateResult.rowCount;
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      offset += result.rows.length;
      if (!APPLY) break; // dry-run: same rows would be re-selected forever
    }
    report.status = APPLY ? 'APPLY_PROVEN' : 'DRY_RUN_PROVEN';
  } catch (error) {
    report.status = 'FAIL';
    report.errors.push(error.message);
  } finally {
    await pool.end();
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}

main();
