/**
 * src/lib/server/ai/feature-extraction.ts
 *
 * LangExtract: Query feature extraction for intelligent routing + retrieval optimization
 *
 * Extracts from user query:
 * - Intent: 'debug' | 'refactor' | 'explain' | 'search' | 'general'
 * - Entities: classes, functions, files, variables, errors
 * - Keywords: programming concepts matched against codebase schema
 * - Phrases: top 10 key phrases for semantic search
 *
 * Used by parallel-orchestrator to decide which retrieval lanes to activate
 * and how to weight results.
 */

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
  type: 'class' | 'function' | 'file' | 'variable' | 'error';
  name: string;
  confidence: number; // 0-1
}

// Main extraction function

export function extractQueryFeatures(query: string): QueryFeatures {
  const lowerQuery = query.toLowerCase();

  // 1. Classify intent
  const intent = classifyIntent(lowerQuery);
  const intentConfidence = calculateIntentConfidence(lowerQuery, intent);

  // 2. Extract entities
  const entities = extractEntities(query);

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

// Entity extraction

function extractEntities(query: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Classes/interfaces (PascalCase)
  const classMatches = query.match(ENTITY_PATTERNS.classOrInterface) || [];
  for (const match of classMatches) {
    if (/^[A-Z]/.test(match)) {
      entities.push({
        type: 'class',
        name: match,
        confidence: 0.8,
      });
    }
  }

  // Functions (camelCase + parens)
  const funcMatches = query.match(ENTITY_PATTERNS.functionOrMethod) || [];
  for (const match of funcMatches) {
    const name = match.replace(/\s*\($/, '');
    if (name.length > 0) {
      entities.push({
        type: 'function',
        name,
        confidence: 0.85,
      });
    }
  }

  // File paths
  const fileMatches = query.match(ENTITY_PATTERNS.filePath) || [];
  for (const match of fileMatches) {
    entities.push({
      type: 'file',
      name: match,
      confidence: 0.9,
    });
  }

  // Error messages
  const errorMatches = query.match(ENTITY_PATTERNS.error) || [];
  for (const match of errorMatches) {
    entities.push({
      type: 'error',
      name: match,
      confidence: 0.75,
    });
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return entities.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });
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
    qdrant: true, // Always on: dense semantic
    turbovec: true, // Always on: sparse keyword matching
    redis: true, // Always on: cached centroids
    postgres: intent !== 'explain', // Off for "explain" (less need for FTS)
    neo4j: entities.length > 0, // On if entities found (topology useful)
  };
}
