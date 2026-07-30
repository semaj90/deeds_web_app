/**
 * src/lib/server/ai/feature-extraction.ts
 *
 * LangExtract: Query feature extraction for intelligent routing + retrieval optimization
 * and optional source-aware enrichment.
 *
 * Extracts from user query:
 * - Intent: 'debug' | 'refactor' | 'explain' | 'search' | 'general'
 * - Entities: classes, functions, files, variables, errors
 * - Keywords: programming concepts matched against codebase schema
 * - Phrases: top 10 key phrases for semantic search
 *
 * Used by parallel-orchestrator to decide which retrieval lanes to activate
 * and how to weight results.
 *
 * Canonical dense retrieval stays on semantic_768. The 512 lane is a
 * reference-only candidate handled downstream; this module only routes query
 * signals and does not own vector dimensionality.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { executeEnhancedRgSearch } from '$lib/server/indexer/rg-search-utility.js';

// Intent classification keywords

const INTENT_KEYWORDS = {
  debug: [
    'error', 'bug', 'fail', 'crash', 'broken', 'fix', 'exception',
    'timeout', 'trace', 'stack trace', 'undefined', 'null pointer',
    'segfault', 'panic', 'assert',
  ],
  refactor: [
    'refactor', 'cleanup', 'simplify', 'optimize', 'rewrite',
    'architecture', 'design', 'restructure', 'modularize', 'migrate',
  ],
  explain: [
    'what', 'how', 'why', 'explain', 'understand', 'clarify',
    'describe', 'tell me about', 'what is', 'how does',
  ],
  search: [
    'find', 'search', 'where', 'locate', 'look for', 'contains',
    'references', 'uses', 'calls', 'imports',
  ],
};

// Programming entity patterns

const ENTITY_PATTERNS = {
  classOrInterface: /\b([A-Z][A-Za-z0-9_]*(?:Interface|Component|Service|Repository|Manager)?)\b/g,
  functionOrMethod: /\b([a-z][a-zA-Z0-9_]*(?:Async|Sync)?)\s*\(/g,
  filePath: /(?:(?:src|lib|scripts|tests)\/[a-zA-Z0-9/_\-\.]+)/g,
  variable: /\b([a-z_][a-zA-Z0-9_]*)\s*(?:=|:)/g,
  error: /(Error|Exception|Panic|Fatal|Warning|Notice)\b/g,
};

// Keyword whitelist (common programming concepts)

const PROGRAMMING_KEYWORDS = [
  'async', 'await', 'promise', 'callback', 'generator',
  'type', 'interface', 'enum', 'class', 'struct',
  'function', 'method', 'constructor', 'property',
  'export', 'import', 'module', 'package',
  'middleware', 'router', 'handler', 'controller',
  'database', 'orm', 'schema', 'migration',
  'hook', 'lifecycle', 'effect', 'state',
  'component', 'svelte', 'react', 'vue',
  'api', 'endpoint', 'rest', 'graphql',
  'cache', 'redis', 'qdrant', 'postgres',
  'gpu', 'cuda', 'tensor', 'embedding',
  'vector', 'matrix', 'algorithm', 'complexity',
  'debug', 'log', 'trace', 'telemetry',
  'test', 'unit', 'integration', 'e2e',
];

// Types

export interface QueryFeatures {
  intent: 'debug' | 'refactor' | 'explain' | 'search' | 'general';
  intentConfidence: number; // 0-1
  entities: ExtractedEntity[];
  keywords: string[];
  topPhrases: string[];
  isComplexQuery: boolean;
}

export interface ExtractedEntity {
  type: 'class' | 'function' | 'file' | 'variable' | 'error' | 'entity' | 'relation';
  name: string;
  confidence: number; // 0-1
  start?: number;
  end?: number;
  byteOffset?: number;
  byteLength?: number;
  tokenSpan?: { start: number; end: number };
  sourceKind?: 'llm' | 'ast_grep' | 'regex' | 'langextract' | 'labeler';
  labelerScore?: number;
  langExtractRelations?: Array<{ type: string; targetEntity: string }>;
  contextWindow?: string;
}

export interface ExtractionOptions {
  maxChars?: number;
  sourcePath?: string;
  sourceLanguage?: string;
  astGrepPatterns?: string[];
  rgSearchPatterns?: Array<{ pattern: string; contextLines?: number }>;
  capturePositions?: boolean;
  useLangExtract?: boolean;
  usePyTorchLabeler?: boolean;
  minConfidence?: number;
}

interface LaneEntity extends ExtractedEntity {
  sourceKind: NonNullable<ExtractedEntity['sourceKind']>;
}

function makeContextWindow(text: string, start: number, end: number, padding = 50): string {
  const left = Math.max(0, start - padding);
  const right = Math.min(text.length, end + padding);
  return text.slice(left, right);
}

function charIndexToByteOffset(text: string, charIndex: number): number {
  return Buffer.byteLength(text.slice(0, charIndex), 'utf8');
}

function tokenIndexAt(text: string, charIndex: number): number {
  const before = text.slice(0, charIndex);
  const tokens = before.match(/\S+/g);
  return tokens?.length ?? 0;
}

function lineColumnToCharIndex(text: string, line: number, column: number): number {
  if (line <= 1) {
    return Math.max(0, column - 1);
  }

  let currentLine = 1;
  let index = 0;
  while (index < text.length && currentLine < line) {
    if (text[index] === '\n') {
      currentLine++;
    }
    index++;
  }
  return Math.min(text.length, index + Math.max(0, column - 1));
}

function toLaneEntity(
  entity: ExtractedEntity,
  text: string,
  start?: number,
  end?: number,
): LaneEntity {
  const safeStart = start ?? entity.start ?? 0;
  const safeEnd = end ?? entity.end ?? safeStart + entity.name.length;
  return {
    ...entity,
    start: safeStart,
    end: safeEnd,
    byteOffset: entity.byteOffset ?? charIndexToByteOffset(text, safeStart),
    byteLength: entity.byteLength ?? Buffer.byteLength(text.slice(safeStart, safeEnd), 'utf8'),
    tokenSpan: entity.tokenSpan ?? {
      start: tokenIndexAt(text, safeStart),
      end: tokenIndexAt(text, safeEnd),
    },
    contextWindow: entity.contextWindow ?? makeContextWindow(text, safeStart, safeEnd),
    sourceKind: entity.sourceKind ?? 'regex',
  };
}

function dedupeLaneEntities(entities: LaneEntity[]): LaneEntity[] {
  const merged = new Map<string, LaneEntity>();
  for (const entity of entities) {
    const key = [
      entity.sourceKind,
      entity.type,
      entity.name.trim().toLowerCase(),
      entity.byteOffset ?? entity.start ?? '',
      entity.byteLength ?? entity.end ?? '',
    ].join('|');
    const existing = merged.get(key);
    if (!existing || entity.confidence > existing.confidence) {
      merged.set(key, entity);
    }
  }
  return Array.from(merged.values());
}

function extractBaseEntities(query: string): LaneEntity[] {
  const entities: LaneEntity[] = [];

  const classMatches = query.match(ENTITY_PATTERNS.classOrInterface) || [];
  for (const match of classMatches) {
    if (/^[A-Z]/.test(match)) {
      entities.push({
        type: 'class',
        name: match,
        confidence: 0.8,
        sourceKind: 'regex',
      });
    }
  }

  const funcMatches = query.match(ENTITY_PATTERNS.functionOrMethod) || [];
  for (const match of funcMatches) {
    const name = match.replace(/\s*\($/, '');
    if (name.length > 0) {
      entities.push({
        type: 'function',
        name,
        confidence: 0.85,
        sourceKind: 'regex',
      });
    }
  }

  const fileMatches = query.match(ENTITY_PATTERNS.filePath) || [];
  for (const match of fileMatches) {
    entities.push({
      type: 'file',
      name: match,
      confidence: 0.9,
      sourceKind: 'regex',
    });
  }

  const errorMatches = query.match(ENTITY_PATTERNS.error) || [];
  for (const match of errorMatches) {
    entities.push({
      type: 'error',
      name: match,
      confidence: 0.75,
      sourceKind: 'regex',
    });
  }

  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.type}:${e.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadAstLaneEntities(
  text: string,
  options: ExtractionOptions,
): Promise<LaneEntity[]> {
  const sourcePath = options.sourcePath?.trim();
  const hasAstPatterns = (options.astGrepPatterns?.length ?? 0) > 0;
  const hasCodeHint = Boolean(sourcePath) || /function|class|import|export|=>|interface|type\s+\w+/i.test(text);
  if (!hasCodeHint && !hasAstPatterns) return [];

  const entities: LaneEntity[] = [];

  try {
    const { extractAstFeatures, extractDependencyFeatures } = await import('../analysis/ast-grep-extractor.js');
    const astFeatures = await extractAstFeatures(text, options.sourceLanguage ?? sourcePath);
    for (const feature of astFeatures) {
      const mappedType =
        feature.type === 'ast_class' ? 'class' :
        feature.type === 'ast_method' || feature.type === 'ast_arrow' || feature.type === 'ast_function' ? 'function' :
        feature.type === 'ast_import' ? 'file' : 'entity';
      const start = feature.rawText ? text.indexOf(feature.rawText) : -1;
      entities.push(toLaneEntity({
        type: mappedType,
        name: feature.name,
        confidence: feature.confidence ?? 0.92,
        sourceKind: 'ast_grep',
        contextWindow: feature.description,
        }, text, start >= 0 ? start : feature.lineNumber ? lineColumnToCharIndex(text, feature.lineNumber, 1) : 0,
         start >= 0 ? start + Math.max(1, feature.rawText?.length ?? feature.name.length) : undefined));
    }

    const dependencyFeatures = await extractDependencyFeatures(text);
    for (const feature of dependencyFeatures) {
      const start = feature.rawText ? text.indexOf(feature.rawText) : -1;
      entities.push(toLaneEntity({
        type: 'file',
        name: feature.name,
        confidence: feature.confidence ?? 0.9,
        sourceKind: 'ast_grep',
        contextWindow: feature.description,
      }, text, start >= 0 ? start : 0, start >= 0 ? start + feature.name.length : undefined));
    }

    if (hasAstPatterns && sourcePath && existsSync(sourcePath)) {
      for (const pattern of options.astGrepPatterns ?? []) {
        const result = spawnSync('ast-grep', ['run', '--pattern', pattern, '--lang', options.sourceLanguage ?? 'TypeScript', '--json', sourcePath], {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
        });
        const stdout = String(result.stdout ?? '').trim();
        if (!stdout) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          continue;
        }
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const record = item as Record<string, unknown>;
          const name =
            String(record.text ?? record.match ?? record.pattern ?? pattern).trim() ||
            pattern;
          const rawLine = Number(record.line ?? record.lineNumber ?? record.startLine ?? 1);
          const rawColumn = Number(record.column ?? record.col ?? record.startColumn ?? 1);
          const start = lineColumnToCharIndex(text, rawLine, rawColumn);
          entities.push(toLaneEntity({
            type: 'entity',
            name,
            confidence: 0.93,
            sourceKind: 'ast_grep',
            contextWindow: String(record.context ?? record.description ?? pattern),
          }, text, start, start + name.length));
        }
      }
    }
  } catch {
    // Leave ast-grep lane empty if the parser/CLI is unavailable.
  }

  return entities;
}

async function loadRgLaneEntities(
  text: string,
  options: ExtractionOptions,
): Promise<LaneEntity[]> {
  const searchPath = options.sourcePath?.trim();
  const patterns = options.rgSearchPatterns ?? [];
  if (!searchPath || patterns.length === 0) return [];

  const entities: LaneEntity[] = [];
  for (const entry of patterns) {
    const hits = executeEnhancedRgSearch(entry.pattern, searchPath).slice(0, 20);
    for (const hit of hits) {
      const fileText = existsSync(hit.file) ? readFileSync(hit.file, 'utf8') : '';
      const charIndex = fileText ? lineColumnToCharIndex(fileText, hit.line, hit.column) : 0;
      const byteOffset = fileText ? charIndexToByteOffset(fileText, charIndex) : undefined;
      const contextWindow = entry.contextLines && fileText
        ? fileText
            .split(/\r?\n/)
            .slice(Math.max(0, hit.line - 1 - entry.contextLines), hit.line + entry.contextLines)
            .join('\n')
        : hit.text;

      entities.push(toLaneEntity({
        type: 'entity',
        name: hit.text,
        confidence: 0.78,
        sourceKind: 'regex',
        contextWindow,
        byteOffset,
        byteLength: fileText ? Buffer.byteLength(hit.text, 'utf8') : undefined,
        tokenSpan: fileText ? {
          start: tokenIndexAt(fileText, charIndex),
          end: tokenIndexAt(fileText, charIndex + hit.text.length),
        } : undefined,
      }, fileText || text, charIndex, charIndex + hit.text.length));
    }
  }

  return entities;
}

async function loadLangExtractLaneEntities(
  text: string,
  options: ExtractionOptions,
): Promise<LaneEntity[]> {
  if (!options.useLangExtract && !options.usePyTorchLabeler && !process.env.CONDA_PREFIX) {
    return [];
  }

  try {
    const mod = await import('../nlp/miniforge-nlp-sidecar.js');
    const client = mod.createMiniforgeNlpSidecarClient();
    const health = await client.health();
    if (!health.ready) return [];

    const analysis = await client.analyze({
      text: text.slice(0, options.maxChars ?? 35_000),
      sourceType: options.sourcePath ? 'codebase' : 'plain_text',
      extractionMode: options.usePyTorchLabeler ? 'full' : 'entities',
      sourceRef: options.sourcePath,
      maxChars: options.maxChars ?? 35_000,
    });

    const entities: LaneEntity[] = [];

    for (const entity of analysis.entities) {
      const start = typeof entity.start === 'number' ? entity.start : 0;
      const end = typeof entity.end === 'number' ? entity.end : start + entity.text.length;
      entities.push(toLaneEntity({
        type: 'entity',
        name: entity.text,
        confidence: entity.confidence ?? 0.7,
        sourceKind: 'langextract',
        langExtractRelations: [],
      }, text, start, end));
    }

    for (const feature of analysis.features) {
      const sourceKind =
        feature.source === 'torch' ? 'labeler' :
        feature.source === 'ast-grep' ? 'ast_grep' :
        feature.source === 'langextract' ? 'langextract' :
        'regex';
      const confidence = feature.confidence ?? (sourceKind === 'labeler' ? 0.9 : 0.75);
      const start = feature.rawText ? text.indexOf(feature.rawText) : 0;
      entities.push(toLaneEntity({
        type: 'entity',
        name: feature.name,
        confidence,
        sourceKind,
        labelerScore: sourceKind === 'labeler' ? confidence : undefined,
        contextWindow: feature.description,
      }, text, start >= 0 ? start : 0, start >= 0 ? start + feature.name.length : undefined));
    }

    return entities;
  } catch {
    return [];
  }
}

// Main extraction function

export async function extractEntities(query: string, options: ExtractionOptions = {}): Promise<ExtractedEntity[]> {
  const slice = query.slice(0, options.maxChars ?? 35_000);
  const lanes: LaneEntity[] = [];

  lanes.push(...extractBaseEntities(slice));
  lanes.push(...await loadAstLaneEntities(slice, options));
  lanes.push(...await loadRgLaneEntities(slice, options));
  lanes.push(...await loadLangExtractLaneEntities(slice, options));

  let entities = dedupeLaneEntities(lanes);

  if (options.minConfidence !== undefined) {
    entities = entities.filter((entity) => entity.confidence >= options.minConfidence!);
  }

  return entities;
}

export async function extractQueryFeatures(query: string, options: ExtractionOptions = {}): Promise<QueryFeatures> {
  const lowerQuery = query.toLowerCase();

  // 1. Classify intent
  const intent = classifyIntent(lowerQuery);
  const intentConfidence = calculateIntentConfidence(lowerQuery, intent);

  // 2. Extract entities
  const entities = await extractEntities(query, options);

  // 3. Extract programming keywords
  const keywords = extractKeywords(lowerQuery);

  // 4. Extract top phrases
  const topPhrases = extractTopPhrases(query);

  // 5. Calculate complexity
  const isComplexQuery = query.length > 200 || entities.length > 3 || keywords.length > 5;

  return {
    intent,
    intentConfidence,
    entities,
    keywords,
    topPhrases,
    isComplexQuery,
  };
}

// Intent classification

function classifyIntent(query: string): QueryFeatures['intent'] {
  let scores = {
    debug: 0,
    refactor: 0,
    explain: 0,
    search: 0,
    general: 0,
  };

  for (const [intent, words] of Object.entries(INTENT_KEYWORDS)) {
    for (const word of words) {
      if (query.includes(word)) {
        scores[intent as keyof typeof scores]++;
      }
    }
  }

  // Find highest scoring intent
  let maxIntent: QueryFeatures['intent'] = 'general';
  let maxScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent as QueryFeatures['intent'];
    }
  }

  return maxIntent;
}

function calculateIntentConfidence(query: string, intent: QueryFeatures['intent']): number {
  if (intent === 'general') return 0.3;

  const words = INTENT_KEYWORDS[intent] || [];
  const matches = words.filter((w) => query.includes(w)).length;

  return Math.min(1.0, matches / Math.max(words.length, 3));
}

// Keyword extraction

function extractKeywords(query: string): string[] {
  const found: string[] = [];

  for (const keyword of PROGRAMMING_KEYWORDS) {
    if (query.includes(keyword)) {
      found.push(keyword);
    }
  }

  return found;
}

// Phrase extraction (simple TF approach)

function extractTopPhrases(query: string): string[] {
  // Split into words, filter stopwords, group into bigrams/trigrams
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  // Count word frequencies
  const frequencies = new Map<string, number>();

  for (let i = 0; i < words.length; i++) {
    // Unigram
    const w1 = words[i];
    frequencies.set(w1, (frequencies.get(w1) || 0) + 1);

    // Bigram
    if (i + 1 < words.length) {
      const w2 = `${w1} ${words[i + 1]}`;
      frequencies.set(w2, (frequencies.get(w2) || 0) + 1);
    }

    // Trigram
    if (i + 2 < words.length) {
      const w3 = `${w1} ${words[i + 1]} ${words[i + 2]}`;
      frequencies.set(w3, (frequencies.get(w3) || 0) + 1);
    }
  }

  // Sort by frequency and return top 10
  return Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

// Routing helper: which retrieval lanes should be active?

export function recommendActiveLanes(
  features: QueryFeatures
): {
  qdrant: boolean;
  turbovec: boolean;
  redis: boolean;
  postgres: boolean;
  neo4j: boolean;
} {
  const { intent, entities } = features;

  // All lanes are on by default; optionally disable based on intent
  return {
    qdrant: true, // Dense semantic lane (semantic_768 canonical)
    turbovec: true, // Sparse keyword / tagger lane
    redis: true, // Hot routing and cached centroids
    postgres: intent !== 'explain', // Off for "explain" (less need for FTS)
    neo4j: entities.length > 0, // On if entities found (topology useful)
  };
}
