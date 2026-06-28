/**
 * feature-label-enricher.ts — Step 5: Add LangExtract Feature Labels
 *
 * Enriches feature_id with semantic metadata via LangExtract:
 * - Domain classification (auth, retrieval, gpu, indexer, cache, etc.)
 * - Ontology type (service, utility, model, handler, adapter)
 * - Tier classification (core, middleware, feature, test)
 * - Confidence scores for each label
 *
 * Stores in Postgres JSONB: metadata.feature_labels
 *
 * Used by: ACE context assembler for query routing + ranking
 */

import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { sql } from 'drizzle-orm';

export interface FeatureLabel {
  domain: string; // 'auth', 'retrieval', 'gpu', 'cache', 'indexer', 'vector', 'api', 'ui', 'config', 'test'
  ontology: string; // 'service', 'utility', 'model', 'handler', 'adapter', 'client', 'bridge', 'manager'
  tier: string; // 'core', 'middleware', 'feature', 'test', 'internal'
  confidence: number; // 0-1, averaging across extracted labels
  extracted_from: 'langextract' | 'heuristic' | 'manual'; // source of truth
  labels: string[]; // Additional semantic tags
}

export interface FeatureLabelResult {
  packet_key: string;
  feature_id: string;
  feature_labels: FeatureLabel;
  updated_at: string;
  success: boolean;
}

// Domain classification patterns (ordered by specificity)
const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  'auth': [/auth|session|lucia|password|jwt|token|login|logout/i],
  'retrieval': [/retrieval|search|query|qdrant|vector|similarity|ranking|rerank/i],
  'gpu': [/gpu|cuda|tensor|libtorch|kernel|acceleration|inference/i],
  'cache': [/cache|redis|bifrost|centroid|bitfrost|ttl|memcache/i],
  'indexer': [/index|indexer|chunk|embedding|tokenize|qdrant_point|payload/i],
  'vector': [/embedding|vector|768|dimension|cosine|similarity/i],
  'api': [/endpoint|route|server\.ts|handler|request|response|http|fetch/i],
  'ui': [/svelte|component|page\.svelte|modal|button|form|react/i],
  'config': [/config|env|settings|schema|migrate|drizzle/i],
  'test': [/test|spec|vitest|playwright|mock|stub|fixture/i],
  'graph': [/neo4j|cypher|graph|topology|node|edge|relationship/i],
  'ai': [/gemma|ollama|llm|model|generation|chat|prompt/i],
};

// Ontology classification patterns
const ONTOLOGY_PATTERNS: Record<string, RegExp[]> = {
  'service': [/service|manager|orchestrator|coordinator/i],
  'utility': [/util|helper|converter|formatter|parser|validator/i],
  'model': [/model|type|schema|interface|entity/i],
  'handler': [/handler|processor|executor|worker|consumer/i],
  'adapter': [/adapter|bridge|client|connector|gateway/i],
  'client': [/client|sdk|wrapper|proxy/i],
  'bridge': [/bridge|wrapper|adapter|layer|interface/i],
  'manager': [/manager|pool|registry|store|cache/i],
};

// Tier classification patterns
const TIER_PATTERNS: Record<string, RegExp[]> = {
  'core': [/^src\/lib\/server\/(db|cache|queue)|^src\/routes\/api\/(health|auth)/i],
  'middleware': [/^src\/lib\/server\/(auth|middleware|hooks)/i],
  'feature': [/^src\/lib\/server\/(retrieval|indexer|ai|gpu)|^src\/routes\/(app|api)\//i],
  'test': [/\.test\.ts|\.spec\.ts|tests\//i],
  'internal': [/\/_internal\//i],
};

/**
 * Extract domain from file path and content
 */
export function extractDomain(filePath: string, sourceRef?: string, featureId?: string): { domain: string; confidence: number } {
  const fullText = `${filePath} ${sourceRef || ''} ${featureId || ''}`.toLowerCase();

  let maxConfidence = 0;
  let bestDomain = 'feature'; // default fallback

  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(fullText)) matches++;
    }

    if (matches > 0) {
      const confidence = Math.min(matches * 0.15, 0.95); // Cap at 0.95
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        bestDomain = domain;
      }
    }
  }

  return { domain: bestDomain, confidence: maxConfidence || 0.5 };
}

/**
 * Extract ontology from function/class names and patterns
 */
export function extractOntology(
  functionSymbol?: string,
  featureName?: string
): { ontology: string; confidence: number } {
  const fullText = `${functionSymbol || ''} ${featureName || ''}`.toLowerCase();

  let maxConfidence = 0;
  let bestOntology = 'utility'; // default fallback

  for (const [ontology, patterns] of Object.entries(ONTOLOGY_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(fullText)) matches++;
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

/**
 * Classify tier based on file path
 */
export function classifyTier(filePath: string): { tier: string; confidence: number } {
  for (const [tier, patterns] of Object.entries(TIER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return { tier, confidence: 0.95 };
      }
    }
  }

  // Default based on depth
  if (filePath.includes('src/lib/server/db')) return { tier: 'core', confidence: 0.8 };
  if (filePath.includes('src/lib/server')) return { tier: 'middleware', confidence: 0.7 };
  if (filePath.includes('src/routes')) return { tier: 'feature', confidence: 0.7 };

  return { tier: 'feature', confidence: 0.5 };
}

/**
 * Generate additional semantic labels based on content and path
 */
export function generateSemanticLabels(
  filePath: string,
  sourceRef?: string,
  featureId?: string
): string[] {
  const labels: string[] = [];
  const fullText = `${filePath} ${sourceRef || ''} ${featureId || ''}`.toLowerCase();

  // Pattern-based labels
  if (/postgres|drizzle|orm|schema/.test(fullText)) labels.push('database');
  if (/redis|cache|memcache/.test(fullText)) labels.push('caching');
  if (/gpu|cuda|tensor|acceleration/.test(fullText)) labels.push('gpu');
  if (/vector|embedding|qdrant/.test(fullText)) labels.push('vectors');
  if (/auth|session|lucia/.test(fullText)) labels.push('security');
  if (/test|spec|mock|fixture/.test(fullText)) labels.push('testing');
  if (/async|promise|await|callback/.test(fullText)) labels.push('async');
  if (/export|api|endpoint|route/.test(fullText)) labels.push('public-api');

  // Location-based labels
  if (filePath.includes('/server/')) labels.push('server-side');
  if (filePath.includes('/lib/')) labels.push('library');
  if (filePath.includes('/routes/api/')) labels.push('rest-api');
  if (filePath.includes('\.svelte')) labels.push('ui-component');
  if (filePath.includes('/services/')) labels.push('service-layer');
  if (filePath.includes('/machines/')) labels.push('state-machine');

  return [...new Set(labels)]; // Deduplicate
}

/**
 * Enrich a single packet with feature labels
 */
export async function enrichPacketWithLabels(
  packetKey: string,
  featureId: string,
  sourceRef?: string,
  filePath?: string,
  functionSymbol?: string
): Promise<FeatureLabel> {
  const fullPath = filePath || sourceRef || '';

  const domain = extractDomain(fullPath, sourceRef, featureId);
  const ontology = extractOntology(functionSymbol, featureId);
  const tier = classifyTier(fullPath);
  const semanticLabels = generateSemanticLabels(fullPath, sourceRef, featureId);

  const featureLabel: FeatureLabel = {
    domain: domain.domain,
    ontology: ontology.ontology,
    tier: tier.tier,
    confidence: (domain.confidence + ontology.confidence + tier.confidence) / 3,
    extracted_from: 'heuristic', // Gemma4 extraction deferred to optional phase
    labels: semanticLabels,
  };

  // Store in Postgres metadata JSONB
  try {
    await db
      .update(atlasPackets)
      .set({
        metadata: sql`jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{feature_labels}',
          ${JSON.stringify(featureLabel)}::jsonb
        )`,
        updatedAt: new Date(),
      })
      .where(sql`${atlasPackets.packetKey} = ${packetKey}`);
  } catch (err) {
    console.error(`[feature-label-enricher] Failed to update ${packetKey}:`, err);
  }

  return featureLabel;
}

/**
 * Batch enrich all packets with feature labels
 */
export async function batchEnrichPacketsWithLabels(limit: number = 10000): Promise<{
  total: number;
  success: number;
  failures: number;
  labels_by_domain: Record<string, number>;
  labels_by_tier: Record<string, number>;
  average_confidence: number;
}> {
  const results = {
    total: 0,
    success: 0,
    failures: 0,
    labels_by_domain: {} as Record<string, number>,
    labels_by_tier: {} as Record<string, number>,
    confidences: [] as number[],
  };

  try {
    // Fetch packets without feature labels
    const packets = await db
      .select()
      .from(atlasPackets)
      .where(
        sql`metadata IS NULL OR metadata->'feature_labels' IS NULL`
      )
      .limit(limit);

    results.total = packets.length;

    for (const packet of packets) {
      try {
        const featureLabel = await enrichPacketWithLabels(
          packet.packetKey,
          packet.featureId,
          packet.sourceRef,
          packet.filePath || packet.sourceRef,
          packet.functionSymbol ?? undefined
        );

        results.success++;
        results.labels_by_domain[featureLabel.domain] =
          (results.labels_by_domain[featureLabel.domain] || 0) + 1;
        results.labels_by_tier[featureLabel.tier] =
          (results.labels_by_tier[featureLabel.tier] || 0) + 1;
        results.confidences.push(featureLabel.confidence);
      } catch (err) {
        results.failures++;
        console.error(`[feature-label-enricher] Batch error for ${packet.packetKey}:`, err);
      }
    }
  } catch (err) {
    console.error('[feature-label-enricher] Batch query failed:', err);
  }

  return {
    total: results.total,
    success: results.success,
    failures: results.failures,
    labels_by_domain: results.labels_by_domain,
    labels_by_tier: results.labels_by_tier,
    average_confidence:
      results.confidences.length > 0
        ? results.confidences.reduce((a, b) => a + b, 0) / results.confidences.length
        : 0,
  };
}

/**
 * Report on feature label coverage
 */
export async function getFeatureLabelCoverage(): Promise<{
  total_packets: number;
  with_labels: number;
  coverage_percent: number;
  by_domain: Record<string, number>;
  by_tier: Record<string, number>;
  average_confidence: number;
}> {
  try {
    const [totalRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(atlasPackets)
      .where(sql`${atlasPackets.packetKey} IS NOT NULL`);

    const [labeledRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(atlasPackets)
      .where(sql`metadata->'feature_labels' IS NOT NULL`);

    const total = totalRow?.count || 0;
    const labeled = labeledRow?.count || 0;

    // Get distribution by domain
    const domainRows = await db.query.atlasPackets.findMany({
      where: sql`metadata->'feature_labels' IS NOT NULL`,
      columns: { metadata: true },
      limit: labeled > 0 ? labeled : 1,
    });

    const byDomain: Record<string, number> = {};
    const byTier: Record<string, number> = {};
    const confidences: number[] = [];

    for (const row of domainRows) {
      if (row.metadata && typeof row.metadata === 'object' && 'feature_labels' in row.metadata) {
        const labels = (row.metadata as any).feature_labels as FeatureLabel;
        if (labels) {
          byDomain[labels.domain] = (byDomain[labels.domain] || 0) + 1;
          byTier[labels.tier] = (byTier[labels.tier] || 0) + 1;
          confidences.push(labels.confidence);
        }
      }
    }

    return {
      total_packets: total,
      with_labels: labeled,
      coverage_percent: total > 0 ? (labeled / total) * 100 : 0,
      by_domain: byDomain,
      by_tier: byTier,
      average_confidence:
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0,
    };
  } catch (err) {
    console.error('[feature-label-enricher] Coverage query failed:', err);
    return {
      total_packets: 0,
      with_labels: 0,
      coverage_percent: 0,
      by_domain: {},
      by_tier: {},
      average_confidence: 0,
    };
  }
}
