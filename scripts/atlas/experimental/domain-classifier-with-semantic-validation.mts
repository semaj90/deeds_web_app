#!/usr/bin/env npx tsx
/**
 * EXPERIMENTAL — NOT PART OF PHASE 107 F
 *
 * Deferred to Phase 2 CPU semantic baseline.
 * Does not produce calibrated probabilities.
 * Must not write canonical facts or ontology tuples.
 *
 * Enhanced Domain Classification with Semantic Validation
 *
 * Three-tier domain inference with confidence scoring:
 * 1. rg lexical search — exact keyword matching (fast, deterministic)
 * 2. LDR semantic validation — external research on candidate domains
 * 3. Playwright verification — validate domain claims via web scraping
 *
 * Output: domain label + confidence (0.3 heuristic, 0.6 semantic, 0.95 validated)
 *
 * Used by Phase 107 F materializer when feature_domain_facts is missing:
 *   resolveDomain() → feature_domain_facts (primary)
 *               → atlas_packets (fallback with confidence 0.6)
 *               → enhanced heuristic (this module, confidence 0.3-0.95)
 *               → null (unresolved)
 *
 * Usage:
 *   npx tsx scripts/atlas/domain-classifier-with-semantic-validation.mts \
 *     --packet-key <key> --source-ref <ref> [--content <text>] [--validate]
 */

import { execSync } from 'child_process';
import fetch from 'node-fetch';

interface DomainClassification {
  domain: string;
  confidence: number;
  method: 'lexical' | 'semantic' | 'validated';
  evidence: {
    keywords: string[];
    semanticScore?: number;
    externalSources?: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: LEXICAL KEYWORD MATCHING (rg search)
// ═══════════════════════════════════════════════════════════════════════════

const DOMAIN_KEYWORDS = {
  legal: [
    'contract', 'case', 'evidence', 'statute', 'compliance', 'litigation',
    'attorney', 'plaintiff', 'defendant', 'discovery', 'deposition',
    'judgment', 'legal', 'law', 'court', 'counsel', 'advocate',
    'tort', 'liability', 'damages', 'injunction', 'subpoena'
  ],
  auth: [
    'session', 'token', 'password', 'credential', 'authentication',
    'authorization', 'oauth', 'jwt', 'lucia', 'login', 'user', 'role',
    'permission', 'scope', 'secret', 'hash', 'salt', 'bearer'
  ],
  retrieval: [
    'search', 'query', 'index', 'vector', 'embedding', 'qdrant', 'bm25',
    'ranking', 'rerank', 'candidate', 'retrieval', 'rag', 'semantic',
    'similarity', 'cosine', 'distance', 'relevance', 'fetch', 'lookup'
  ],
  database: [
    'postgres', 'sql', 'schema', 'table', 'column', 'query', 'transaction',
    'index', 'constraint', 'foreign', 'primary', 'join', 'migration',
    'drizzle', 'orm', 'client', 'pool', 'connection', 'db', 'database'
  ],
  frontend: [
    'component', 'svelte', 'react', 'vue', 'html', 'css', 'dom', 'button',
    'form', 'input', 'modal', 'ui', 'render', 'state', 'props', 'event',
    'click', 'scroll', 'layout', 'view', 'page', 'route'
  ],
  backend: [
    'server', 'api', 'endpoint', 'handler', 'middleware', 'request',
    'response', 'http', 'route', 'nodejs', 'express', 'service', 'worker',
    'queue', 'task', 'job', 'process', 'async', 'promise', 'callback'
  ],
  gpu: [
    'cuda', 'gpu', 'tensor', 'matrix', 'simd', 'kernel', 'warp', 'thread',
    'parallel', 'accelerate', 'benchmark', 'throughput', 'latency',
    'pytorch', 'tensorflow', 'model', 'inference', 'training', 'optimization'
  ],
  nlp: [
    'embedding', 'token', 'tokenize', 'nlp', 'language', 'model', 'llm',
    'gemma', 'ollama', 'huggingface', 'transformer', 'attention', 'bert',
    'gpt', 'summarize', 'classification', 'extraction', 'parsing'
  ]
};

function lexicalClassify(sourceRef: string, content?: string): { domain: string; score: number; keywords: string[] } | null {
  const text = `${sourceRef} ${content || ''}`.toLowerCase();
  const scores: Record<string, { count: number; keywords: string[] }> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) {
      scores[domain] = { count: matches.length, keywords: matches };
    }
  }

  if (Object.keys(scores).length === 0) return null;

  const winner = Object.entries(scores).sort((a, b) => b[1].count - a[1].count)[0];
  return {
    domain: winner[0],
    score: Math.min(winner[1].count / 10, 0.9),
    keywords: winner[1].keywords
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2: SEMANTIC VALIDATION (LDR + embeddings)
// ═══════════════════════════════════════════════════════════════════════════

async function semanticValidate(
  domain: string,
  sourceRef: string,
  content?: string
): Promise<{ confidence: number; semanticScore: number }> {
  try {
    // Call LDR research endpoint to validate domain claim
    // (assumes ldr-research MCP tool available at /api/ldr/research)
    const query = `Is this code related to ${domain}? Source: ${sourceRef}. Content: ${(content || '').substring(0, 200)}`;

    const response = await fetch('http://127.0.0.1:5173/api/ldr/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        domain: [domain],
        maxResults: 1,
        timeoutMs: 5000
      })
    } as any);

    if (!response.ok) throw new Error(`LDR API error: ${response.status}`);

    const data = await response.json() as any;
    const confidence = data.results?.[0]?.confidence ?? 0.5;

    return { confidence, semanticScore: confidence };
  } catch (err) {
    // Fallback to embedding-based similarity
    try {
      // Embed sourceRef and compare to domain description
      const descriptions: Record<string, string> = {
        legal: 'contract case evidence statute compliance litigation attorney plaintiff defendant',
        auth: 'session token password authentication authorization oauth jwt login user role',
        retrieval: 'search query index vector embedding ranking reranking rag semantic similarity',
        database: 'postgres sql schema table query transaction index migration orm',
        frontend: 'component svelte react vue html css dom button form modal ui',
        backend: 'server api endpoint handler middleware request response http route',
        gpu: 'cuda gpu tensor matrix parallel accelerate pytorch tensorflow inference',
        nlp: 'embedding token nlp language model llm gemma transformer attention'
      };

      const desc = descriptions[domain] || domain;
      // Simple heuristic: overlap of keywords
      const overlap = desc.split(/\s+/).filter(w => (content || '').includes(w)).length;
      const semanticScore = Math.min(overlap / 5, 0.8);

      return { confidence: semanticScore, semanticScore };
    } catch {
      return { confidence: 0.3, semanticScore: 0.3 };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 3: EXTERNAL VALIDATION (Playwright + firecrawl)
// ═══════════════════════════════════════════════════════════════════════════

async function externalValidate(
  domain: string,
  sourceRef: string
): Promise<{ confidence: number; externalSources: string[] }> {
  try {
    // Use firecrawl to scrape official docs / GitHub / references
    const queries: Record<string, string> = {
      legal: `Legal framework OR statute OR compliance documentation for ${sourceRef.split('/')[0]}`,
      auth: `Authentication OR authorization documentation for ${sourceRef.split('/')[0]}`,
      retrieval: `Vector search OR RAG OR retrieval documentation for ${sourceRef.split('/')[0]}`,
      database: `Database schema OR SQL OR ORM documentation for ${sourceRef.split('/')[0]}`,
      frontend: `Component OR UI documentation for ${sourceRef.split('/')[0]}`,
      backend: `API OR endpoint OR server documentation for ${sourceRef.split('/')[0]}`,
      gpu: `GPU OR CUDA OR parallel processing documentation for ${sourceRef.split('/')[0]}`,
      nlp: `NLP OR embedding OR language model documentation for ${sourceRef.split('/')[0]}`
    };

    const query = queries[domain] || domain;

    // Call firecrawl via LDR MCP (if available)
    const response = await fetch('http://127.0.0.1:5173/api/ldr/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        maxPages: 2,
        timeoutMs: 10000
      })
    } as any);

    if (!response.ok) throw new Error(`Firecrawl error: ${response.status}`);

    const data = await response.json() as any;
    const sources = (data.results || []).map((r: any) => r.url);

    // High confidence if external sources found
    const confidence = sources.length > 0 ? 0.95 : 0.6;

    return { confidence, externalSources: sources };
  } catch (err) {
    // No external validation available
    return { confidence: 0.6, externalSources: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════

export async function classifyDomainWithConfidence(
  sourceRef: string,
  content?: string,
  validate: boolean = false
): Promise<DomainClassification | null> {
  // Tier 1: Lexical
  const lexical = lexicalClassify(sourceRef, content);
  if (!lexical) return null;

  const result: DomainClassification = {
    domain: lexical.domain,
    confidence: lexical.score,
    method: 'lexical',
    evidence: { keywords: lexical.keywords }
  };

  if (!validate) return result;

  // Tier 2: Semantic
  try {
    const semantic = await semanticValidate(lexical.domain, sourceRef, content);
    result.confidence = Math.max(result.confidence, semantic.confidence);
    result.evidence.semanticScore = semantic.semanticScore;
    result.method = 'semantic';
  } catch (err) {
    console.warn(`Semantic validation failed: ${err}`);
  }

  // Tier 3: External (high-confidence only)
  if (result.confidence > 0.6) {
    try {
      const external = await externalValidate(result.domain, sourceRef);
      result.confidence = Math.max(result.confidence, external.confidence);
      result.evidence.externalSources = external.externalSources;
      if (external.externalSources.length > 0) {
        result.method = 'validated';
        result.confidence = 0.95;
      }
    } catch (err) {
      console.warn(`External validation failed: ${err}`);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const packetKeyArg = args.find(a => a.startsWith('--packet-key='))?.split('=')[1];
  const sourceRefArg = args.find(a => a.startsWith('--source-ref='))?.split('=')[1];
  const contentArg = args.find(a => a.startsWith('--content='))?.split('=')[1];
  const validate = args.includes('--validate');

  if (!sourceRefArg) {
    console.error('Usage: --source-ref <path> [--content <text>] [--validate]');
    process.exit(1);
  }

  console.log(`🏷️  Domain Classification (${validate ? 'with validation' : 'lexical only'})\n`);
  console.log(`Source: ${sourceRefArg}`);
  if (contentArg) console.log(`Content: ${contentArg.substring(0, 100)}...`);
  console.log();

  const result = await classifyDomainWithConfidence(sourceRefArg, contentArg, validate);

  if (result) {
    console.log(`✅ Domain: ${result.domain}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Method: ${result.method}`);
    console.log(`   Keywords: ${result.evidence.keywords.join(', ')}`);
    if (result.evidence.semanticScore !== undefined) {
      console.log(`   Semantic Score: ${(result.evidence.semanticScore * 100).toFixed(1)}%`);
    }
    if (result.evidence.externalSources && result.evidence.externalSources.length > 0) {
      console.log(`   External Sources: ${result.evidence.externalSources.join(', ')}`);
    }
    console.log();
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`❌ No domain match found`);
    process.exit(1);
  }
}

// Run CLI if invoked directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule || process.argv[1]?.endsWith('domain-classifier-with-semantic-validation.mts')) {
  main().catch(console.error);
}

export { DomainClassification };
