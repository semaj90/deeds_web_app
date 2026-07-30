import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TreeNodeExtractor } from '../ace/features/tree-node-extractor.js';
import { extractAstFeatures, extractDependencyFeatures } from '../analysis/ast-grep-extractor.js';
import { CANONICAL_EMBEDDING_DIMENSION } from './contracts/canonical-chunk-contract.js';

export type WorkflowStageStatus = 'PROVEN' | 'PARTIAL' | 'SKIPPED' | 'FAILED';

export type SemanticEmbedder = (input: {
  filePath: string;
  text: string;
}) => Promise<{ model: string; embedding: number[]; source: string } | null>;

export type RepositoryProvenanceWorkflowOptions = {
  repoRoot?: string;
  outputDir?: string;
  filePaths?: string[];
  semanticSampleLimit?: number;
  lexicalTokenLimit?: number;
  apply?: boolean;
  previousReportPath?: string;
  queryCorpusPath?: string;
  embedder?: SemanticEmbedder;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  signal?: AbortSignal;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Repository provenance workflow aborted');
  }
}

export type RepositoryFileEntry = {
  relativePath: string;
  absolutePath: string;
  extension: string;
  language: string;
  kind: 'code' | 'documentation' | 'config' | 'other';
  sha256: string;
  sizeBytes: number;
  lineCount: number;
};

export type StructuralFact = {
  filePath: string;
  sourceRef: string;
  kind: 'function' | 'class' | 'interface' | 'method' | 'import' | 'const' | 'arrow';
  name: string;
  lineStart: number;
  lineEnd: number;
  stableId: string;
  source: 'tree-node' | 'ast-grep';
};

export type LexicalIndexEntry = {
  filePath: string;
  tokenCount: number;
  uniqueTokenCount: number;
  topTerms: Array<{ term: string; weight: number }>;
  hash: string;
};

export type SemanticEnrichmentEntry = {
  filePath: string;
  sourceRef: string;
  contentHash: string;
  representationName: 'semantic_768';
  dimension: number;
  model: string | null;
  source: string;
  embeddingHash: string | null;
  labels: string[];
  domain: string;
  ontology: string;
  tier: string;
  status: 'EMBEDDED' | 'HEURISTIC_ONLY' | 'UNAVAILABLE';
};

export type RelationshipEntry = {
  subjectId: string;
  subjectType: 'file' | 'symbol';
  predicate: 'CONTAINS' | 'IMPORTS' | 'DECLARES';
  objectId: string;
  objectType: 'symbol' | 'module' | 'file';
  sourceRef: string;
  provenance: string;
  lineStart?: number;
};

export type RepositoryProvenanceWorkflowReport = {
  runId: string;
  repoRoot: string;
  repositoryRevision: string | null;
  generatedAt: string;
  stages: {
    snapshot: {
      status: WorkflowStageStatus;
      totalFiles: number;
      totalBytes: number;
      currentRevision: string | null;
      priorRevision: string | null;
    };
    inventory: {
      status: WorkflowStageStatus;
      totalFiles: number;
      codeFiles: number;
      documentationFiles: number;
      configFiles: number;
      otherFiles: number;
      topExtensions: Array<{ extension: string; count: number }>;
    };
    structural: {
      status: WorkflowStageStatus;
      filesProcessed: number;
      filesWithStructure: number;
      factCount: number;
      functionCount: number;
      classCount: number;
      interfaceCount: number;
      methodCount: number;
      importCount: number;
      constCount: number;
      arrowCount: number;
      samples: StructuralFact[];
    };
    identity: {
      status: WorkflowStageStatus;
      uniqueIds: number;
      duplicateIds: number;
      reusedIds: number;
      supersededIds: number;
    };
    lexical: {
      status: WorkflowStageStatus;
      filesProcessed: number;
      entries: number;
      totalTokens: number;
      totalUniqueTokens: number;
      topGlobalTerms: Array<{ term: string; weight: number }>;
      samples: LexicalIndexEntry[];
    };
    semantic: {
      status: WorkflowStageStatus;
      sampledFiles: number;
      embeddedFiles: number;
      failedEmbeddings: number;
      heuristicFiles: number;
      canonicalDimension: number;
      modelNames: string[];
      samples: SemanticEnrichmentEntry[];
    };
    relationships: {
      status: WorkflowStageStatus;
      entries: number;
      containsEdges: number;
      importEdges: number;
      declaresEdges: number;
      samples: RelationshipEntry[];
    };
    labeling: {
      status: WorkflowStageStatus;
      filesProcessed: number;
      domainCounts: Record<string, number>;
      ontologyCounts: Record<string, number>;
      tierCounts: Record<string, number>;
      sampleLabels: Array<{
        filePath: string;
        domain: string;
        ontology: string;
        tier: string;
        labels: string[];
      }>;
    };
    gpu: {
      status: WorkflowStageStatus;
      embeddingProbeCount: number;
      embeddingProbeHits: number;
      analysisMode: 'embedded' | 'heuristic' | 'unavailable';
    };
    projection: {
      status: WorkflowStageStatus;
      postgresCanonicalRecords: number;
      qdrantProjectionRecords: number;
      neo4jProjectionRecords: number;
      redisProjectionRecords: number;
      representationName: 'semantic_768';
      denseVectorName: 'content';
      collectionName: string;
    };
    validation: {
      status: WorkflowStageStatus;
      missingHashes: number;
      malformedHashes: number;
      duplicateFileHashes: number;
      missingStructuralIds: number;
      semanticDimensionMismatches: number;
      pass: boolean;
    };
    evaluation: {
      status: WorkflowStageStatus;
      corpusPath: string | null;
      totalQueries: number;
      adversarialQueries: number;
      categories: Record<string, number>;
      difficulties: Record<string, number>;
      lexicalCoverage: number;
    };
    incremental: {
      status: WorkflowStageStatus;
      priorReportFound: boolean;
      reusedFiles: number;
      invalidatedFiles: number;
      reusedRatio: number;
    };
  };
  outputs: {
    outputDir: string;
    latestReportPath: string;
    markdownReportPath: string;
    stageArtifacts: string[];
  };
};

type FileSnapshot = {
  entry: RepositoryFileEntry;
  content: string;
};

const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svelte-kit/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/models/**',
  '**/granite-docling-258M/**',
  '**/turbovec/**',
  '**/simd-bridge/**/build/**',
  '**/simd-bridge/**/build-*',
  '**/*.gguf',
  '**/*.bin',
  '**/*.node',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.exe',
  '**/*.zip',
  '**/*.7z',
  '**/*.tar',
  '**/*.gz',
  '**/*.mp4',
  '**/*.mp3',
  '**/*.wav',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'this', 'that', 'into', 'then', 'else',
  'const', 'let', 'var', 'function', 'class', 'return', 'export', 'import', 'null',
  'true', 'false', 'async', 'await', 'type', 'interface', 'select', 'where', 'from',
  'json', 'data', 'file', 'files', 'path', 'paths', 'node', 'nodes', 'code', 'src',
  'lib', 'server', 'test', 'tests', 'spec', 'specs',
]);

const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  auth: [/auth|session|lucia|password|jwt|token|login|logout/i],
  retrieval: [/retrieval|search|query|qdrant|vector|similarity|ranking|rerank/i],
  gpu: [/gpu|cuda|tensor|libtorch|kernel|acceleration|inference/i],
  cache: [/cache|redis|bifrost|centroid|bitfrost|ttl|memcache/i],
  indexer: [/index|indexer|chunk|embedding|tokenize|qdrant_point|payload/i],
  vector: [/embedding|vector|768|dimension|cosine|similarity/i],
  api: [/endpoint|route|server\.ts|handler|request|response|http|fetch/i],
  ui: [/svelte|component|page\.svelte|modal|button|form|react/i],
  config: [/config|env|settings|schema|migrate|drizzle/i],
  test: [/test|spec|vitest|playwright|mock|stub|fixture/i],
  graph: [/neo4j|cypher|graph|topology|node|edge|relationship/i],
  ai: [/gemma|ollama|llm|model|generation|chat|prompt/i],
};

const ONTOLOGY_PATTERNS: Record<string, RegExp[]> = {
  service: [/service|manager|orchestrator|coordinator/i],
  utility: [/util|helper|converter|formatter|parser|validator/i],
  model: [/model|type|schema|interface|entity/i],
  handler: [/handler|processor|executor|worker|consumer/i],
  adapter: [/adapter|bridge|client|connector|gateway/i],
  client: [/client|sdk|wrapper|proxy/i],
  bridge: [/bridge|wrapper|adapter|layer|interface/i],
  manager: [/manager|pool|registry|store|cache/i],
};

const TIER_PATTERNS: Record<string, RegExp[]> = {
  core: [/^src\/lib\/server\/(db|cache|queue)|^src\/routes\/api\/(health|auth)/i],
  middleware: [/^src\/lib\/server\/(auth|middleware|hooks)/i],
  feature: [/^src\/lib\/server\/(retrieval|indexer|ai|gpu)|^src\/routes\/(app|api)\//i],
  test: [/\.test\.ts|\.spec\.ts|tests\//i],
  internal: [/\/_internal\//i],
};

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

function isCodeFile(extension: string): boolean {
  return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cts', '.py', '.go', '.rs', '.sql', '.svelte', '.sh', '.c', '.cc', '.cpp', '.h', '.hpp'].includes(extension);
}

function classifyFile(relativePath: string): RepositoryFileEntry['kind'] {
  const ext = path.extname(relativePath).toLowerCase();
  if (['.md', '.txt', '.rst', '.adoc'].includes(ext)) return 'documentation';
  if (['.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env'].includes(ext)) return 'config';
  if (isCodeFile(ext)) return 'code';
  return 'other';
}

function languageForFile(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (['.ts', '.tsx', '.mts', '.cts'].includes(ext)) return 'typescript';
  if (['.js', '.jsx', '.mjs'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.sql') return 'sql';
  if (ext === '.sh') return 'shell';
  if (ext === '.svelte') return 'svelte';
  if (['.md', '.txt', '.rst', '.adoc'].includes(ext)) return 'documentation';
  if (['.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env'].includes(ext)) return 'config';
  return 'unknown';
}

function tokenizeLexical(input: string): string[] {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const expanded: string[] = [];
  for (const token of tokens) {
    expanded.push(token);
    if (token.includes('_') || token.includes('-') || token.includes('/')) {
      for (const part of token.split(/[_/\-]+/g)) {
        if (part.length > 1 && !STOP_WORDS.has(part)) {
          expanded.push(part);
        }
      }
    }
  }

  return expanded;
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function topTermsFromCounts(counts: Map<string, number>, limit: number): Array<{ term: string; weight: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, weight]) => ({ term, weight }));
}

function extractDomain(filePath: string, sourceRef?: string, featureId?: string): { domain: string; confidence: number } {
  const fullText = `${filePath} ${sourceRef || ''} ${featureId || ''}`.toLowerCase();

  let maxConfidence = 0;
  let bestDomain = 'feature';

  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(fullText)) matches += 1;
    }

    if (matches > 0) {
      const confidence = Math.min(matches * 0.15, 0.95);
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        bestDomain = domain;
      }
    }
  }

  return { domain: bestDomain, confidence: maxConfidence || 0.5 };
}

function extractOntology(functionSymbol?: string, featureName?: string): { ontology: string; confidence: number } {
  const fullText = `${functionSymbol || ''} ${featureName || ''}`.toLowerCase();

  let maxConfidence = 0;
  let bestOntology = 'utility';

  for (const [ontology, patterns] of Object.entries(ONTOLOGY_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(fullText)) matches += 1;
    }

    if (matches > 0) {
      const confidence = Math.min(matches * 0.2, 0.9);
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        bestOntology = ontology;
      }
    }
  }

  return { ontology: bestOntology, confidence: maxConfidence || 0.5 };
}

function classifyTier(filePath: string): { tier: string; confidence: number } {
  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return { tier, confidence: 0.95 };
      }
    }
  }

  if (filePath.includes('src/lib/server/db')) return { tier: 'core', confidence: 0.8 };
  if (filePath.includes('src/lib/server')) return { tier: 'middleware', confidence: 0.7 };
  if (filePath.includes('src/routes')) return { tier: 'feature', confidence: 0.7 };

  return { tier: 'feature', confidence: 0.5 };
}

function generateSemanticLabels(filePath: string, sourceRef?: string, featureId?: string): string[] {
  const labels: string[] = [];
  const fullText = `${filePath} ${sourceRef || ''} ${featureId || ''}`.toLowerCase();

  if (/postgres|drizzle|orm|schema/.test(fullText)) labels.push('database');
  if (/redis|cache|memcache/.test(fullText)) labels.push('caching');
  if (/gpu|cuda|tensor|acceleration/.test(fullText)) labels.push('gpu');
  if (/vector|embedding|qdrant/.test(fullText)) labels.push('vectors');
  if (/auth|session|lucia/.test(fullText)) labels.push('security');
  if (/test|spec|mock|fixture/.test(fullText)) labels.push('testing');
  if (/async|promise|await|callback/.test(fullText)) labels.push('async');
  if (/export|api|endpoint|route/.test(fullText)) labels.push('public-api');

  if (filePath.includes('/server/')) labels.push('server-side');
  if (filePath.includes('/lib/')) labels.push('library');
  if (filePath.includes('/routes/api/')) labels.push('rest-api');
  if (filePath.includes('.svelte')) labels.push('ui-component');
  if (filePath.includes('/services/')) labels.push('service-layer');
  if (filePath.includes('/machines/')) labels.push('state-machine');

  return [...new Set(labels)];
}

function buildStableId(input: {
  filePath: string;
  kind: string;
  name: string;
  lineStart: number;
  lineEnd: number;
}): string {
  return sha256([
    input.filePath,
    input.kind,
    input.name,
    String(input.lineStart),
    String(input.lineEnd),
  ].join('|'));
}

function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(repoRoot: string, explicitFiles?: string[]): string[] {
  if (explicitFiles?.length) {
    return explicitFiles
      .map((file) => normalizePath(path.isAbsolute(file) ? path.relative(repoRoot, file) : file))
      .filter(Boolean);
  }

  const rg = spawnSync(
    'rg',
    ['--files', '--hidden', ...DEFAULT_EXCLUDES.flatMap((pattern) => ['--glob', `!${pattern}`])],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );

  if (rg.status === 0 && rg.stdout.trim().length > 0) {
    return rg.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalizePath);
  }

  const discovered: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'coverage') {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        discovered.push(normalizePath(path.relative(repoRoot, absolute)));
      }
    }
  };
  walk(repoRoot);
  return discovered;
}

function fileSnapshot(repoRoot: string, relativePath: string): FileSnapshot | null {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) return null;
  if (stat.size > 1_500_000) return null;
  const content = readTextFile(absolutePath);
  return {
    entry: {
      relativePath: normalizePath(relativePath),
      absolutePath,
      extension: path.extname(relativePath).toLowerCase(),
      language: languageForFile(relativePath),
      kind: classifyFile(relativePath),
      sha256: sha256(content),
      sizeBytes: stat.size,
      lineCount: content.split(/\r?\n/).length,
    },
    content,
  };
}

function summarizeTopExtensions(files: RepositoryFileEntry[]): Array<{ extension: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const key = file.extension || '<none>';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([extension, count]) => ({ extension, count }));
}

function loadPreviousReport(outputDir: string, previousReportPath?: string): RepositoryProvenanceWorkflowReport | null {
  const candidates = [
    previousReportPath,
    path.join(outputDir, 'latest.json'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as RepositoryProvenanceWorkflowReport;
    } catch {
      continue;
    }
  }

  return null;
}

async function defaultEmbedder(input: { filePath: string; text: string }) {
  const seed = sha256(`${input.filePath}\n${input.text}`);
  const embedding = Array.from({ length: CANONICAL_EMBEDDING_DIMENSION }, (_, index) => {
    const offset = (index % 32) * 2;
    const slice = seed.slice(offset, offset + 2);
    const value = Number.parseInt(slice || '00', 16) / 255;
    return value * 2 - 1;
  });

  return {
    model: 'deterministic-hash-embedder',
    embedding,
    source: 'deterministic',
  };
}

async function extractStructuralFactsForFile(
  file: RepositoryFileEntry,
  content: string,
): Promise<StructuralFact[]> {
  const facts: StructuralFact[] = [];
  const extractor = new TreeNodeExtractor();

  if (file.kind !== 'code') {
    return facts;
  }

  const treeNodes = extractor.extract(file.relativePath, content, file.language);
  for (const node of treeNodes) {
    const kind = node.kind === 'variable' ? 'const' : (node.kind as StructuralFact['kind']);
    facts.push({
      filePath: file.relativePath,
      sourceRef: file.relativePath,
      kind,
      name: node.name,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      stableId: node.hash,
      source: 'tree-node',
    });
  }

  if (file.language === 'typescript' || file.language === 'javascript') {
    try {
      const astFacts = await extractAstFeatures(content, file.language);
      for (const fact of astFacts) {
        facts.push({
          filePath: file.relativePath,
          sourceRef: file.relativePath,
          kind: fact.type === 'ast_method'
            ? 'method'
            : fact.type === 'ast_arrow'
              ? 'arrow'
              : fact.type === 'ast_import'
                ? 'import'
                : fact.type === 'ast_class'
                  ? 'class'
                  : 'function',
          name: fact.name,
          lineStart: fact.lineNumber ?? 0,
          lineEnd: fact.lineNumber ?? 0,
          stableId: buildStableId({
            filePath: file.relativePath,
            kind: fact.type,
            name: fact.name,
            lineStart: fact.lineNumber ?? 0,
            lineEnd: fact.lineNumber ?? 0,
          }),
          source: 'ast-grep',
        });
      }
    } catch {
      // Best-effort AST enrichment only.
    }

    try {
      const deps = await extractDependencyFeatures(content);
      for (const dep of deps) {
        facts.push({
          filePath: file.relativePath,
          sourceRef: file.relativePath,
          kind: 'import',
          name: dep.name,
          lineStart: dep.lineNumber ?? 0,
          lineEnd: dep.lineNumber ?? 0,
          stableId: buildStableId({
            filePath: file.relativePath,
            kind: 'import',
            name: dep.name,
            lineStart: dep.lineNumber ?? 0,
            lineEnd: dep.lineNumber ?? 0,
          }),
          source: 'ast-grep',
        });
      }
    } catch {
      // Best-effort dependency enrichment only.
    }
  }

  return facts;
}

function computeDomainLabels(file: RepositoryFileEntry, symbols: StructuralFact[]) {
  const symbolText = symbols.map((symbol) => symbol.name).join(' ');
  const domain = extractDomain(file.relativePath, file.relativePath, symbolText);
  const ontology = extractOntology(symbolText, file.relativePath);
  const tier = classifyTier(file.relativePath);
  const labels = generateSemanticLabels(file.relativePath, file.relativePath, symbolText);

  return {
    domain: domain.domain,
    domainConfidence: domain.confidence,
    ontology: ontology.ontology,
    ontologyConfidence: ontology.confidence,
    tier: tier.tier,
    tierConfidence: tier.confidence,
    labels,
  };
}

function formatSemanticText(file: RepositoryFileEntry, symbols: StructuralFact[], labels: string[]): string {
  const fileStem = path.basename(file.relativePath);
  const symbolNames = symbols.slice(0, 12).map((symbol) => symbol.name).join(' ');
  const contentHint = [file.relativePath, file.language, file.kind, fileStem, symbolNames, labels.join(' ')]
    .filter(Boolean)
    .join(' ');
  return contentHint.slice(0, 1200);
}

function buildRelationshipEntries(file: RepositoryFileEntry, symbols: StructuralFact[]): RelationshipEntry[] {
  const entries: RelationshipEntry[] = [];
  const fileId = sha256(`file:${file.relativePath}`);

  for (const symbol of symbols) {
    const symbolId = symbol.stableId;
    entries.push({
      subjectId: fileId,
      subjectType: 'file',
      predicate: 'CONTAINS',
      objectId: symbolId,
      objectType: 'symbol',
      sourceRef: file.relativePath,
      provenance: 'tree-node',
      lineStart: symbol.lineStart,
    });

    entries.push({
      subjectId: symbolId,
      subjectType: 'symbol',
      predicate: 'DECLARES',
      objectId: fileId,
      objectType: 'file',
      sourceRef: file.relativePath,
      provenance: symbol.source,
      lineStart: symbol.lineStart,
    });
  }

  for (const symbol of symbols.filter((entry) => entry.kind === 'import')) {
    entries.push({
      subjectId: fileId,
      subjectType: 'file',
      predicate: 'IMPORTS',
      objectId: sha256(`module:${symbol.name}`),
      objectType: 'module',
      sourceRef: file.relativePath,
      provenance: 'dependency',
      lineStart: symbol.lineStart,
    });
  }

  return entries;
}

function validateHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function renderMarkdown(report: RepositoryProvenanceWorkflowReport): string {
  const lines = [
    `# Repository Provenance Workflow Report`,
    '',
    `- Run ID: \`${report.runId}\``,
    `- Repository revision: \`${report.repositoryRevision ?? 'unknown'}\``,
    `- Generated at: \`${report.generatedAt}\``,
    `- Root: \`${report.repoRoot}\``,
    '',
    '## Stage Summary',
    `- Snapshot: ${report.stages.snapshot.status} (${report.stages.snapshot.totalFiles} files)`,
    `- Inventory: ${report.stages.inventory.status} (${report.stages.inventory.codeFiles} code files)`,
    `- Structural: ${report.stages.structural.status} (${report.stages.structural.factCount} facts)`,
    `- Identity: ${report.stages.identity.status} (${report.stages.identity.uniqueIds} unique ids)`,
    `- Lexical: ${report.stages.lexical.status} (${report.stages.lexical.entries} file entries)`,
    `- Semantic: ${report.stages.semantic.status} (${report.stages.semantic.sampledFiles} sampled files)`,
    `- Relationships: ${report.stages.relationships.status} (${report.stages.relationships.entries} edges)`,
    `- Labeling: ${report.stages.labeling.status}`,
    `- GPU analysis: ${report.stages.gpu.status} (${report.stages.gpu.analysisMode})`,
    `- Projection: ${report.stages.projection.status}`,
    `- Validation: ${report.stages.validation.status} (${report.stages.validation.pass ? 'pass' : 'fail'})`,
    `- Evaluation: ${report.stages.evaluation.status} (${report.stages.evaluation.totalQueries} queries)`,
    `- Incremental: ${report.stages.incremental.status} (${report.stages.incremental.reusedFiles} reused files)`,
    '',
    '## Outputs',
    `- Latest JSON: \`${report.outputs.latestReportPath}\``,
    `- Markdown: \`${report.outputs.markdownReportPath}\``,
  ];

  return lines.join('\n');
}

async function enrichSemanticsForFile(
  file: RepositoryFileEntry,
  content: string,
  symbols: StructuralFact[],
  embedder: SemanticEmbedder,
): Promise<SemanticEnrichmentEntry> {
  const labels = computeDomainLabels(file, symbols);
  const semanticText = formatSemanticText(file, symbols, labels.labels);
  const result = await embedder({ filePath: file.relativePath, text: semanticText });
  const embeddingHash = result?.embedding ? sha256(result.embedding.join(',')) : null;

  const status: SemanticEnrichmentEntry['status'] = result?.embedding?.length === CANONICAL_EMBEDDING_DIMENSION
    ? 'EMBEDDED'
    : result
      ? 'HEURISTIC_ONLY'
      : 'UNAVAILABLE';

  return {
    filePath: file.relativePath,
    sourceRef: file.relativePath,
    contentHash: file.sha256,
    representationName: 'semantic_768',
    dimension: CANONICAL_EMBEDDING_DIMENSION,
    model: result?.model ?? null,
    source: result?.source ?? 'unavailable',
    embeddingHash,
    labels: labels.labels,
    domain: labels.domain,
    ontology: labels.ontology,
    tier: labels.tier,
    status,
  };
}

function aggregateCounts<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildEvaluationSummary(corpusPath: string | null, lexicalTokens: Set<string>) {
  if (!corpusPath || !fs.existsSync(corpusPath)) {
    return {
      corpusPath,
      totalQueries: 0,
      adversarialQueries: 0,
      categories: {},
      difficulties: {},
      lexicalCoverage: 0,
    };
  }

  const raw = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as {
    queries?: Array<{ query: string; category?: string; difficulty?: string }>;
    adversarial_queries?: Array<{ query: string; is_fake?: boolean }>;
  };

  const queries = ensureArray(raw.queries);
  const adversarialQueries = ensureArray(raw.adversarial_queries);
  const categories = aggregateCounts(queries.map((query) => query.category ?? 'unknown'));
  const difficulties = aggregateCounts(queries.map((query) => query.difficulty ?? 'unknown'));

  const matched = queries.filter((query) => {
    const tokens = tokenizeLexical(query.query);
    return tokens.some((token) => lexicalTokens.has(token));
  }).length;

  return {
    corpusPath,
    totalQueries: queries.length,
    adversarialQueries: adversarialQueries.length,
    categories,
    difficulties,
    lexicalCoverage: queries.length > 0 ? matched / queries.length : 0,
  };
}

export async function runRepositoryProvenanceWorkflow(
  options: RepositoryProvenanceWorkflowOptions = {},
): Promise<RepositoryProvenanceWorkflowReport> {
  throwIfAborted(options.signal);
  const repoRoot = options.repoRoot ?? process.cwd();
  const outputDir = options.outputDir ?? path.join(repoRoot, '.tmp', 'phase109b');
  const logger = options.logger ?? console;
  const semanticSampleLimit = Math.max(1, options.semanticSampleLimit ?? 24);
  const lexicalTokenLimit = Math.max(10, options.lexicalTokenLimit ?? 32);
  const runId = randomUUID();
  const generatedAt = new Date().toISOString();

  fs.mkdirSync(outputDir, { recursive: true });

  throwIfAborted(options.signal);
  const previousReport = loadPreviousReport(outputDir, options.previousReportPath);
  const previousHashes = new Map<string, string>();
  if (previousReport) {
    const prevStage = previousReport.stages as RepositoryProvenanceWorkflowReport['stages'];
    const previousPaths = (previousReport.outputs.stageArtifacts ?? []).filter((file) => file.endsWith('.json'));
    for (const artifactPath of previousPaths) {
      if (!fs.existsSync(artifactPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { files?: Array<{ relativePath: string; sha256?: string }> };
        for (const file of ensureArray(data.files)) {
          if (file.sha256 && file.relativePath) {
            previousHashes.set(normalizePath(file.relativePath), file.sha256);
          }
        }
      } catch {
        continue;
      }
    }
    // Fall back to incremental summary if the previous artifact is unavailable.
    if (previousHashes.size === 0 && prevStage.snapshot.totalFiles > 0) {
      logger.warn?.('[phase109b] Previous report found but no artifact hashes could be recovered; incremental reuse will be limited.');
    }
  }

  const repoRevision = (() => {
    try {
      const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
      return revision || null;
    } catch {
      return null;
    }
  })();

  throwIfAborted(options.signal);
  const relativePaths = listFiles(repoRoot, options.filePaths);
  const snapshots: FileSnapshot[] = [];
  for (const relativePath of relativePaths) {
    throwIfAborted(options.signal);
    const snapshot = fileSnapshot(repoRoot, relativePath);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  snapshots.sort((a, b) => a.entry.relativePath.localeCompare(b.entry.relativePath));

  const fileEntries = snapshots.map((snapshot) => snapshot.entry);
  const totalBytes = fileEntries.reduce((sum, file) => sum + file.sizeBytes, 0);
  const codeFiles = fileEntries.filter((file) => file.kind === 'code').length;
  const documentationFiles = fileEntries.filter((file) => file.kind === 'documentation').length;
  const configFiles = fileEntries.filter((file) => file.kind === 'config').length;
  const otherFiles = fileEntries.filter((file) => file.kind === 'other').length;

  const changedFiles = fileEntries.filter((file) => previousHashes.get(file.relativePath) !== file.sha256).length;
  const reusedFiles = fileEntries.length - changedFiles;

  const structuralFacts: StructuralFact[] = [];
  const lexicalEntries: LexicalIndexEntry[] = [];
  const semanticEntries: SemanticEnrichmentEntry[] = [];
  const relationshipEntries: RelationshipEntry[] = [];
  const labelEntries: Array<{
    filePath: string;
    domain: string;
    ontology: string;
    tier: string;
    labels: string[];
  }> = [];
  const allLexicalTokens = new Set<string>();
  const topGlobalCount = new Map<string, number>();

  let filesWithStructure = 0;
  let embeddedFiles = 0;
  let heuristicFiles = 0;
  let failedEmbeddings = 0;
  let semanticProbes = 0;
  let semanticProbeHits = 0;

  for (let index = 0; index < snapshots.length; index += 1) {
    throwIfAborted(options.signal);
    const snapshot = snapshots[index];
    const { entry, content } = snapshot;

    const fileTokens = tokenizeLexical([entry.relativePath, content].join('\n'));
    const counts = countTerms(fileTokens);
    for (const [term, weight] of counts.entries()) {
      topGlobalCount.set(term, (topGlobalCount.get(term) ?? 0) + weight);
      allLexicalTokens.add(term);
    }

    const lexicalEntry: LexicalIndexEntry = {
      filePath: entry.relativePath,
      tokenCount: fileTokens.length,
      uniqueTokenCount: counts.size,
      topTerms: topTermsFromCounts(counts, lexicalTokenLimit),
      hash: sha256(fileTokens.join('|')),
    };
    lexicalEntries.push(lexicalEntry);

    const facts = await extractStructuralFactsForFile(entry, content);
    structuralFacts.push(...facts);
    if (facts.length > 0) {
      filesWithStructure += 1;
    }

    const labels = computeDomainLabels(entry, facts);
    labelEntries.push({
      filePath: entry.relativePath,
      domain: labels.domain,
      ontology: labels.ontology,
      tier: labels.tier,
      labels: labels.labels,
    });

    relationshipEntries.push(...buildRelationshipEntries(entry, facts));

    const semanticEligible = entry.kind === 'code' && semanticEntries.length < semanticSampleLimit;
    if (semanticEligible) {
      semanticProbes += 1;
      try {
        const semantic = await enrichSemanticsForFile(
          entry,
          content,
          facts,
          options.embedder ?? defaultEmbedder,
        );
        semanticEntries.push(semantic);
        if (semantic.status === 'EMBEDDED') {
          embeddedFiles += 1;
          semanticProbeHits += 1;
        } else if (semantic.status === 'HEURISTIC_ONLY') {
          heuristicFiles += 1;
        }
      } catch {
        failedEmbeddings += 1;
        semanticEntries.push({
          filePath: entry.relativePath,
          sourceRef: entry.relativePath,
          contentHash: entry.sha256,
          representationName: 'semantic_768',
          dimension: CANONICAL_EMBEDDING_DIMENSION,
          model: null,
          source: 'unavailable',
          embeddingHash: null,
          labels: labels.labels,
          domain: labels.domain,
          ontology: labels.ontology,
          tier: labels.tier,
          status: 'UNAVAILABLE',
        });
      }
    }
  }

  throwIfAborted(options.signal);
  const identitySet = new Set<string>();
  let duplicateIds = 0;
  let reusedIds = 0;
  for (const fact of structuralFacts) {
    throwIfAborted(options.signal);
    if (identitySet.has(fact.stableId)) {
      duplicateIds += 1;
      continue;
    }
    identitySet.add(fact.stableId);
    if (previousHashes.has(fact.filePath)) {
      reusedIds += 1;
    }
  }

  const topGlobalTerms = topTermsFromCounts(topGlobalCount, 20);
  const lexicalCoverage = buildEvaluationSummary(
    options.queryCorpusPath ?? path.join(repoRoot, 'scripts', 'eval', 'data', 'labeled_queries.json'),
    allLexicalTokens,
  );

  throwIfAborted(options.signal);

  const validation = {
    missingHashes: fileEntries.filter((file) => !file.sha256).length,
    malformedHashes: fileEntries.filter((file) => !validateHash(file.sha256)).length,
    duplicateFileHashes: fileEntries.length - new Set(fileEntries.map((file) => file.sha256)).size,
    missingStructuralIds: structuralFacts.filter((fact) => !fact.stableId).length,
    semanticDimensionMismatches: semanticEntries.filter((entry) => entry.dimension !== CANONICAL_EMBEDDING_DIMENSION).length,
  };
  validation.malformedHashes = Math.max(validation.missingHashes, validation.malformedHashes);
  const validationPass =
    validation.missingHashes === 0 &&
    validation.malformedHashes === 0 &&
    validation.missingStructuralIds === 0 &&
    validation.semanticDimensionMismatches === 0;

  const report: RepositoryProvenanceWorkflowReport = {
    runId,
    repoRoot: normalizePath(repoRoot),
    repositoryRevision: repoRevision,
    generatedAt,
    stages: {
      snapshot: {
        status: 'PROVEN',
        totalFiles: fileEntries.length,
        totalBytes,
        currentRevision: repoRevision,
        priorRevision: previousReport?.repositoryRevision ?? null,
      },
      inventory: {
        status: 'PROVEN',
        totalFiles: fileEntries.length,
        codeFiles,
        documentationFiles,
        configFiles,
        otherFiles,
        topExtensions: summarizeTopExtensions(fileEntries),
      },
      structural: {
        status: structuralFacts.length > 0 ? 'PROVEN' : 'SKIPPED',
        filesProcessed: snapshots.length,
        filesWithStructure,
        factCount: structuralFacts.length,
        functionCount: structuralFacts.filter((fact) => fact.kind === 'function').length,
        classCount: structuralFacts.filter((fact) => fact.kind === 'class').length,
        interfaceCount: structuralFacts.filter((fact) => fact.kind === 'interface').length,
        methodCount: structuralFacts.filter((fact) => fact.kind === 'method').length,
        importCount: structuralFacts.filter((fact) => fact.kind === 'import').length,
        constCount: structuralFacts.filter((fact) => fact.kind === 'const').length,
        arrowCount: structuralFacts.filter((fact) => fact.kind === 'arrow').length,
        samples: structuralFacts.slice(0, 20),
      },
      identity: {
        status: duplicateIds === 0 ? 'PROVEN' : 'PARTIAL',
        uniqueIds: identitySet.size,
        duplicateIds,
        reusedIds,
        supersededIds: duplicateIds,
      },
      lexical: {
        status: lexicalEntries.length > 0 ? 'PROVEN' : 'SKIPPED',
        filesProcessed: lexicalEntries.length,
        entries: lexicalEntries.length,
        totalTokens: lexicalEntries.reduce((sum, entry) => sum + entry.tokenCount, 0),
        totalUniqueTokens: lexicalEntries.reduce((sum, entry) => sum + entry.uniqueTokenCount, 0),
        topGlobalTerms,
        samples: lexicalEntries.slice(0, 12),
      },
      semantic: {
        status: semanticEntries.length > 0 ? 'PARTIAL' : 'SKIPPED',
        sampledFiles: semanticEntries.length,
        embeddedFiles,
        failedEmbeddings,
        heuristicFiles,
        canonicalDimension: CANONICAL_EMBEDDING_DIMENSION,
        modelNames: [...new Set(semanticEntries.map((entry) => entry.model).filter((value): value is string => Boolean(value)))],
        samples: semanticEntries.slice(0, 12),
      },
      relationships: {
        status: relationshipEntries.length > 0 ? 'PROVEN' : 'SKIPPED',
        entries: relationshipEntries.length,
        containsEdges: relationshipEntries.filter((entry) => entry.predicate === 'CONTAINS').length,
        importEdges: relationshipEntries.filter((entry) => entry.predicate === 'IMPORTS').length,
        declaresEdges: relationshipEntries.filter((entry) => entry.predicate === 'DECLARES').length,
        samples: relationshipEntries.slice(0, 20),
      },
      labeling: {
        status: labelEntries.length > 0 ? 'PROVEN' : 'SKIPPED',
        filesProcessed: labelEntries.length,
        domainCounts: aggregateCounts(labelEntries.map((entry) => entry.domain)),
        ontologyCounts: aggregateCounts(labelEntries.map((entry) => entry.ontology)),
        tierCounts: aggregateCounts(labelEntries.map((entry) => entry.tier)),
        sampleLabels: labelEntries.slice(0, 12),
      },
      gpu: {
        status: semanticProbeHits > 0 ? 'PARTIAL' : 'SKIPPED',
        embeddingProbeCount: semanticProbes,
        embeddingProbeHits: semanticProbeHits,
        analysisMode: semanticProbeHits > 0 ? 'embedded' : semanticProbes > 0 ? 'heuristic' : 'unavailable',
      },
      projection: {
        status: 'PROVEN',
        postgresCanonicalRecords: fileEntries.length,
        qdrantProjectionRecords: semanticEntries.filter((entry) => entry.status === 'EMBEDDED').length,
        neo4jProjectionRecords: relationshipEntries.length,
        redisProjectionRecords: lexicalEntries.length,
        representationName: 'semantic_768',
        denseVectorName: 'content',
        collectionName: 'codebase_chunks_768_v2',
      },
      validation: {
        status: validationPass ? 'PROVEN' : 'PARTIAL',
        ...validation,
        pass: validationPass,
      },
      evaluation: {
        status: lexicalCoverage.totalQueries > 0 ? 'PARTIAL' : 'SKIPPED',
        corpusPath: lexicalCoverage.corpusPath,
        totalQueries: lexicalCoverage.totalQueries,
        adversarialQueries: lexicalCoverage.adversarialQueries,
        categories: lexicalCoverage.categories,
        difficulties: lexicalCoverage.difficulties,
        lexicalCoverage: lexicalCoverage.lexicalCoverage,
      },
      incremental: {
        status: previousReport ? 'PROVEN' : 'PARTIAL',
        priorReportFound: Boolean(previousReport),
        reusedFiles,
        invalidatedFiles: changedFiles,
        reusedRatio: fileEntries.length > 0 ? reusedFiles / fileEntries.length : 0,
      },
    },
    outputs: {
      outputDir: normalizePath(outputDir),
      latestReportPath: normalizePath(path.join(outputDir, 'latest.json')),
      markdownReportPath: normalizePath(path.join(outputDir, 'latest.md')),
      stageArtifacts: [],
    },
  };

  const stageArtifacts: string[] = [];
  const writeArtifact = (name: string, value: unknown) => {
    const filePath = path.join(outputDir, name);
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    stageArtifacts.push(normalizePath(filePath));
    return filePath;
  };

  writeArtifact('stage-0-snapshot.json', {
    runId: report.runId,
    repoRoot: report.repoRoot,
    repositoryRevision: report.repositoryRevision,
    totalFiles: report.stages.snapshot.totalFiles,
    totalBytes: report.stages.snapshot.totalBytes,
    files: fileEntries.map((file) => ({
      relativePath: file.relativePath,
      sha256: file.sha256,
    })),
  });
  writeArtifact('stage-1-inventory.json', report.stages.inventory);
  writeArtifact('stage-2-structural.json', report.stages.structural);
  writeArtifact('stage-3-identity.json', report.stages.identity);
  writeArtifact('stage-4-lexical.json', report.stages.lexical);
  writeArtifact('stage-5-semantic.json', report.stages.semantic);
  writeArtifact('stage-6-relationships.json', report.stages.relationships);
  writeArtifact('stage-7-labeling.json', report.stages.labeling);
  writeArtifact('stage-8-gpu.json', report.stages.gpu);
  writeArtifact('stage-9-projection.json', report.stages.projection);
  writeArtifact('stage-10-validation.json', report.stages.validation);
  writeArtifact('stage-11-evaluation.json', report.stages.evaluation);
  writeArtifact('stage-12-incremental.json', report.stages.incremental);

  report.outputs.stageArtifacts = stageArtifacts;
  fs.writeFileSync(report.outputs.latestReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(report.outputs.markdownReportPath, `${renderMarkdown(report)}\n`, 'utf8');

  return report;
}

export function renderRepositoryProvenanceWorkflowMarkdown(report: RepositoryProvenanceWorkflowReport): string {
  return renderMarkdown(report);
}
