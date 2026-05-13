#!/usr/bin/env node
/**
 * P5 — Codebase Relationship Mapper
 *
 * Extracts 7 semantic edge types from source files, writes them to
 * code_relations (Postgres) and mirrors select high-value edges to Neo4j.
 *
 * Usage:
 *   node scripts/wiki/extract-code-relations.mjs
 *   node scripts/wiki/extract-code-relations.mjs --dry-run
 *   node scripts/wiki/extract-code-relations.mjs --no-neo4j
 *   node scripts/wiki/extract-code-relations.mjs --type READS_REDIS_KEY
 *   node scripts/wiki/extract-code-relations.mjs --quiet
 *
 * npm scripts: relation:extract, relation:extract:dry, relation:extract:quiet
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'src');

dotenv.config({ path: resolve(ROOT, '.env') });

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_NEO4J   = args.includes('--no-neo4j');
const QUIET      = args.includes('--quiet');
const TYPE_FILTER = (() => {
  const ti = args.indexOf('--type');
  return ti !== -1 ? args[ti + 1] : null;
})();

function log(...msg) {
  if (!QUIET) console.log(...msg);
}

// ── Import extractor (compiled via tsx or ts-node?) ───────────────────────────
// The extractor is a .ts file. We import it via a compiled shim using tsx
// installed as a dev dependency. If that fails, we fall back to a bundled copy.

let extractAllSemanticRelations, extractSemanticRelations, collectScanTargets;

try {
  // tsx register: works if tsx is in node_modules
  const { createRequire } = await import('node:module');
  // Dynamic import with tsx transform
  const mod = await import(
    /* @vite-ignore */ `${ROOT}/src/lib/server/graph/relationship-extractor.ts`
  );
  extractAllSemanticRelations = mod.extractAllSemanticRelations;
  extractSemanticRelations = mod.extractSemanticRelations;
  collectScanTargets = mod.collectScanTargets;
} catch {
  // Fallback: re-implement minimal extraction in pure JS
  log('[warn] Could not import TypeScript extractor directly; using JS fallback.');
  const fallback = await importFallback();
  extractAllSemanticRelations = fallback.extractAllSemanticRelations;
  extractSemanticRelations = fallback.extractSemanticRelations;
  collectScanTargets = fallback.collectScanTargets;
}

async function importFallback() {
  const { readFileSync, readdirSync, statSync, existsSync } = await import('node:fs');
  const path = await import('node:path');

  const KNOWN_TABLES = [
    'users','sessions','email_verification_codes','password_reset_tokens',
    'cases','criminals','evidence','analysis_jobs','evidence_relationships',
    'documents','legal_documents','storage_files','vector_metadata','case_scores',
    'embedding_cache','user_ai_queries','auto_tags','vector_outbox','vector_jobs',
    'case_activities','attachment_verifications','canvas_states','canvas_annotations',
    'canvas_autosaves','ai_reports','codebase_audit_reports','agent_sessions',
    'citations','citation_tags','citation_collections','collection_citations',
    'reports','report_audit_log','report_versions','saved_reports','themes',
    'persons_of_interest','poi_photos','poi_relationships','timeline_events',
    'hash_verifications','content_embeddings','user_embeddings','chat_embeddings',
    'evidence_vectors','evidence_analysis_cache','case_embeddings','rag_sessions',
    'rag_messages','statutes','statute_chunks','legal_precedents','document_chunks',
    'research_summaries','legal_glossary','codebase_chunks','case_notes',
    'error_fingerprints','context_timeline','code_relations','metadata_envelopes',
    'codebase_audit_events','ace_retrieval_runs','ace_retrieval_hits',
    'agent_context_files','directory_context_bindings','ace_context_sources',
    'search_analytics','query_sketches','chunk_hit_log','search_query_log',
    'qlora_dataset','prompt_leaderboard',
  ];

  const KNOWN_QDRANT = [
    'evidence_items','legal_documents','legal_cases','codebase_chunks_768',
    'codebase_chunks','chat_messages','embedding_cache','glyph_atlas',
    'legal_canon_chunks','fictional_case_chunks','legal_glossary',
  ];

  const KNOWN_NEO4J_LABELS = [
    'CodebaseFile','Component','Route','Store','ServerModule','File',
    'Case','Evidence','Citation','Statute','LegalDocument','POI',
    'WikiPage','Gap','Run','Cluster','GPUCluster','DirectorySummary',
    'AgentsMd','ResearchSummary','HyperedgeGroup',
  ];

  const SCANNABLE_EXTS = new Set(['.ts','.svelte','.js','.mjs','.mts']);
  const SKIP_DIRS = new Set(['node_modules','.svelte-kit','dist','build','.git','static']);

  function shortSnippet(line) { return line.trim().slice(0, 120); }

  function findNearestAgentsMd(absPath, srcRoot) {
    let dir = path.dirname(absPath);
    const root = path.resolve(srcRoot);
    while (dir.startsWith(root)) {
      const candidate = path.resolve(dir, 'AGENTS.md');
      if (existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  function extractSemanticRelations(absPath, srcRoot, content) {
    const edges = [];
    let src;
    try { src = content ?? readFileSync(absPath, 'utf8'); } catch { return []; }
    const relPath = path.relative(srcRoot, absPath).replace(/\\/g, '/');
    const lines = src.split('\n');

    // EXPORTS_SYMBOL
    const namedExportRe = /\bexport\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
    const reExportRe = /\bexport\s+\{([^}]+)\}/g;
    const defaultExportRe = /\bexport\s+default\s+(?:function|class)?\s*(\w+)/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      namedExportRe.lastIndex = 0;
      while ((m = namedExportRe.exec(line)) !== null)
        edges.push({ sourceFile: relPath, targetKey: m[1], relationType: 'EXPORTS_SYMBOL', confidence: 0.95, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'regex' } });
      reExportRe.lastIndex = 0;
      while ((m = reExportRe.exec(line)) !== null)
        m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(s => /^\w+$/.test(s)).forEach(sym =>
          edges.push({ sourceFile: relPath, targetKey: sym, relationType: 'EXPORTS_SYMBOL', confidence: 0.85, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'regex' } }));
      const dm = defaultExportRe.exec(line);
      if (dm?.[1]) edges.push({ sourceFile: relPath, targetKey: dm[1], relationType: 'EXPORTS_SYMBOL', confidence: 0.90, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'regex' } });
    }

    // READS_REDIS_KEY / WRITES_REDIS_KEY
    const redisReadRe = /\bredis\s*\.\s*(?:get|hget|hgetall|lrange|zrange|smembers|exists|ttl)\s*\(\s*(['"`])([^'"` ,)\n]{1,200})\1/g;
    const redisWriteRe = /\bredis\s*\.\s*(?:set|setex|hset|lpush|rpush|sadd|zadd|expire|del|incr|decr|publish)\s*\(\s*(['"`])([^'"` ,)\n]{1,200})\1/g;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      redisReadRe.lastIndex = 0;
      while ((m = redisReadRe.exec(line)) !== null)
        if (m[2].length > 2) edges.push({ sourceFile: relPath, targetKey: m[2], relationType: 'READS_REDIS_KEY', confidence: m[2].includes('${') ? 0.65 : 0.90, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'literal' } });
      redisWriteRe.lastIndex = 0;
      while ((m = redisWriteRe.exec(line)) !== null)
        if (m[2].length > 2) edges.push({ sourceFile: relPath, targetKey: m[2], relationType: 'WRITES_REDIS_KEY', confidence: m[2].includes('${') ? 0.65 : 0.90, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'literal' } });
    }

    // QUERIES_TABLE
    const tablePattern = KNOWN_TABLES.join('|');
    const sqlTableRe = new RegExp(`(?:FROM|INTO|UPDATE|TABLE|from|into|update|table)\\s+['"\`]?(${tablePattern})['"\`]?`, 'g');
    const drizzleTableRe = new RegExp(`\\.(?:from|insert|update|delete)\\(\\s*(${tablePattern})(?:\\s*[,)]|\\b)`, 'g');
    const tableHits = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      sqlTableRe.lastIndex = 0;
      while ((m = sqlTableRe.exec(line)) !== null)
        if (!tableHits.has(m[1])) { tableHits.add(m[1]); edges.push({ sourceFile: relPath, targetKey: m[1], relationType: 'QUERIES_TABLE', confidence: 0.88, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'literal' } }); }
      drizzleTableRe.lastIndex = 0;
      while ((m = drizzleTableRe.exec(line)) !== null)
        if (!tableHits.has(m[1])) { tableHits.add(m[1]); edges.push({ sourceFile: relPath, targetKey: m[1], relationType: 'QUERIES_TABLE', confidence: 0.92, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'literal' } }); }
    }

    // QUERIES_QDRANT_COLLECTION
    const qdrantRe = new RegExp(`['"\`](${KNOWN_QDRANT.join('|')})['"\`]`, 'g');
    const qdrantHits = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; let m;
      qdrantRe.lastIndex = 0;
      while ((m = qdrantRe.exec(line)) !== null)
        if (!qdrantHits.has(m[1])) { qdrantHits.add(m[1]); edges.push({ sourceFile: relPath, targetKey: m[1], relationType: 'QUERIES_QDRANT_COLLECTION', confidence: 0.93, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'literal' } }); }
    }

    // QUERIES_NEO4J_LABEL
    const cypherRe = new RegExp(`\\(\\w*:(${KNOWN_NEO4J_LABELS.join('|')})\\b`, 'g');
    const neo4jHits = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; let m;
      cypherRe.lastIndex = 0;
      while ((m = cypherRe.exec(line)) !== null)
        if (!neo4jHits.has(m[1])) { neo4jHits.add(m[1]); edges.push({ sourceFile: relPath, targetKey: m[1], relationType: 'QUERIES_NEO4J_LABEL', confidence: 0.91, evidence: { line: i+1, snippet: shortSnippet(line), matchKind: 'regex' } }); }
    }

    // HAS_AGENTS_SCOPE
    const agentsMd = findNearestAgentsMd(absPath, srcRoot);
    if (agentsMd) {
      const agentsRelPath = path.relative(srcRoot, agentsMd).replace(/\\/g, '/');
      edges.push({ sourceFile: relPath, targetKey: agentsRelPath, relationType: 'HAS_AGENTS_SCOPE', confidence: 0.85, evidence: { matchKind: 'walkup' } });
    }

    return edges;
  }

  function collectScanTargets(srcRoot, maxFiles = 3000) {
    const results = [];
    function walk(dir) {
      if (results.length >= maxFiles) return;
      let entries;
      try { entries = readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (results.length >= maxFiles) return;
        if (SKIP_DIRS.has(entry)) continue;
        const full = path.resolve(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) walk(full);
        else if (SCANNABLE_EXTS.has('.' + entry.split('.').pop())) results.push(full);
      }
    }
    walk(srcRoot);
    return results;
  }

  function extractAllSemanticRelations(srcRoot, maxFiles = 3000) {
    const t0 = Date.now();
    const targets = collectScanTargets(srcRoot, maxFiles);
    const allEdges = [];
    const errors = [];
    const edgeCounts = { EXPORTS_SYMBOL:0, READS_REDIS_KEY:0, WRITES_REDIS_KEY:0, QUERIES_TABLE:0, QUERIES_QDRANT_COLLECTION:0, QUERIES_NEO4J_LABEL:0, HAS_AGENTS_SCOPE:0 };
    for (const p of targets) {
      try { const edges = extractSemanticRelations(p, srcRoot); allEdges.push(...edges); }
      catch (err) { errors.push(`${p}: ${String(err)}`); }
    }
    for (const e of allEdges) edgeCounts[e.relationType] = (edgeCounts[e.relationType] ?? 0) + 1;
    return { totalFiles: targets.length, totalEdges: allEdges.length, edgeCounts, edges: allEdges, durationMs: Date.now() - t0, errors };
  }

  return { extractAllSemanticRelations, extractSemanticRelations, collectScanTargets };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n[P5] Codebase Relationship Mapper\n');
  log(`  SRC root : ${SRC}`);
  log(`  Dry run  : ${DRY_RUN}`);
  log(`  Neo4j    : ${!NO_NEO4J}`);
  if (TYPE_FILTER) log(`  Filter   : ${TYPE_FILTER}`);
  log('');

  // ── Step 1: Extract ──────────────────────────────────────────────────────
  log('[1/4] Extracting semantic relations from source...');
  const result = extractAllSemanticRelations(SRC, 3000);
  let edges = result.edges;
  if (TYPE_FILTER) edges = edges.filter(e => e.relationType === TYPE_FILTER);

  log(`  Scanned  : ${result.totalFiles} files in ${result.durationMs}ms`);
  log(`  Edges    : ${edges.length}${TYPE_FILTER ? ` (filtered to ${TYPE_FILTER})` : ''}`);
  for (const [type, count] of Object.entries(result.edgeCounts)) {
    log(`    ${type.padEnd(32)} ${count}`);
  }
  if (result.errors.length > 0) {
    log(`  Errors   : ${result.errors.length}`);
    result.errors.slice(0, 5).forEach(e => log(`    ${e}`));
  }

  if (DRY_RUN) {
    log('\n[dry-run] Skipping Postgres and Neo4j writes.');
    const sample = edges.filter(e => e.relationType !== 'EXPORTS_SYMBOL' && e.relationType !== 'HAS_AGENTS_SCOPE').slice(0, 20);
    if (sample.length > 0) {
      log('\nSample edges (non-EXPORTS_SYMBOL):');
      for (const e of sample) {
        log(`  ${e.relationType.padEnd(32)} ${e.sourceFile} → ${e.targetKey}`);
      }
    }
    await writeArtifact(result, edges);
    return;
  }

  // ── Step 2: Write to Postgres code_relations ─────────────────────────────
  log('\n[2/4] Writing to Postgres code_relations...');
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('  [ERROR] DATABASE_URL not set. Skipping Postgres write.');
  } else {
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
    try {
      // Deduplicate by (sourceFile, targetKey, relationType) — keep highest confidence
      const deduped = new Map();
      for (const e of edges) {
        const key = `${e.sourceFile}|${e.targetKey}|${e.relationType}`;
        const existing = deduped.get(key);
        if (!existing || e.confidence > existing.confidence) deduped.set(key, e);
      }
      const dedupedEdges = Array.from(deduped.values());
      log(`  Deduped  : ${edges.length} → ${dedupedEdges.length} unique edges`);

      let written = 0;
      let skipped = 0;
      const BATCH = 200;

      for (let i = 0; i < dedupedEdges.length; i += BATCH) {
        const batch = dedupedEdges.slice(i, i + BATCH);
        const values = batch.map((e, idx) => {
          const offset = idx * 5;
          return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}::jsonb, now())`;
        }).join(', ');

        const params = batch.flatMap(e => [
          e.sourceFile,
          e.targetKey,
          e.relationType,
          e.confidence,
          JSON.stringify(e.evidence ?? {}),
        ]);

        await pool.query(
          `INSERT INTO code_relations (source_file, target_key, relation_type, confidence, evidence, created_at)
           VALUES ${values}
           ON CONFLICT (source_file, target_key, relation_type)
           DO UPDATE SET confidence = EXCLUDED.confidence, evidence = EXCLUDED.evidence`,
          params
        ).catch(err => {
          // Table might not have unique constraint yet — silently skip duplicates
          skipped += batch.length;
          log(`  [warn] batch write error: ${err.message?.slice(0, 80)}`);
        });
        if (skipped === 0) written += batch.length;
      }
      log(`  Written  : ${dedupedEdges.length - skipped} edges to code_relations`);
    } finally {
      await pool.end();
    }
  }

  // ── Step 3: Mirror to Neo4j ───────────────────────────────────────────────
  // Mirror only high-value non-EXPORTS_SYMBOL edges (those have known fixed targets)
  const NEO4J_TYPES = new Set(['READS_REDIS_KEY', 'WRITES_REDIS_KEY', 'QUERIES_TABLE', 'QUERIES_QDRANT_COLLECTION', 'QUERIES_NEO4J_LABEL']);
  const neo4jEdges = edges.filter(e => NEO4J_TYPES.has(e.relationType));

  if (!NO_NEO4J && neo4jEdges.length > 0) {
    log(`\n[3/4] Mirroring ${neo4jEdges.length} edges to Neo4j...`);
    const NEO4J_URI      = process.env.NEO4J_URI      ?? 'bolt://localhost:7687';
    const NEO4J_USER     = process.env.NEO4J_USER     ?? 'neo4j';
    const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'neo4j123';

    try {
      const neo4j = await import('neo4j-driver');
      const driver = neo4j.default.driver(NEO4J_URI, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
      const session = driver.session();
      try {
        const BATCH = 200;
        let synced = 0;

        for (let i = 0; i < neo4jEdges.length; i += BATCH) {
          const batch = neo4jEdges.slice(i, i + BATCH);
          await session.run(
            `UNWIND $batch AS e
             MERGE (src:CodebaseFile {filePath: e.source})
             MERGE (tgt:SemanticTarget {key: e.target, kind: e.kind})
             MERGE (src)-[r:SEMANTIC_REL {type: e.type}]->(tgt)
             SET r.confidence = e.conf, r.updatedAt = datetime()`,
            {
              batch: batch.map(e => ({
                source: e.sourceFile,
                target: e.targetKey,
                kind:   e.relationType.split('_').slice(-1)[0].toLowerCase(),
                type:   e.relationType,
                conf:   e.confidence,
              }))
            }
          );
          synced += batch.length;
        }
        log(`  Synced   : ${synced} edges to Neo4j`);
      } finally {
        await session.close();
        await driver.close();
      }
    } catch (err) {
      log(`  [warn] Neo4j unavailable — skipping. (${String(err).slice(0, 80)})`);
    }
  } else if (!NO_NEO4J) {
    log('\n[3/4] No Neo4j-eligible edges after filtering.');
  } else {
    log('\n[3/4] Neo4j skipped (--no-neo4j).');
  }

  // ── Step 4: Write artifact ────────────────────────────────────────────────
  log('\n[4/4] Writing JSON artifact...');
  await writeArtifact(result, edges);

  log('\n✅ Done.\n');
}

/**
 * stratifiedSample — take up to `perType` edges per relation type, excluding
 * EXPORTS_SYMBOL (too noisy) and HAS_AGENTS_SCOPE (too voluminous).
 * Result is sorted by type so the artifact is easy to read.
 */
function stratifiedSample(edges, perType = 30) {
  const SKIP = new Set(['EXPORTS_SYMBOL', 'HAS_AGENTS_SCOPE']);
  const byType = new Map();
  for (const e of edges) {
    const t = e.relationType ?? 'UNKNOWN';
    if (SKIP.has(t)) continue;
    const bucket = byType.get(t) ?? [];
    if (bucket.length < perType) bucket.push(e);
    byType.set(t, bucket);
  }
  // Flatten in consistent order
  const ORDER = ['READS_REDIS_KEY','WRITES_REDIS_KEY','QUERIES_TABLE','QUERIES_QDRANT_COLLECTION','QUERIES_NEO4J_LABEL'];
  const out = [];
  for (const t of ORDER) {
    if (byType.has(t)) { out.push(...byType.get(t)); byType.delete(t); }
  }
  for (const bucket of byType.values()) out.push(...bucket);
  return out;
}

const ACE_BASENAMES = new Set([
  'context-assembler.ts', 'multi-lane-retrieval.ts', 'retrieval-lanes.ts',
  'cache-keys.ts', 'ngram-retrieval.ts', 'error-fingerprint.ts',
  'graph-expander.ts', 'qdrant-manager.ts', 'gemma4-agent.ts',
  'trace-subagent-orchestrator.ts', 'synthesis-memory-archiver.ts', 'dual-embedder.ts',
]);

function aceEdges(edges) {
  return edges.filter(e => {
    if (!e.sourceFile) return false;
    const base = e.sourceFile.replace(/\\/g, '/').split('/').pop();
    return ACE_BASENAMES.has(base);
  });
}

async function writeArtifact(result, edges) {
  const outDir = resolve(ROOT, 'logs/task-output');
  try { mkdirSync(outDir, { recursive: true }); } catch {}
  const runId = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
  const artifact = {
    runId,
    totalFiles: result.totalFiles,
    totalEdges: result.totalEdges,
    filtered: edges.length,
    edgeCounts: result.edgeCounts,
    durationMs: result.durationMs,
    errors: result.errors.slice(0, 20),
    sample: stratifiedSample(edges, 30),
    aceEdges: aceEdges(edges),
  };
  const out = resolve(outDir, 'code-relations-latest.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2), 'utf-8');
  log(`  Artifact : ${out}`);

  // ── Per-run memory artifacts ──────────────────────────────────────────────
  // Write structured maps to memory/runs/<runId>/ so ACE + Gemma4 can query
  // relationship context without re-scanning the codebase on each request.
  const runsDir = resolve(ROOT, 'memory/runs', runId);
  try {
    mkdirSync(runsDir, { recursive: true });

    // relationship_map.json — edge counts + top files by out-degree
    const sourceFreq = {};
    for (const e of edges) sourceFreq[e.sourceFile] = (sourceFreq[e.sourceFile] ?? 0) + 1;
    const topFilesByEdgeCount = Object.entries(sourceFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([file, count]) => ({ file, count }));
    writeFileSync(resolve(runsDir, 'relationship_map.json'), JSON.stringify({
      runId,
      totalEdges: result.totalEdges,
      edgeCounts: result.edgeCounts,
      topFilesByEdgeCount,
    }, null, 2), 'utf-8');

    // agents_scope_map.json — { filePath → agentsMdPath }
    const agentsScopeMap = Object.fromEntries(
      edges
        .filter(e => e.relationType === 'HAS_AGENTS_SCOPE')
        .map(e => [e.sourceFile, e.targetKey])
    );
    writeFileSync(resolve(runsDir, 'agents_scope_map.json'), JSON.stringify(agentsScopeMap, null, 2), 'utf-8');

    // schema_access_map.json — { table → [files] }
    const schemaAccessMap = {};
    for (const e of edges.filter(e => e.relationType === 'QUERIES_TABLE')) {
      (schemaAccessMap[e.targetKey] ??= []).push(e.sourceFile);
    }
    writeFileSync(resolve(runsDir, 'schema_access_map.json'), JSON.stringify(schemaAccessMap, null, 2), 'utf-8');

    // redis_key_map.json — { key_pattern → { reads: [files], writes: [files] } }
    const redisKeyMap = {};
    for (const e of edges.filter(e => e.relationType === 'READS_REDIS_KEY' || e.relationType === 'WRITES_REDIS_KEY')) {
      const bucket = (redisKeyMap[e.targetKey] ??= { reads: [], writes: [] });
      if (e.relationType === 'READS_REDIS_KEY') bucket.reads.push(e.sourceFile);
      else bucket.writes.push(e.sourceFile);
    }
    writeFileSync(resolve(runsDir, 'redis_key_map.json'), JSON.stringify(redisKeyMap, null, 2), 'utf-8');

    // qdrant_access_map.json — { collection → [files] }
    const qdrantAccessMap = {};
    for (const e of edges.filter(e => e.relationType === 'QUERIES_QDRANT_COLLECTION')) {
      (qdrantAccessMap[e.targetKey] ??= []).push(e.sourceFile);
    }
    writeFileSync(resolve(runsDir, 'qdrant_access_map.json'), JSON.stringify(qdrantAccessMap, null, 2), 'utf-8');

    log(`  Run dir  : ${runsDir} (5 maps written)`);
  } catch (err) {
    log(`  [warn] run artifacts skipped: ${err.message}`);
  }
}

main().catch(err => {
  console.error('[P5] Fatal:', err);
  process.exit(1);
});
