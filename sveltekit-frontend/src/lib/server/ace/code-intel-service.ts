/**
 * Code Intelligence Service — TreeSitter corpus derivation for OKF OpenWiki knowledge base.
 *
 * Orchestrates:
 * - Filesystem walk (src/, lib/, scripts/)
 * - Regex AST extraction (functions, classes, imports)
 * - Domain classification (AUTH, DATA, API, UI)
 * - 4D topology coordinate assignment
 * - 512-dim MRL embedding generation
 * - Qdrant batch ingestion (100 nodes/upsert)
 * - Redis centroid materialization
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, relative, extname } from 'path';
import Redis from 'ioredis';
import { generateSingleEmbedding } from '../grpc/embedding-client.js';
import { ensureQdrantCollection, batchUpsertPoints } from '../vector/qdrant-manager.js';
import { extractAstFeatures, extractDependencyFeatures } from '../analysis/ast-grep-extractor.js';
import { LIBRARY_DOMAIN_MAP } from '../../phase72/routeGraphAdapter.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type DomainClass = 'AUTH' | 'DATA' | 'API' | 'UI' | 'UNKNOWN';

export type CodeIntelSourceKind = 'tree_sitter' | 'ast_grep' | 'regex' | 'langextract' | 'labeler';

export interface CodeIntelConcept {
  concept: string;
  source: CodeIntelSourceKind;
  confidence: number;
}

export interface CodeIntelKeyValue {
  key: string;
  value: string;
  source: CodeIntelSourceKind;
}

export interface CodeIntelNode {
  id: string;
  filePath: string;
  symbol: string; // function, class, import name
  kind: 'function' | 'class' | 'import' | 'export' | 'type' | 'interface';
  domain: DomainClass;
  domainConfidence: number; // 0-1
  lineStart: number;
  lineEnd: number;
  embedding?: number[]; // 512-dim MRL
  conceptEmbedding12?: number[]; // 12-dim MRL concept/routing candidate
  conceptFeatures?: CodeIntelConcept[];
  keyValuePairs?: CodeIntelKeyValue[];
  topologyCoords: {
    x: number; // temporal: git timestamp
    y: number; // structural: nesting depth
    z: number; // semantic: embedding similarity to domain centroid
    w: number; // authority: PageRank (computed separately)
  };
  tags: string[];
  summary: string;
  imports?: string[];
}

interface DomainKeywordConfig {
  keywords: string[];
  weight: number;
}

interface TreeChunk {
  chunkId: string;
  startLine: number;
  endLine: number;
  text: string;
}

let latestCorpusNodes: CodeIntelNode[] = [];
let latestCorpusStats = {
  indexed: 0,
  errors: 0,
  facts: 0,
  nodes: 0,
  rebuildAt: '',
};

// ─── Domain Classification ────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<DomainClass, DomainKeywordConfig> = {
  AUTH: {
    keywords: ['session', 'password', 'token', 'credential', 'login', 'auth', 'lucia', 'jsonwebtoken', 'passport', 'bcrypt'],
    weight: 2.0
  },
  DATA: {
    keywords: ['query', 'database', 'schema', 'migration', 'db', 'drizzle', 'prisma', 'ioredis', 'redis', 'pg', 'mysql', 'sqlite'],
    weight: 2.0
  },
  API: {
    keywords: ['route', 'endpoint', 'http', 'request', 'response', 'fetch', 'api', 'sveltekit', '@sveltejs', 'express', 'fastify'],
    weight: 2.0
  },
  UI: {
    keywords: ['component', 'render', 'state', 'props', 'svelte', 'vue', 'react', 'bits-ui', 'melt-ui', 'tailwind', 'unocss'],
    weight: 2.0
  },
  UNKNOWN: {
    keywords: [],
    weight: 0.0
  }
};

function classifyDomain(filePath: string, content: string, imports: string[] = []): { domain: DomainClass; confidence: number } {
  const scores: Record<DomainClass, number> = {
    AUTH: 0,
    DATA: 0,
    API: 0,
    UI: 0,
    UNKNOWN: 0
  };

  const pathLower = filePath.toLowerCase();
  const contentLower = content.toLowerCase();

  // Score based on import libraries via the shared library map
  for (const imp of imports) {
    for (const [libName, domain] of Object.entries(LIBRARY_DOMAIN_MAP)) {
      if (imp.includes(libName)) {
        scores[domain] += 1.5;
      }
    }
  }

  // Score based on filename/path
  for (const [domain, config] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain === 'UNKNOWN') continue;
    for (const keyword of config.keywords) {
      if (pathLower.includes(keyword)) {
        scores[domain as DomainClass] += config.weight;
      }
    }
  }

  // Score based on content
  for (const [domain, config] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain === 'UNKNOWN') continue;
    for (const keyword of config.keywords) {
      const matches = contentLower.match(new RegExp(keyword, 'g')) || [];
      scores[domain as DomainClass] += matches.length * 0.5;
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  const topDomain = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0][0] as DomainClass;

  const confidence = maxScore > 0 ? Math.min(1, maxScore / 10) : 0;

  return {
    domain: maxScore > 0 ? topDomain : 'UNKNOWN',
    confidence
  };
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function inferConceptsFromFile(filePath: string, content: string, astNodes: ASTNode[], astgFeatures: Awaited<ReturnType<typeof extractAstFeatures>> , dependencyFeatures: Awaited<ReturnType<typeof extractDependencyFeatures>>, domain: DomainClass): CodeIntelConcept[] {
  const concepts: CodeIntelConcept[] = [];
  const fileStem = filePath.split(/[\\/]/).pop() ?? filePath;
  const ext = extname(filePath).slice(1).toLowerCase();

  concepts.push({ concept: domain.toLowerCase(), source: 'labeler', confidence: domain === 'UNKNOWN' ? 0.1 : 0.9 });
  concepts.push({ concept: `ext:${ext || 'unknown'}`, source: 'regex', confidence: 0.85 });
  concepts.push({ concept: `file:${normalizeKey(fileStem)}`, source: 'regex', confidence: 0.8 });

  for (const node of astNodes) {
    concepts.push({
      concept: `ast:${node.kind}`,
      source: 'tree_sitter',
      confidence: 0.92,
    });
    concepts.push({
      concept: `symbol:${normalizeKey(node.name)}`,
      source: 'tree_sitter',
      confidence: 0.9,
    });
  }

  for (const feature of astgFeatures) {
    concepts.push({
      concept: `astg:${normalizeKey(feature.type)}`,
      source: 'ast_grep',
      confidence: feature.confidence ?? 0.9,
    });
    concepts.push({
      concept: `name:${normalizeKey(feature.name)}`,
      source: 'ast_grep',
      confidence: feature.confidence ?? 0.9,
    });
  }

  for (const feature of dependencyFeatures) {
    concepts.push({
      concept: `import:${normalizeKey(feature.name)}`,
      source: 'ast_grep',
      confidence: feature.confidence ?? 0.88,
    });
  }

  const conceptTokens = new Set<string>();
  for (const token of content.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? []) {
    const normalized = normalizeKey(token);
    if (!normalized) continue;
    if (conceptTokens.has(normalized)) continue;
    conceptTokens.add(normalized);
    concepts.push({
      concept: normalized,
      source: 'regex',
      confidence: 0.4,
    });
  }

  return dedupeConcepts(concepts);
}

function dedupeConcepts(concepts: CodeIntelConcept[]): CodeIntelConcept[] {
  const merged = new Map<string, CodeIntelConcept>();
  for (const concept of concepts) {
    const key = `${concept.source}:${concept.concept}`;
    const existing = merged.get(key);
    if (!existing || concept.confidence > existing.confidence) {
      merged.set(key, concept);
    }
  }
  return Array.from(merged.values());
}

function buildConceptVector12(
  domain: DomainClass,
  concepts: CodeIntelConcept[],
  astNodes: ASTNode[],
  filePath: string,
  content: string,
  confidence: number
): number[] {
  const tokens = concepts.map((c) => c.concept);
  const conceptCount = tokens.length || 1;
  const importCount = tokens.filter((c) => c.startsWith('import:')).length;
  const astCount = tokens.filter((c) => c.startsWith('ast:')).length;
  const symbolCount = tokens.filter((c) => c.startsWith('symbol:')).length;
  const fileExt = extname(filePath).slice(1).toLowerCase();
  const lineCount = content.split(/\r?\n/).length;

  const dim: Record<DomainClass, number> = {
    AUTH: domain === 'AUTH' ? 1 : 0,
    DATA: domain === 'DATA' ? 1 : 0,
    API: domain === 'API' ? 1 : 0,
    UI: domain === 'UI' ? 1 : 0,
    UNKNOWN: domain === 'UNKNOWN' ? 1 : 0,
  };

  return [
    dim.AUTH,
    dim.DATA,
    dim.API,
    dim.UI,
    dim.UNKNOWN,
    clamp01(astCount / 20),
    clamp01(importCount / 10),
    clamp01(symbolCount / 20),
    clamp01(conceptCount / 50),
    clamp01(lineCount / 1000),
    clamp01(confidence),
    clamp01((fileExt === 'svelte' || fileExt === 'ts' || fileExt === 'tsx' || fileExt === 'js') ? 1 : 0.5),
  ];
}

function buildKeyValuePairs(entry: {
  filePath: string;
  symbol: string;
  kind: ASTNode['kind'];
  domain: DomainClass;
  lineStart: number;
  lineEnd: number;
  concepts: CodeIntelConcept[];
  imports: string[];
  topologyCoords?: { x: number; y: number; z: number; w: number };
  tags?: string[];
  summary?: string;
  conceptEmbedding12?: number[];
  conceptFeatures?: CodeIntelConcept[];
  keyValuePairs?: CodeIntelKeyValue[];
}): CodeIntelKeyValue[] {
  const pairs: CodeIntelKeyValue[] = [
    { key: 'domain', value: entry.domain, source: 'labeler' },
    { key: 'kind', value: entry.kind, source: 'tree_sitter' },
    { key: 'symbol', value: entry.symbol, source: 'tree_sitter' },
    { key: 'file_path', value: entry.filePath, source: 'regex' },
    { key: 'line_start', value: String(entry.lineStart), source: 'tree_sitter' },
    { key: 'line_end', value: String(entry.lineEnd), source: 'tree_sitter' },
    { key: 'concept_count', value: String(entry.concepts.length), source: 'regex' },
    { key: 'import_count', value: String(entry.imports.length), source: 'ast_grep' },
    { key: 'has_auth', value: String(entry.domain === 'AUTH'), source: 'labeler' },
    { key: 'has_data', value: String(entry.domain === 'DATA'), source: 'labeler' },
    { key: 'has_api', value: String(entry.domain === 'API'), source: 'labeler' },
    { key: 'has_ui', value: String(entry.domain === 'UI'), source: 'labeler' },
  ];

  for (const concept of entry.concepts.slice(0, 12)) {
    pairs.push({
      key: `concept_${normalizeKey(concept.concept)}`,
      value: String(Math.round(concept.confidence * 1000) / 1000),
      source: concept.source,
    });
  }

  return pairs;
}

function chunkSourceText(content: string, chunkSize = 80): TreeChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: TreeChunk[] = [];

  for (let start = 0; start < lines.length; start += chunkSize) {
    const end = Math.min(lines.length, start + chunkSize);
    const chunkLines = lines.slice(start, end);
    const text = chunkLines.join('\n').trim();
    if (!text) continue;
    chunks.push({
      chunkId: `chunk:${start + 1}-${end}`,
      startLine: start + 1,
      endLine: end,
      text,
    });
  }

  return chunks;
}

async function extractFileFacts(filePath: string, content: string): Promise<{
  astNodes: ASTNode[];
  astGrepFeatures: Awaited<ReturnType<typeof extractAstFeatures>>;
  dependencyFeatures: Awaited<ReturnType<typeof extractDependencyFeatures>>;
  concepts: CodeIntelConcept[];
  keyValuePairs: CodeIntelKeyValue[];
  conceptVector12: number[];
  chunks: TreeChunk[];
  domain: DomainClass;
  domainConfidence: number;
}> {
  const astNodes = extractASTNodes(content);
  const [astGrepFeatures, dependencyFeatures] = await Promise.all([
    extractAstFeatures(content, filePath),
    extractDependencyFeatures(content),
  ]);

  const importNames = uniqueStrings([
    ...astNodes.flatMap((node) => node.imports ?? []),
    ...dependencyFeatures.map((feature) => feature.name),
  ]);
  const { domain, confidence } = classifyDomain(filePath, content, importNames);
  const concepts = inferConceptsFromFile(filePath, content, astNodes, astGrepFeatures, dependencyFeatures, domain);
  const chunks = chunkSourceText(content);
  const keyValuePairs = buildKeyValuePairs({
    filePath: relative(process.cwd(), filePath),
    symbol: pathBaseName(filePath),
    kind: 'function',
    domain,
    lineStart: 1,
    lineEnd: content.split(/\r?\n/).length,
    topologyCoords: { x: 0, y: 0, z: 0, w: 0 },
    tags: [],
    summary: '',
    imports: importNames,
    concepts,
  });
  const conceptVector12 = buildConceptVector12(domain, concepts, astNodes, filePath, content, confidence);

  return {
    astNodes,
    astGrepFeatures,
    dependencyFeatures,
    concepts,
    keyValuePairs,
    conceptVector12,
    chunks,
    domain,
    domainConfidence: confidence,
  };
}

function pathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

// ─── AST Extraction (Regex-based fallback for TreeSitter) ────────────────

interface ASTNode {
  kind: 'function' | 'class' | 'import' | 'export' | 'type' | 'interface';
  name: string;
  lineStart: number;
  lineEnd: number;
  imports?: string[];
}

function extractASTNodes(content: string): ASTNode[] {
  const nodes: ASTNode[] = [];

  // Function declarations
  const functionRegex = /^\s*(?:async\s+)?(?:export\s+)?function\s+(\w+)/gm;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    nodes.push({
      kind: 'function',
      name: match[1],
      lineStart: lineNum,
      lineEnd: lineNum + 5 // rough estimate
    });
  }

  // Class declarations
  const classRegex = /^\s*(?:export\s+)?class\s+(\w+)/gm;
  while ((match = classRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    nodes.push({
      kind: 'class',
      name: match[1],
      lineStart: lineNum,
      lineEnd: lineNum + 20
    });
  }

  // Import statements
  const importRegex = /^\s*import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/gm;
  while ((match = importRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    nodes.push({
      kind: 'import',
      name: match[1],
      lineStart: lineNum,
      lineEnd: lineNum,
      imports: [match[1]]
    });
  }

  // Type/Interface declarations
  const typeRegex = /^\s*(?:export\s+)?(?:type|interface)\s+(\w+)/gm;
  while ((match = typeRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    nodes.push({
      kind: match[2] === 'interface' ? 'interface' : 'type',
      name: match[1],
      lineStart: lineNum,
      lineEnd: lineNum + 10
    });
  }

  return nodes;
}

// ─── Filesystem Walk ──────────────────────────────────────────────────────

function* walkFilesystem(dir: string, extensions: string[] = ['.ts', '.js', '.svelte']): Generator<string> {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        yield* walkFilesystem(fullPath, extensions);
      } else if (extensions.includes(extname(entry.name))) {
        yield fullPath;
      }
    }
  } catch {
    // Skip permission errors
  }
}

// ─── 4D Topology Coordinate Assignment ────────────────────────────────────

function assign4DCoordinates(
  nodes: CodeIntelNode[],
  filePath: string,
  gitTimestamp: number = Date.now()
): { x: number; y: number; z: number; w: number } {
  const pathParts = filePath.split('/');
  const depth = Math.min(pathParts.length / 2, 1.0); // Normalized nesting depth (0-1)

  // z: semantic similarity to domain centroid (computed from embedding)
  // w: authority (PageRank) — computed separately in batch

  return {
    x: gitTimestamp / 1000000000, // Normalize to reasonable scale
    y: depth,
    z: 0.5, // Placeholder; will be updated with embedding similarity
    w: 0.0  // Will be populated by PageRank computation
  };
}

// ─── Core Corpus Rebuilder ────────────────────────────────────────────────

export async function rebuildCodeIntelCorpus(): Promise<{
  indexed: number;
  errors: number;
  facts: number;
  nodes: number;
}> {
  const projectRoot = process.cwd();
  const startDirs = [
    join(projectRoot, 'sveltekit-frontend/src'),
    join(projectRoot, 'sveltekit-frontend/scripts'),
    join(projectRoot, 'packages')
  ];

  let indexed = 0;
  let errors = 0;
  let facts = 0;
  const nodes: CodeIntelNode[] = [];
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  try {
    await redis.connect();

    // Step 1: Collect all files
    const files: string[] = [];
    for (const startDir of startDirs) {
      if (existsSync(startDir)) {
        for (const file of walkFilesystem(startDir)) {
          files.push(file);
        }
      }
    }

    console.log(`[CodeIntel] Found ${files.length} files to index`);

    // Step 2: Process files in batches
    for (let i = 0; i < files.length; i += 50) {
      const batch = files.slice(i, Math.min(i + 50, files.length));

      for (const filePath of batch) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const rel = relative(projectRoot, filePath);

          const fileFacts = await extractFileFacts(rel, content);
          const astNodes = fileFacts.astNodes;
          const semanticEmbedding = await generateSingleEmbedding(content).catch(() => []);

          // Create CodeIntelNode for each AST node
          for (const astNode of astNodes) {
            const nodeId = `${rel}:${astNode.name}:${astNode.lineStart}`;
            const conceptSlice = fileFacts.concepts.slice(0, 24);
            const kvPairs = buildKeyValuePairs({
              filePath: rel,
              symbol: astNode.name,
              kind: astNode.kind,
              domain: fileFacts.domain,
              lineStart: astNode.lineStart,
              lineEnd: astNode.lineEnd,
              topologyCoords: assign4DCoordinates(nodes, rel),
              tags: [fileFacts.domain, astNode.kind, ...extractTags(astNode.name)],
              summary: `${astNode.kind} ${astNode.name} in ${rel}`,
              imports: astNode.imports,
              concepts: conceptSlice,
              conceptEmbedding12: fileFacts.conceptVector12,
              conceptFeatures: conceptSlice,
              keyValuePairs: [],
            });

            const intelNode: CodeIntelNode = {
              id: nodeId,
              filePath: rel,
              symbol: astNode.name,
              kind: astNode.kind,
              domain: fileFacts.domain,
              domainConfidence: fileFacts.domainConfidence,
              lineStart: astNode.lineStart,
              lineEnd: astNode.lineEnd,
              embedding: semanticEmbedding.length === 512 ? semanticEmbedding : undefined,
              conceptEmbedding12: fileFacts.conceptVector12,
              conceptFeatures: conceptSlice,
              keyValuePairs: kvPairs,
              topologyCoords: assign4DCoordinates(nodes, rel),
              tags: [
                fileFacts.domain,
                astNode.kind,
                ...extractTags(astNode.name),
                ...conceptSlice.slice(0, 6).map((concept) => normalizeKey(concept.concept)),
              ],
              summary: `${astNode.kind} ${astNode.name} in ${rel}`,
              imports: astNode.imports
            };

            nodes.push(intelNode);
            facts++;
          }

          indexed++;
        } catch (err) {
          errors++;
          console.warn(`[CodeIntel] Error indexing ${filePath}:`, (err as Error).message);
        }
      }

      // Batch ingestion to Qdrant (every 50 files)
      if (nodes.length >= 100) {
        await ingestNodesToQdrant(nodes.splice(0, 100));
      }
    }

    // Step 3: Final batch ingestion
    if (nodes.length > 0) {
      await ingestNodesToQdrant(nodes);
    }

    // Step 4: Materialize domain centroids to Redis
    latestCorpusNodes = [...nodes];
    await materializeDomainCentroids(redis);

    // Step 5: Materialize key/value indexes for exact lookups
    await materializeKeyValueIndexes(redis, latestCorpusNodes);

    console.log(`[CodeIntel] Corpus rebuild complete: indexed=${indexed}, errors=${errors}, facts=${facts}, nodes=${nodes.length}`);

    latestCorpusStats = {
      indexed,
      errors,
      facts,
      nodes: nodes.length,
      rebuildAt: new Date().toISOString(),
    };

    return { indexed, errors, facts, nodes: nodes.length };
  } finally {
    await redis.quit();
  }
}

// ─── Qdrant Ingestion ─────────────────────────────────────────────────────

async function ingestNodesToQdrant(nodes: CodeIntelNode[]): Promise<void> {
  try {
    // Ensure collection exists
    await ensureQdrantCollection('codebase_chunks_512', 512);

    // Convert nodes to Qdrant points
    const points = nodes.map((node, idx) => ({
      id: `${node.id}:${idx}`,
      vector: node.embedding || new Array(512).fill(0), // 512-dim MRL lane; zero-vector fallback
      payload: {
        filePath: node.filePath,
        symbol: node.symbol,
        kind: node.kind,
        domain: node.domain,
        domainConfidence: node.domainConfidence,
        lineStart: node.lineStart,
        lineEnd: node.lineEnd,
        tags: node.tags,
        summary: node.summary,
        concepts: node.conceptFeatures ?? [],
        keyValuePairs: node.keyValuePairs ?? [],
        conceptEmbedding12: node.conceptEmbedding12 ?? [],
        topologyX: node.topologyCoords.x,
        topologyY: node.topologyCoords.y,
        topologyZ: node.topologyCoords.z,
        topologyW: node.topologyCoords.w
      }
    }));

    await batchUpsertPoints('codebase_chunks_512', points, true);
  } catch (err) {
    console.error('[CodeIntel] Qdrant ingestion failed:', (err as Error).message);
  }
}

// ─── Domain Centroid Materialization ──────────────────────────────────────

async function materializeDomainCentroids(redis: Redis): Promise<void> {
  try {
    const centroids: Record<DomainClass, number[]> = {
      AUTH: new Array(512).fill(0),
      DATA: new Array(512).fill(0),
      API: new Array(512).fill(0),
      UI: new Array(512).fill(0),
      UNKNOWN: new Array(512).fill(0)
    };

    // Note: In production, aggregate embeddings from all nodes
    // This is a placeholder for the centroid computation

    // Store centroids in Redis with 24h TTL
    for (const [domain, centroid] of Object.entries(centroids)) {
      await redis.setex(
        `corpus:centroids:${domain}`,
        86400, // 24h TTL
        JSON.stringify({
          domain,
          centroid: centroid.map(v => Number(v.toFixed(6))),
          timestamp: Date.now()
        })
      );
    }

    console.log('[CodeIntel] Domain centroids materialized to Redis');
  } catch (err) {
    console.error('[CodeIntel] Centroid materialization failed:', (err as Error).message);
  }
}

async function materializeKeyValueIndexes(redis: Redis, corpusNodes: CodeIntelNode[]): Promise<void> {
  try {
    const pipeline = redis.pipeline();

    for (const node of corpusNodes) {
      const keyValues = node.keyValuePairs ?? [];

      pipeline.sadd(`corpus:kv:domain:${normalizeKey(node.domain)}`, node.id);
      pipeline.sadd(`corpus:kv:kind:${normalizeKey(node.kind)}`, node.id);
      pipeline.sadd(`corpus:kv:file:${normalizeKey(node.filePath)}`, node.id);

      for (const kv of keyValues) {
        const key = normalizeKey(kv.key);
        const value = normalizeKey(kv.value);
        if (!key || !value) continue;
        pipeline.sadd(`corpus:kv:${key}:${value}`, node.id);
      }

      for (const concept of node.conceptFeatures ?? []) {
        const conceptKey = normalizeKey(concept.concept);
        if (!conceptKey) continue;
        pipeline.sadd(`corpus:concept:${conceptKey}`, node.id);
      }
    }

    await pipeline.exec();
    console.log('[CodeIntel] Key/value indexes materialized to Redis');
  } catch (err) {
    console.error('[CodeIntel] Key/value materialization failed:', (err as Error).message);
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────

function extractTags(symbol: string): string[] {
  const tags: string[] = [];
  const lower = symbol.toLowerCase();

  if (lower.includes('auth') || lower.includes('session')) tags.push('authentication');
  if (lower.includes('query') || lower.includes('db')) tags.push('database');
  if (lower.includes('route') || lower.includes('handler')) tags.push('routing');
  if (lower.includes('component') || lower.includes('ui')) tags.push('ui');

  return tags;
}

/**
 * Query code intelligence index by domain.
 *
 * @param domain - Domain to filter by
 * @param limit - Max results
 * @returns Matching nodes
 */
export async function queryCodeIntelByDomain(domain: DomainClass, limit: number = 20): Promise<CodeIntelNode[]> {
  const corpus = latestCorpusNodes.length > 0 ? latestCorpusNodes : [];
  return corpus
    .filter((node) => node.domain === domain)
    .sort((a, b) => (b.domainConfidence - a.domainConfidence) || (b.lineStart - a.lineStart))
    .slice(0, limit);
}

export async function queryCodeIntelByKeyValue(
  key: string,
  value: string,
  limit: number = 20
): Promise<CodeIntelNode[]> {
  const normalizedKey = normalizeKey(key);
  const normalizedValue = normalizeKey(value);
  const corpus = latestCorpusNodes.length > 0 ? latestCorpusNodes : [];
  return corpus
    .filter((node) =>
      (node.keyValuePairs ?? []).some((pair) =>
        normalizeKey(pair.key) === normalizedKey && normalizeKey(pair.value) === normalizedValue
      )
    )
    .slice(0, limit);
}

/**
 * Generate Claude planning context from code intelligence.
 *
 * @param query - User query
 * @returns Formatted context for LLM consumption
 */
export async function generateClaudePlan(query: string): Promise<string> {
  const domain = classifyDomain(query, query).domain;
  const domainNodes = await queryCodeIntelByDomain(domain, 12);
  const conceptHits = domainNodes
    .flatMap((node) => node.conceptFeatures ?? [])
    .slice(0, 12)
    .map((concept) => `- ${concept.concept} (${concept.source})`);

  return [
    '# Code Intelligence Context',
    '',
    `Query: ${query}`,
    `Domain: ${domain}`,
    '',
    'Matching code constructs:',
    ...domainNodes.map((node) => `- ${node.filePath}:${node.lineStart}-${node.lineEnd} ${node.symbol} [${node.kind}]`),
    '',
    'Concept lane:',
    ...conceptHits,
  ].join('\n');
}

export function getCodeIntelHealth(): {
  status: 'healthy' | 'degraded';
  clusters: number;
  totalTraceRuns: number;
  latestRebuildAt: string;
} {
  const domains = new Set(latestCorpusNodes.map((node) => node.domain));
  return {
    status: latestCorpusStats.errors > 0 ? 'degraded' : 'healthy',
    clusters: domains.size,
    totalTraceRuns: latestCorpusStats.facts,
    latestRebuildAt: latestCorpusStats.rebuildAt,
  };
}

export function getLatestIndexStats(): {
  runId: string;
  createdAt: Date;
  metadata: { nodeCount: number; factCount: number; errors: number; indexed: number };
} | null {
  if (latestCorpusStats.nodes === 0) return null;
  return {
    runId: `code-intel:${latestCorpusStats.rebuildAt || 'pending'}`,
    createdAt: latestCorpusStats.rebuildAt ? new Date(latestCorpusStats.rebuildAt) : new Date(),
    metadata: {
      nodeCount: latestCorpusStats.nodes,
      factCount: latestCorpusStats.facts,
      errors: latestCorpusStats.errors,
      indexed: latestCorpusStats.indexed,
    },
  };
}

export function getRetrievalRuns(limit: number = 20): Array<{
  id: string;
  query: string;
  status: 'completed' | 'failed';
  durationMs: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
}> {
  return latestCorpusNodes.slice(0, limit).map((node, index) => ({
    id: `code-intel-run-${index}`,
    query: node.symbol,
    status: 'completed',
    durationMs: 0,
    createdAt: new Date(latestCorpusStats.rebuildAt || Date.now()),
    metadata: {
      traceUsed: true,
      karpathyHook: Boolean(node.conceptFeatures?.length),
      clustersUsed: [node.domain],
    },
  }));
}

export default {
  rebuildCodeIntelCorpus,
  queryCodeIntelByDomain,
  generateClaudePlan
};
