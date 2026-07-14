/**
 * Promotion Enrichment Service
 *
 * Applies semantic enrichment (domain classification, title generation) to canonical packets
 * during the promotion phase (async, non-blocking).
 *
 * Called AFTER reranking, BEFORE writing to atlas_packets.
 * Ensures packets are immutable after this step.
 *
 * Workflow:
 *   1. Load FeatureEnvelope from retrieval pipeline
 *   2. Classify domain (keyword-based, 10 domains)
 *   3. Generate title_id (deterministic, stable per packet_key)
 *   4. Validate 4 enrichment gates
 *   5. Persist to atlas_packets (transactional)
 *   6. Emit events for mirror sync (async, non-blocking)
 */

import type { FeatureEnvelope } from './feature-envelope.js';
import { generateTitleIdentity, TITLE_GENERATOR_VERSION as TITLE_GENERATOR_VERSION_IMPORTED } from './title-id-generator.js';
import type { PacketSemanticEnrichment } from './packet-io.js';

export const TITLE_GENERATOR_VERSION = TITLE_GENERATOR_VERSION_IMPORTED;

/**
 * Domain classifier (keyword-based, 10 domains)
 * Extracted from src/lib/server/classifier/domain-classifier.ts
 */
function classifyDomain(text: string): string {
  const domains: Record<string, string[]> = {
    auth: ['auth', 'session', 'login', 'password', 'jwt', 'oauth', 'credential', 'verification'],
    ui: ['component', 'button', 'form', 'input', 'render', 'display', 'visual', 'interface'],
    retrieval: ['search', 'query', 'retrieve', 'find', 'index', 'lookup', 'match', 'result'],
    network: ['http', 'request', 'response', 'api', 'endpoint', 'socket', 'connection', 'client'],
    database: ['database', 'query', 'table', 'schema', 'migration', 'index', 'sql', 'orm'],
    cache: ['cache', 'redis', 'memcache', 'ttl', 'expire', 'invalidate', 'store', 'retrieve'],
    agent: ['agent', 'tool', 'action', 'orchestrate', 'dispatch', 'handler', 'processor', 'worker'],
    graph: ['graph', 'node', 'edge', 'topology', 'relationship', 'path', 'traversal', 'neighbor'],
    ml: ['model', 'tensor', 'vector', 'embedding', 'neural', 'inference', 'training', 'weight'],
    general: [],
  };

  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(domains)) {
    scores[domain] = keywords.filter(kw => lowerText.includes(kw)).length;
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    return 'general';
  }

  return Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] || 'general';
}

/**
 * Enrichment validation gates
 *
 * Hard fail conditions (return false if any gate fails):
 *   1. Identity gate: packet_key must exist
 *   2. Structure gate: source_ref or feature_id must exist
 *   3. Title gate: title_id generation must succeed
 *   4. Consistency gate: domain_class must be valid (one of 10 domains)
 */
interface EnrichmentValidation {
  valid: boolean;
  gate?: string; // Which gate failed (if valid === false)
  errors: string[];
}

function validateEnrichment(
  envelope: FeatureEnvelope,
  enrichment: PacketSemanticEnrichment
): EnrichmentValidation {
  const errors: string[] = [];

  // Gate 1: Identity gate
  if (!envelope.packet_key) {
    errors.push('Gate 1: packet_key missing');
  }

  // Gate 2: Structure gate
  if (!envelope.source_ref && !envelope.feature_id) {
    errors.push('Gate 2: source_ref and feature_id both missing');
  }

  // Gate 3: Title gate
  if (!enrichment.titleId) {
    errors.push('Gate 3: title_id not generated');
  }

  // Gate 4: Consistency gate
  const validDomains = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'];
  if (enrichment.domainClass && !validDomains.includes(enrichment.domainClass)) {
    errors.push(`Gate 4: domain_class '${enrichment.domainClass}' not in valid set`);
  }

  return {
    valid: errors.length === 0,
    errors,
    gate: errors[0]?.split(':')[0],
  };
}

/**
 * Enrich a FeatureEnvelope with semantic metadata
 *
 * Non-blocking: if enrichment fails, returns original envelope with errors logged
 * Caller should decide whether to promote or discard
 */
export function enrichPacketSemantics(envelope: FeatureEnvelope): FeatureEnvelope & {
  _enrichment: PacketSemanticEnrichment;
  _enrichmentValid: boolean;
} {
  const enrichment: PacketSemanticEnrichment = {};

  // Domain classification
  const textSource = envelope.summary || envelope.content || envelope.source_ref || '';
  enrichment.domainClass = classifyDomain(textSource);

  // Title generation
  if (envelope.packet_key) {
    const generated = generateTitleIdentity(envelope.packet_key, {
      featureLabel: envelope.feature_id,
      symbolName: undefined, // Would come from AST signal, if available
      symbolKind: undefined,
      domain: enrichment.domainClass,
      sourceFilename: envelope.source_ref,
      summary: envelope.summary, // Last resort only
    });

    enrichment.semanticTitle = generated.title;
    enrichment.titleId = generated.titleId;
    enrichment.titleGeneratorVersion = generated.generatorVersion;
  }

  // Validate enrichment
  const validation = validateEnrichment(envelope, enrichment);

  if (!validation.valid) {
    console.warn(`Enrichment validation failed (gate: ${validation.gate}):`, validation.errors);
  }

  return {
    ...envelope,
    _enrichment: enrichment,
    _enrichmentValid: validation.valid,
  };
}

/**
 * Batch enrich multiple packets
 */
export function enrichPacketBatch(envelopes: FeatureEnvelope[]): Array<
  FeatureEnvelope & {
    _enrichment: PacketSemanticEnrichment;
    _enrichmentValid: boolean;
  }
> {
  return envelopes.map(envelope => enrichPacketSemantics(envelope));
}

/**
 * Extract enrichment data for Postgres persistence
 *
 * Called before writing to atlas_packets to extract only the fields we need
 */
export interface PacketAtlasWrite {
  packet_key: string;
  domain_class: string;
  title_id: string;
  title_generator_version: string;
}

export function extractAtlasWriteData(enriched: ReturnType<typeof enrichPacketSemantics>): Partial<PacketAtlasWrite> {
  return {
    packet_key: enriched.packet_key,
    domain_class: enriched._enrichment.domainClass,
    title_id: enriched._enrichment.titleId,
    title_generator_version: enriched._enrichment.titleGeneratorVersion,
  };
}
