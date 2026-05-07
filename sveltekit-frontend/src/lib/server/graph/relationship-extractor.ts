/**
 * Relationship Extractor — P5 Codebase Relationship Mapper
 *
 * Extracts 7 semantic edge types not covered by the AST import scanner:
 *   EXPORTS_SYMBOL      File → Symbol (exported identifier)
 *   READS_REDIS_KEY     File → RedisKey (redis.get/hget/lrange literal keys)
 *   WRITES_REDIS_KEY    File → RedisKey (redis.set/setex/hset literal keys)
 *   QUERIES_TABLE       File → PostgresTable (known table name in SQL/query literal)
 *   QUERIES_QDRANT_COLLECTION  File → QdrantCollection (collection name literal)
 *   QUERIES_NEO4J_LABEL File → Neo4jLabel (Cypher node label pattern)
 *   HAS_AGENTS_SCOPE    File → AgentsMd (nearest AGENTS.md in walk-up)
 *
 * Results are written to code_relations (Postgres) and optionally Neo4j.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

// ── Known universe lists ───────────────────────────────────────────────────────

// All Postgres table names (snake_case, as they appear in SQL literals and schema)
export const KNOWN_TABLES: readonly string[] = [
  'users', 'sessions', 'email_verification_codes', 'password_reset_tokens',
  'cases', 'criminals', 'evidence', 'analysis_jobs', 'evidence_relationships',
  'documents', 'legal_documents', 'storage_files', 'vector_metadata', 'case_scores',
  'embedding_cache', 'user_ai_queries', 'auto_tags', 'vector_outbox', 'vector_jobs',
  'case_activities', 'attachment_verifications', 'canvas_states', 'canvas_annotations',
  'canvas_autosaves', 'ai_reports', 'codebase_audit_reports', 'agent_sessions',
  'citations', 'citation_tags', 'citation_collections', 'collection_citations',
  'reports', 'report_audit_log', 'report_versions', 'saved_reports', 'themes',
  'persons_of_interest', 'poi_photos', 'poi_relationships', 'timeline_events',
  'hash_verifications', 'content_embeddings', 'user_embeddings', 'chat_embeddings',
  'evidence_vectors', 'evidence_analysis_cache', 'case_embeddings', 'rag_sessions',
  'rag_messages', 'statutes', 'statute_chunks', 'legal_precedents', 'document_chunks',
  'research_summaries', 'legal_glossary', 'codebase_chunks', 'case_notes',
  'case_statute_links', 'legalDocuments', 'saved_searches', 'route_health',
  'api_audit_log', 'error_fingerprints', 'context_timeline', 'code_relations',
  'metadata_envelopes', 'codebase_audit_events', 'ace_retrieval_runs', 'ace_retrieval_hits',
  'agent_context_files', 'directory_context_bindings', 'ace_context_sources',
  'search_analytics', 'query_sketches', 'chunk_hit_log', 'search_query_log',
  'qlora_dataset', 'prompt_leaderboard',
];

// All Qdrant collection names (as they appear in string literals)
export const KNOWN_QDRANT_COLLECTIONS: readonly string[] = [
  'evidence_items', 'legal_documents', 'legal_cases', 'codebase_chunks_768',
  'codebase_chunks', 'chat_messages', 'embedding_cache', 'glyph_atlas',
  'legal_canon_chunks', 'fictional_case_chunks', 'legal_glossary',
];

// Neo4j node labels (used in Cypher MATCH patterns)
export const KNOWN_NEO4J_LABELS: readonly string[] = [
  'CodebaseFile', 'Component', 'Route', 'Store', 'ServerModule', 'File',
  'Case', 'Evidence', 'Citation', 'Statute', 'LegalDocument', 'POI',
  'WikiPage', 'Gap', 'Run', 'Cluster', 'GPUCluster', 'DirectorySummary',
  'AgentsMd', 'ResearchSummary', 'HyperedgeGroup',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type SemanticRelationType =
  | 'EXPORTS_SYMBOL'
  | 'READS_REDIS_KEY'
  | 'WRITES_REDIS_KEY'
  | 'QUERIES_TABLE'
  | 'QUERIES_QDRANT_COLLECTION'
  | 'QUERIES_NEO4J_LABEL'
  | 'HAS_AGENTS_SCOPE';

export interface SemanticEdge {
  sourceFile: string;    // relative path from srcRoot, e.g. src/lib/server/ace/context-assembler.ts
  targetKey: string;     // the target identifier (symbol name, table name, collection, etc.)
  relationType: SemanticRelationType;
  confidence: number;    // 0–1
  evidence: {
    line?: number;
    snippet?: string;
    matchKind: 'literal' | 'regex' | 'ast' | 'walkup';
  };
}

export interface ExtractionResult {
  sourceFile: string;
  edges: SemanticEdge[];
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortSnippet(line: string): string {
  return line.trim().slice(0, 120);
}

// camelCase → snake_case so Drizzle variable names resolve to table names
// e.g. contextTimeline → context_timeline
function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Walk up directory tree looking for AGENTS.md
function findNearestAgentsMd(filePath: string, srcRoot: string): string | null {
  let dir = dirname(filePath);
  const root = resolve(srcRoot);
  while (dir.startsWith(root)) {
    const candidate = resolve(dir, 'AGENTS.md');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── Core extractor ────────────────────────────────────────────────────────────

export function extractSemanticRelations(
  absPath: string,
  srcRoot: string,
  content?: string
): SemanticEdge[] {
  const edges: SemanticEdge[] = [];
  const src = content ?? readFileSync(absPath, 'utf8');
  const relPath = relative(srcRoot, absPath).replace(/\\/g, '/');
  const lines = src.split('\n');

  // ── 1. EXPORTS_SYMBOL ──────────────────────────────────────────────────────
  // Match: export function Foo, export const Foo, export class Foo, export type Foo
  // Also: export { Foo, Bar }, export { Foo as Bar }
  const namedExportRe = /\bexport\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  const reExportRe = /\bexport\s+\{([^}]+)\}/g;
  const defaultExportRe = /\bexport\s+default\s+(?:function|class)?\s*(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    namedExportRe.lastIndex = 0;
    while ((m = namedExportRe.exec(line)) !== null) {
      edges.push({
        sourceFile: relPath,
        targetKey: m[1],
        relationType: 'EXPORTS_SYMBOL',
        confidence: 0.95,
        evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
      });
    }

    reExportRe.lastIndex = 0;
    while ((m = reExportRe.exec(line)) !== null) {
      const symbols = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const sym of symbols) {
        if (/^\w+$/.test(sym)) {
          edges.push({
            sourceFile: relPath,
            targetKey: sym,
            relationType: 'EXPORTS_SYMBOL',
            confidence: 0.85,
            evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
          });
        }
      }
    }

    const dm = defaultExportRe.exec(line);
    if (dm?.[1]) {
      edges.push({
        sourceFile: relPath,
        targetKey: dm[1],
        relationType: 'EXPORTS_SYMBOL',
        confidence: 0.90,
        evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
      });
    }
  }

  // ── 2 & 3. READS_REDIS_KEY / WRITES_REDIS_KEY ─────────────────────────────
  // Match redis.get('key'), redis.setex('key', ...), await redis.hget('key', ...)
  // We only capture string literal keys (single or double quote, or template prefix).
  const redisReadRe = /\bredis\s*\.\s*(?:get|hget|hgetall|lrange|zrange|smembers|exists|ttl)\s*\(\s*(['"`])([^'"` ,)\n]{1,200})\1/g;
  const redisWriteRe = /\bredis\s*\.\s*(?:set|setex|hset|lpush|rpush|sadd|zadd|expire|del|incr|decr|publish)\s*\(\s*(['"`])([^'"` ,)\n]{1,200})\1/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    redisReadRe.lastIndex = 0;
    while ((m = redisReadRe.exec(line)) !== null) {
      const key = m[2];
      if (key.length > 2) {
        edges.push({
          sourceFile: relPath,
          targetKey: key,
          relationType: 'READS_REDIS_KEY',
          confidence: key.includes('${') ? 0.65 : 0.90,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'literal' },
        });
      }
    }

    redisWriteRe.lastIndex = 0;
    while ((m = redisWriteRe.exec(line)) !== null) {
      const key = m[2];
      if (key.length > 2) {
        edges.push({
          sourceFile: relPath,
          targetKey: key,
          relationType: 'WRITES_REDIS_KEY',
          confidence: key.includes('${') ? 0.65 : 0.90,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'literal' },
        });
      }
    }
  }

  // ── 4. QUERIES_TABLE ──────────────────────────────────────────────────────
  // Build a single regex from the known table list, matching SQL keywords or
  // Drizzle .from(table) / .insert(table) / .update(table) patterns.
  const tablePattern = KNOWN_TABLES.map(t => t.replace(/_/g, '[_]')).join('|');
  const sqlTableRe = new RegExp(
    `(?:FROM|INTO|UPDATE|TABLE|from|into|update|table)\\s+['"\`]?(${tablePattern})['"\`]?`,
    'g'
  );
  const drizzleTableRe = new RegExp(
    `\\.(?:from|insert|update|delete)\\(\\s*(${tablePattern})(?:\\s*[,)]|\\b)`,
    'g'
  );
  // Also match camelCase Drizzle variable names: .from(contextTimeline) → context_timeline
  const drizzleCamelRe = /\.(?:from|insert|update|delete)\(\s*([a-z][a-zA-Z0-9]{2,})(?:\s*[,)]|\b)/g;
  const knownTableSet = new Set(KNOWN_TABLES);
  const sqlStringRe = new RegExp(
    `['"\`](${tablePattern})['"\`]`,
    'g'
  );

  const tableHits = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    sqlTableRe.lastIndex = 0;
    while ((m = sqlTableRe.exec(line)) !== null) {
      const table = m[1];
      if (!tableHits.has(table)) {
        tableHits.add(table);
        edges.push({
          sourceFile: relPath,
          targetKey: table,
          relationType: 'QUERIES_TABLE',
          confidence: 0.88,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'literal' },
        });
      }
    }

    drizzleTableRe.lastIndex = 0;
    while ((m = drizzleTableRe.exec(line)) !== null) {
      const table = m[1];
      if (!tableHits.has(table)) {
        tableHits.add(table);
        edges.push({
          sourceFile: relPath,
          targetKey: table,
          relationType: 'QUERIES_TABLE',
          confidence: 0.92,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'literal' },
        });
      }
    }

    // camelCase Drizzle variable names: .from(contextTimeline) → context_timeline
    drizzleCamelRe.lastIndex = 0;
    while ((m = drizzleCamelRe.exec(line)) !== null) {
      const snake = camelToSnake(m[1]);
      if (knownTableSet.has(snake) && !tableHits.has(snake)) {
        tableHits.add(snake);
        edges.push({
          sourceFile: relPath,
          targetKey: snake,
          relationType: 'QUERIES_TABLE',
          confidence: 0.80,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
        });
      }
    }

    sqlStringRe.lastIndex = 0;
    while ((m = sqlStringRe.exec(line)) !== null) {
      const table = m[1];
      if (!tableHits.has(table)) {
        tableHits.add(table);
        edges.push({
          sourceFile: relPath,
          targetKey: table,
          relationType: 'QUERIES_TABLE',
          confidence: 0.70,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
        });
      }
    }
  }

  // ── 5. QUERIES_QDRANT_COLLECTION ──────────────────────────────────────────
  const collectionPattern = KNOWN_QDRANT_COLLECTIONS.join('|');
  const qdrantRe = new RegExp(`['"\`](${collectionPattern})['"\`]`, 'g');

  const qdrantHits = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    qdrantRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = qdrantRe.exec(line)) !== null) {
      const coll = m[1];
      if (!qdrantHits.has(coll)) {
        qdrantHits.add(coll);
        edges.push({
          sourceFile: relPath,
          targetKey: coll,
          relationType: 'QUERIES_QDRANT_COLLECTION',
          confidence: 0.93,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'literal' },
        });
      }
    }
  }

  // ── 6. QUERIES_NEO4J_LABEL ────────────────────────────────────────────────
  // Match Cypher: (n:Label), [:RELATIONSHIP], MATCH (:Label), etc.
  const labelPattern = KNOWN_NEO4J_LABELS.join('|');
  const cypherNodeRe = new RegExp(`\\(\\w*:(${labelPattern})\\b`, 'g');
  const cypherMergRe = new RegExp(`(?:MERGE|MATCH)\\s+\\((${labelPattern})\\b`, 'g');

  const neo4jHits = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    cypherNodeRe.lastIndex = 0;
    while ((m = cypherNodeRe.exec(line)) !== null) {
      const label = m[1];
      if (!neo4jHits.has(label)) {
        neo4jHits.add(label);
        edges.push({
          sourceFile: relPath,
          targetKey: label,
          relationType: 'QUERIES_NEO4J_LABEL',
          confidence: 0.91,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
        });
      }
    }

    cypherMergRe.lastIndex = 0;
    while ((m = cypherMergRe.exec(line)) !== null) {
      const label = m[1];
      if (!neo4jHits.has(label)) {
        neo4jHits.add(label);
        edges.push({
          sourceFile: relPath,
          targetKey: label,
          relationType: 'QUERIES_NEO4J_LABEL',
          confidence: 0.80,
          evidence: { line: i + 1, snippet: shortSnippet(line), matchKind: 'regex' },
        });
      }
    }
  }

  // ── 7. HAS_AGENTS_SCOPE ───────────────────────────────────────────────────
  const agentsMd = findNearestAgentsMd(absPath, srcRoot);
  if (agentsMd) {
    const agentsRelPath = relative(srcRoot, agentsMd).replace(/\\/g, '/');
    edges.push({
      sourceFile: relPath,
      targetKey: agentsRelPath,
      relationType: 'HAS_AGENTS_SCOPE',
      confidence: 0.85,
      evidence: { matchKind: 'walkup' },
    });
  }

  return edges;
}

// ── Directory scanner ─────────────────────────────────────────────────────────

const SCANNABLE_EXTS = new Set(['.ts', '.svelte', '.js', '.mjs', '.mts']);
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', 'build', '.git', 'static']);

export function collectScanTargets(srcRoot: string, maxFiles = 3000): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (SKIP_DIRS.has(entry)) continue;
      const full = resolve(dir, entry);
      let st: ReturnType<typeof statSync>;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        walk(full);
      } else if (SCANNABLE_EXTS.has('.' + entry.split('.').pop()!)) {
        results.push(full);
      }
    }
  }

  walk(srcRoot);
  return results;
}

// ── Batch extraction ──────────────────────────────────────────────────────────

export interface BatchExtractionResult {
  totalFiles: number;
  totalEdges: number;
  edgeCounts: Record<SemanticRelationType, number>;
  edges: SemanticEdge[];
  durationMs: number;
  errors: string[];
}

export function extractAllSemanticRelations(
  srcRoot: string,
  maxFiles = 3000
): BatchExtractionResult {
  const t0 = Date.now();
  const targets = collectScanTargets(srcRoot, maxFiles);
  const allEdges: SemanticEdge[] = [];
  const errors: string[] = [];

  for (const absPath of targets) {
    try {
      const edges = extractSemanticRelations(absPath, srcRoot);
      allEdges.push(...edges);
    } catch (err) {
      errors.push(`${absPath}: ${String(err)}`);
    }
  }

  const edgeCounts = {
    EXPORTS_SYMBOL: 0,
    READS_REDIS_KEY: 0,
    WRITES_REDIS_KEY: 0,
    QUERIES_TABLE: 0,
    QUERIES_QDRANT_COLLECTION: 0,
    QUERIES_NEO4J_LABEL: 0,
    HAS_AGENTS_SCOPE: 0,
  } as Record<SemanticRelationType, number>;

  for (const e of allEdges) {
    edgeCounts[e.relationType] = (edgeCounts[e.relationType] ?? 0) + 1;
  }

  return {
    totalFiles: targets.length,
    totalEdges: allEdges.length,
    edgeCounts,
    edges: allEdges,
    durationMs: Date.now() - t0,
    errors,
  };
}
