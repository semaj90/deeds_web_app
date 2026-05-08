/**
 * patch-cluster-embeddings.ts
 *
 * Fills in missing summary_embedding values for cluster_summaries rows.
 * Uses the same dual-endpoint approach (new /api/embed + fallback /api/embeddings).
 *
 * Usage:
 *   npx tsx scripts/patch-cluster-embeddings.ts
 *   npx tsx scripts/patch-cluster-embeddings.ts --all   # re-embed all rows, not just nulls
 */
import pg from 'pg';

const OLLAMA_URL  = process.env.OLLAMA_URL  ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const PG_URL      = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const PATCH_ALL   = process.argv.includes('--all');

const pool = new pg.Pool({ connectionString: PG_URL });

async function embedText(text: string): Promise<number[] | null> {
  for (const [url, body, extract] of [
    [
      `${OLLAMA_URL}/api/embed`,
      JSON.stringify({ model: EMBED_MODEL, input: text }),
      (d: any) => Array.isArray(d.embeddings?.[0]) ? (d.embeddings[0] as number[]) : null,
    ],
    [
      `${OLLAMA_URL}/api/embeddings`,
      JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      (d: any) => Array.isArray(d.embedding) ? (d.embedding as number[]) : null,
    ],
  ] as [string, string, (d: any) => number[] | null][]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const vec = extract(data);
      if (vec && vec.length === 768) return vec;
      if (vec) process.stdout.write(`  bad dim(${vec.length}) from ${url} → `);
    } catch (e: any) {
      process.stdout.write(`  [${url.split('/').pop()}] err: ${e.message?.slice(0, 40)} → `);
    }
  }
  return null;
}

async function main() {
  const whereClause = PATCH_ALL
    ? ''
    : 'WHERE summary_embedding IS NULL';

  const { rows } = await pool.query(
    `SELECT id, gpu_cluster, summary FROM cluster_summaries ${whereClause} ORDER BY gpu_cluster`
  );

  console.log(`Patching ${rows.length} cluster summary embedding(s) (model=${EMBED_MODEL})...`);
  if (rows.length === 0) {
    console.log('Nothing to patch.');
    await pool.end();
    return;
  }

  let ok = 0, fail = 0;
  for (const row of rows) {
    process.stdout.write(`  Cluster ${row.gpu_cluster}: `);
    const embedding = await embedText(row.summary as string);
    if (!embedding) {
      console.log('SKIP (no valid embedding returned)');
      fail++;
      continue;
    }
    await pool.query(
      'UPDATE cluster_summaries SET summary_embedding = $1::vector, updated_at = now() WHERE id = $2',
      [JSON.stringify(embedding), row.id]
    );
    console.log('✓');
    ok++;
  }

  console.log(`\nDone: ${ok} patched, ${fail} failed.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
