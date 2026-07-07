/**
 * Ontology Extractor
 * Deterministic extraction of PacketOntology tuples from AST + metadata
 *
 * Workers (RabbitMQ):
 * - extract-tuples: AST walk → node_type, symbol, calls[], parameters[]
 * - keywords: TF-IDF + domain lexicon
 * - api-signatures: Route reflection + OpenAPI extraction
 * - parameter-index: Build feature_id → [packets using it]
 */

import { z } from 'zod';
import { PacketOntologySchema, type PacketOntology, type NodeType } from './packet-ontology.schema.js';

/**
 * Extract node type from code token and context
 */
export function inferNodeType(
  symbol: string,
  fileExt: string,
  context: {
    isRoute?: boolean;
    isTest?: boolean;
    isQuery?: boolean;
    isAPI?: boolean;
    isConfig?: boolean;
  }
): NodeType {
  // Route handlers
  if (context.isRoute) return 'ROUTE';

  // Test files
  if (context.isTest) return 'TEST';

  // Config files
  if (context.isConfig) return 'CONFIG';

  // SQL
  if (context.isQuery || fileExt === '.sql') return 'SQL';

  // File-level if no more context
  if (symbol.includes('/')) return 'FILE';

  // Default: infer from naming patterns
  if (symbol.match(/^[A-Z][a-zA-Z]*$/)) return 'CLASS';
  if (symbol.match(/^use[A-Z]/)) return 'FEATURE';
  if (symbol.match(/^[a-z_]+$/)) return 'FUNCTION';

  return 'ENTITY';
}

/**
 * Extract keywords via TF-IDF + domain lexicon
 */
const DOMAIN_KEYWORDS = new Set([
  // Auth
  'auth', 'session', 'identity', 'token', 'password', 'login', 'logout',
  // Cache
  'cache', 'redis', 'valkey', 'bitmap', 'ttl', 'expire',
  // Retrieval
  'search', 'query', 'ranking', 'similarity', 'embedding', 'vector',
  // Database
  'postgres', 'sql', 'migration', 'schema', 'index', 'transaction',
  // Graph
  'neo4j', 'graph', 'node', 'edge', 'cypher', 'topology',
  // MCP
  'mcp', 'tool', 'rpc', 'grpc', 'protocol',
  // Async
  'queue', 'worker', 'rabbitmq', 'event', 'subscribe', 'publish',
  // Storage
  'seaweedfs', 'blob', 'object', 'file', 's3',
  // Vector
  'qdrant', 'embedding', 'similarity', 'cosine', 'hnsw',
  // ML
  'gemma', 'ollama', 'inference', 'model', 'completion',
]);

export function extractKeywords(text: string, topK: number = 10): string[] {
  const normalized = text.toLowerCase();
  const matches: { keyword: string; score: number }[] = [];

  for (const keyword of DOMAIN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const count = (normalized.match(regex) || []).length;
    if (count > 0) {
      matches.push({ keyword, score: count });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(m => m.keyword);
}

/**
 * Extract function/method parameters from signature
 */
export function extractParameters(signature: string): PacketOntology['parameters'] {
  // Simple regex parser (real implementation uses TypeScript AST)
  const paramRegex = /(\w+)\s*:\s*(\w+(?:\[\])?)/g;
  const params: PacketOntology['parameters'] = [];

  let match;
  while ((match = paramRegex.exec(signature)) !== null) {
    params.push({
      name: match[1],
      type: match[2],
      required: !signature.includes(`${match[1]}?`),
    });
  }

  return params;
}

/**
 * Build PacketOntology from extracted metadata
 */
export async function buildOntology(input: {
  packet_key: string;
  symbol: string;
  file_path: string;
  node_type: NodeType;
  extracted_by: 'ast-grep' | 'langextract' | 'manual' | 'test';
  calls?: string[];
  imports?: string[];
  parameters?: PacketOntology['parameters'];
  returns?: PacketOntology['returns'];
  keywords?: string[];
  title?: string;
  summary?: string;
}): Promise<PacketOntology> {
  // Validate and return
  return PacketOntologySchema.parse({
    packet_key: input.packet_key,
    node_type: input.node_type,
    symbol: input.symbol,
    calls: input.calls || [],
    imports: input.imports || [],
    parameters: input.parameters || [],
    returns: input.returns,
    keywords: input.keywords || extractKeywords(`${input.symbol} ${input.title || ''}`),
    title: input.title,
    summary: input.summary,
    extracted_by: input.extracted_by,
    extracted_at: new Date().toISOString(),
    confidence: input.summary ? 0.95 : 0.75,
  });
}

/**
 * Validate ontology tuple against schema
 */
export function validateOntology(data: unknown): PacketOntology {
  return PacketOntologySchema.parse(data);
}

/**
 * Format ontology for Qdrant payload (named vectors)
 */
export function formatForQdrant(ontology: PacketOntology) {
  return {
    node_type: ontology.node_type,
    symbol: ontology.symbol,
    belongs_to: ontology.belongs_to,
    keywords: ontology.keywords,
    title: ontology.title,
    summary: ontology.summary,
    calls: ontology.calls,
    imports: ontology.imports,
    confidence: ontology.confidence,
  };
}
