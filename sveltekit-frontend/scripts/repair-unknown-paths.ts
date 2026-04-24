/**
 * repair-unknown-paths.ts
 *
 * Repair pass for codebase_chunk_index rows where relative_path = '__unknown__'.
 *
 * Root cause: mirror-qdrant-to-postgres.ts only checked payload.file_path,
 * but the ast-chunker writes the path as payload.relativePath. 4622 rows
 * were written with '__unknown__' because the field name didn't match.
 *
 * Strategy:
 *   1. SELECT all qdrant_id values from Postgres where relative_path = '__unknown__'
 *   2. For each batch, fetch the Qdrant point payload
 *   3. Extract real path from payload.file_path → relativePath → path
 *   4. UPDATE Postgres with the resolved path + inferred language/extension
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/repair-unknown-paths.ts
 *
 * Optional env:
 *   QDRANT_URL          default: http://localhost:6333
 *   QDRANT_COLLECTION   default: codebase_chunks_768
 *   BATCH_SIZE          default: 100
 *   DRY_RUN             default: false (set to 'true' to preview without writing)
 */

import { Client as PgClient } from 'pg';
import { extname } from 'node:path';

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DATABASE_URL      = process.env.DATABASE_URL!;
const BATCH_SIZE        = Math.min(200, Math.max(1, Number(process.env.BATCH_SIZE ?? 100)));
const DRY_RUN           = process.env.DRY_RUN === 'true';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

// ── Helpers ─────────────────────────────────────────────────────────────────

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Infer language from file extension. */
function inferLanguage(ext: string): string | null {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.svelte': 'svelte', '.vue': 'vue', '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.css': 'css', '.scss': 'scss', '.html': 'html', '.json': 'json', '.yaml': 'yaml',
    '.yml': 'yaml', '.md': 'markdown', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
    '.proto': 'protobuf', '.graphql': 'graphql', '.toml': 'toml',
  };
  return map[ext.toLowerCase()] ?? null;
}

function toQdrantPointId(rawId: string): string | number {
  const text = rawId.trim();
  if (/^\d+$/.test(text)) {
    const numericId = Number(text);
    if (Number.isSafeInteger(numericId) && numericId >= 0) {
      return numericId;
    }
  }
  return text;
}

/** Fetch Qdrant points by ID batch. */
async function fetchQdrantPoints(
  ids: Array<string | number>
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[repair] Qdrant fetch failed: ${res.status}`);
      return result;
    }
    const data = await res.json() as { result?: Array<{ id: string | number; payload?: Record<string, unknown> }> };
    for (const pt of data.result ?? []) {
      if (pt.payload) result.set(String(pt.id), pt.payload);
    }
  } catch (err) {
    console.warn(`[repair] Qdrant fetch error:`, (err as Error)?.message);
  }
  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();

  console.log(`[repair] Connected to Postgres`);
  console.log(`[repair] Qdrant: ${QDRANT_URL}/${QDRANT_COLLECTION}`);
  console.log(`[repair] Batch size: ${BATCH_SIZE}`);
  if (DRY_RUN) console.log(`[repair] *** DRY RUN — no writes ***`);

  // 1. Find all bad-path rows (empty string OR '__unknown__')
  const { rows: unknownRows } = await pg.query<{ qdrant_id: string }>(
    `SELECT qdrant_id FROM codebase_chunk_index
     WHERE relative_path = '__unknown__' OR relative_path = '' OR relative_path IS NULL
     ORDER BY qdrant_id`
  );

  console.log(`[repair] Found ${unknownRows.length} rows with bad relative_path (empty, null, or __unknown__)`);
  if (unknownRows.length === 0) {
    console.log(`[repair] Nothing to repair.`);
    await pg.end();
    return;
  }

  let repaired = 0;
  let stillUnknown = 0;
  let errors = 0;

  // 2. Process in batches
  for (let i = 0; i < unknownRows.length; i += BATCH_SIZE) {
    const batch = unknownRows.slice(i, i + BATCH_SIZE);
    const ids = batch.map((r) => toQdrantPointId(r.qdrant_id));

    // Fetch Qdrant payloads
    const payloads = await fetchQdrantPoints(ids);

    for (const { qdrant_id } of batch) {
      const payload = payloads.get(qdrant_id);
      if (!payload) {
        // Point doesn't exist in Qdrant — can't repair
        stillUnknown++;
        continue;
      }

      // Extract real path (same fallback chain as fixed mirror script)
      const resolvedPath = textOrNull(payload.file_path)
        ?? textOrNull(payload.relativePath)
        ?? textOrNull(payload.path)
        ?? null;

      if (!resolvedPath) {
        // Qdrant payload also has no path — truly unknown
        stillUnknown++;
        continue;
      }

      // Infer metadata from path
      const ext = extname(resolvedPath).toLowerCase() || null;
      const language = ext ? inferLanguage(ext) : null;

      if (DRY_RUN) {
        console.log(`  [dry] ${qdrant_id} → ${resolvedPath} (${language ?? 'unknown lang'})`);
        repaired++;
        continue;
      }

      // 3. UPDATE Postgres
      try {
        await pg.query(
          `UPDATE codebase_chunk_index
           SET relative_path = $1,
               extension     = COALESCE(extension, $2),
               language      = COALESCE(language, $3),
               updated_at    = now()
           WHERE qdrant_id = $4
             AND (relative_path = '__unknown__' OR relative_path = '' OR relative_path IS NULL)`,
          [resolvedPath, ext, language, qdrant_id]
        );
        repaired++;
      } catch (err) {
        console.warn(`  [error] ${qdrant_id}: ${(err as Error)?.message}`);
        errors++;
      }
    }

    const pct = Math.round(((i + batch.length) / unknownRows.length) * 100);
    process.stdout.write(`\r[repair] Progress: ${i + batch.length}/${unknownRows.length} (${pct}%) — repaired: ${repaired}, still unknown: ${stillUnknown}, errors: ${errors}`);
  }

  console.log(`\n[repair] Done.`);
  console.log(`  Repaired:       ${repaired}`);
  console.log(`  Still unknown:  ${stillUnknown} (no path in Qdrant payload either)`);
  console.log(`  Errors:         ${errors}`);

  if (!DRY_RUN && repaired > 0) {
    // Show updated coverage
    const { rows } = await pg.query<{ total: string; with_path: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (
                WHERE relative_path IS NOT NULL
                  AND relative_path <> '__unknown__'
                  AND relative_path <> ''
              ) AS with_path
       FROM codebase_chunk_index`
    );
    const total = Number(rows[0].total);
    const withPath = Number(rows[0].with_path);
    console.log(`  Coverage: ${withPath}/${total} (${((withPath / total) * 100).toFixed(1)}%) rows have real paths`);
  }

  await pg.end();
}

main().catch((err) => {
  console.error('[repair] Fatal:', err);
  process.exit(1);
});
