// Read-only gate runner for Parent Atlas retrieval lanes.
// Checks AST, lexical, symbol, TurboVec, NLP, and PostgreSQL 18 AIO/bitmap evidence.
// Writes only a receipt under .tmp/atlas/gates/. Issues no DDL, DML, or service changes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, '.tmp', 'atlas', 'gates');
const PG = ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At'];

function sql(text) {
  const res = spawnSync('docker', PG, {
    input: `SET default_transaction_read_only=on;\n${text}\n`,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (res.status !== 0) throw new Error(`psql failed: ${(res.stderr || '').trim().slice(0, 300)}`);
  return res.stdout
    .split('\n')
    .filter((l) => l && !/^SET$|^WARNING/.test(l));
}

async function http(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  }
}

const gates = [];
function gate(id, lane, status, evidence, note) {
  gates.push({ id, lane, status, evidence, note });
}

// AST: content_hash coverage and symbol rows on the live chunk index
{
  const [row] = sql(
    `SELECT count(*), count(*) FILTER (WHERE content_hash IS NULL),
            count(*) FILTER (WHERE ast_symbols IS NOT NULL AND ast_symbols <> '[]'::jsonb)
     FROM codebase_chunk_index;`,
  );
  const [total, nullHash, withSymbols] = row.split('|').map(Number);
  gate('GATE-AST-01', 'ast', nullHash === 0 ? 'PASS' : 'FAIL',
    { total, nullContentHash: nullHash, rowsWithSymbols: withSymbols },
    'Every chunk needs a content_hash before AST binding can be admitted.');
  gate('GATE-SYM-01', 'symbols', withSymbols > 0 ? 'PASS' : 'FAIL',
    { rowsWithSymbols: withSymbols },
    'Symbol lane needs non-empty ast_symbols. Counts only non-empty arrays; NULL and [] both excluded.');
}

// Lexical: GIN index exists, pg_trgm installed, bitmap plan reachable
{
  const [idx] = sql(`SELECT count(*) FROM pg_indexes WHERE indexname='idx_codebase_chunk_bm25_search';`);
  const [trgm] = sql(`SELECT count(*) FROM pg_extension WHERE extname='pg_trgm';`);
  const plan = sql(
    `SET enable_seqscan=off;
     EXPLAIN SELECT id FROM codebase_chunk_index WHERE search_vector @@ to_tsquery('english','retrieval') LIMIT 50;`,
  );
  const usesGin = plan.some((l) => l.includes('idx_codebase_chunk_bm25_search'));
  gate('GATE-LEX-01', 'lexical', Number(idx) === 1 && usesGin ? 'PASS' : 'FAIL',
    { ginIndexPresent: Number(idx) === 1, ginReachableWithSeqscanOff: usesGin },
    'FTS GIN index must be usable by the planner.');
  const defaultPlan = sql(
    `EXPLAIN SELECT id FROM codebase_chunk_index WHERE search_vector @@ to_tsquery('english','retrieval') LIMIT 50;`,
  );
  const defaultSeq = defaultPlan.some((l) => l.includes('Seq Scan'));
  gate('GATE-LEX-02', 'lexical', defaultSeq ? 'NOT_VERIFIED' : 'PASS',
    { defaultPlanIsSeqScan: defaultSeq },
    'Informational: the default planner chooses a seq scan at this selectivity. Needs EXPLAIN ANALYZE before any index decision.');
  gate('GATE-LEX-03', 'lexical', Number(trgm) === 1 ? 'PASS' : 'FAIL',
    { pgTrgmInstalled: Number(trgm) === 1 }, 'Trigram fallback needs the pg_trgm extension.');
}

// PostgreSQL 18 AIO and bitmap evidence
{
  const [version] = sql(`SELECT current_setting('server_version_num');`);
  const [ioMethod] = sql(`SHOW io_method;`);
  const major = Math.floor(Number(version) / 10000);
  gate('GATE-PG18-AIO-01', 'pg18-aio', major === 18 && ioMethod ? 'PASS' : 'FAIL',
    { serverMajor: major, ioMethod },
    'AIO is a planner/executor setting, not an app abstraction. Record the configured method only.');
}

// TurboVec: live readiness from its HTTP health endpoint
{
  const tv = await http('http://127.0.0.1:8791/health');
  const indexed = tv.body?.indexed ?? null;
  gate('GATE-TURBOVEC-01', 'turbovec',
    tv.ok && indexed !== null && indexed > 0 ? 'PASS' : tv.ok ? 'FAIL' : 'NOT_VERIFIED',
    { httpOk: tv.ok, indexed, dim: tv.body?.dim ?? null, turbovecFlag: tv.body?.turbovec ?? null },
    'Index must hold vectors before TurboVec can serve as a candidate lane.');
}

// NLP sidecar capability (torch is reported false, which is expected on this host)
{
  const nlp = await http('http://127.0.0.1:8095/health');
  const caps = nlp.body?.capabilities ?? {};
  gate('GATE-NLP-01', 'nlp',
    nlp.ok && caps.tree_sitter && caps.ast_grep ? 'PASS' : nlp.ok ? 'FAIL' : 'NOT_VERIFIED',
    { httpOk: nlp.ok, tree_sitter: caps.tree_sitter ?? null, ast_grep: caps.ast_grep ?? null, spacy: caps.spacy ?? null },
    'Structural NLP capabilities must be present on :8095.');
}

// Lineage alignment: sample Qdrant chunk_ids against the halfvec and vec768 columns
gate('GATE-ALIGN-01', 'lineage', 'FAIL',
  { note: 'Qdrant codebase_chunks_768 sample (2026-10-12): 1,302 of 1,312 chunk_ids map to content_embedding (halfvec); none to content_embedding_768' },
  'Owner conflict between columns is unresolved; cannot be a PASS until one owner is recorded.');

const summary = gates.reduce((acc, g) => ((acc[g.status] = (acc[g.status] || 0) + 1), acc), {});
const receipt = {
  schema: 'atlas.gates.v1',
  generatedAt: new Date().toISOString(),
  writesPerformed: false,
  summary,
  gates,
};
mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'parent-atlas-gates-v1.json');
writeFileSync(outPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: outPath, summary }, null, 2));
for (const g of gates) console.log(`${g.status.padEnd(13)} ${g.id}`);
