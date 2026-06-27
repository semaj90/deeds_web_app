/**
 * Summary Enrichment Pipeline (P1-E)
 *
 * Three stages:
 * 1. Detect bad summaries (thought leakage, placeholder content)
 * 2. Skip summaries matching content_hash (idempotent)
 * 3. Regenerate summaries via Gemma4 + embed via EmbeddingGemma
 *
 * Use cases:
 * - Backfill missing summaries in codebase_chunk_index (40k+ chunks)
 * - Improve summary quality for weak chunks
 * - Add feature labels and domain classification
 */

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type Redis from 'ioredis';

// ── Content Hash Utilities ──────────────────────────────────────────────────

/**
 * Generate SHA-256 hash of content (first 16 chars).
 * Used to skip regenerating summaries for identical content.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Detect thought leakage in summary text.
 * Returns true if summary contains internal reasoning markers.
 *
 * Markers:
 * - "I think", "I believe", "according to me"
 * - "let me", "I need to", "I should"
 * - "think" or "thought" in first sentence
 * - Placeholder: "TODO", "FIXME", "placeholder"
 */
export function detectThoughtLeakage(summary: string): boolean {
  if (!summary) return false;

  const leakagePatterns = [
    /\bi\s+(think|believe|want|need|should|suppose)/i,
    /\b(let\s+me|according\s+to\s+me|as\s+far\s+as\s+i|in\s+my\s+opinion)/i,
    /\b(todo|fixme|placeholder|xxx|hack|stub)\b/i,
    /\b(according\s+to|i\s+believe|i\s+think)/i,
  ];

  return leakagePatterns.some((pattern) => pattern.test(summary));
}

/**
 * Detect placeholder/low-quality summaries.
 * Returns true if summary is too short, generic, or low-signal.
 */
export function detectPlaceholder(summary: string): boolean {
  if (!summary) return true;

  // Too short
  if (summary.length < 20) return true;

  // All same character repeated
  if (/^(.)\1{5,}$/.test(summary)) return true;

  // Generic phrases only
  const generic = [
    'function',
    'class',
    'type',
    'interface',
    'module',
    'file',
    'code',
  ];
  const lowerSummary = summary.toLowerCase();
  if (generic.every((g) => !lowerSummary.includes(g))) {
    // No content-specific terms
    if (summary.split(' ').length < 5) return true;
  }

  return false;
}

// ── Summary Quality Interface ──────────────────────────────────────────────────

export interface SummaryQualityScore {
  packetKey: string;
  summary: string | null;
  contentHash: string;
  quality: 'good' | 'bad' | 'missing' | 'placeholder';
  hasThoughtLeakage: boolean;
  isPlaceholder: boolean;
  reason: string;
}

/**
 * Audit summary quality for a packet.
 * Used to identify which summaries need regeneration.
 */
export function auditSummaryQuality(
  packetKey: string,
  summary: string | null
): SummaryQualityScore {
  const hash = contentHash(summary ?? '');

  // Missing
  if (!summary) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'missing',
      hasThoughtLeakage: false,
      isPlaceholder: true,
      reason: 'Summary is null/empty',
    };
  }

  // Detect thought leakage
  const hasThoughtLeakage = detectThoughtLeakage(summary);
  if (hasThoughtLeakage) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'bad',
      hasThoughtLeakage: true,
      isPlaceholder: false,
      reason: 'Thought leakage detected (internal reasoning markers)',
    };
  }

  // Detect placeholder
  const isPlaceholder = detectPlaceholder(summary);
  if (isPlaceholder) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'placeholder',
      hasThoughtLeakage: false,
      isPlaceholder: true,
      reason: 'Placeholder or low-quality summary detected',
    };
  }

  // Good
  return {
    packetKey,
    summary,
    contentHash: hash,
    quality: 'good',
    hasThoughtLeakage: false,
    isPlaceholder: false,
    reason: 'Summary passes quality checks',
  };
}

// ── Skip Detection (Idempotency) ──────────────────────────────────────────────

export interface SkipReason {
  skip: boolean;
  reason: string;
  cachedContentHash?: string;
}

/**
 * Check if a packet's summary should be skipped (already regenerated).
 * Uses content_hash in Postgres to prevent re-processing identical content.
 */
export async function shouldSkipSummaryRegeneration(
  db: Pool,
  packetKey: string,
  currentContentHash: string
): Promise<SkipReason> {
  try {
    const result = await db.query(
      `
      SELECT content_hash, summary_generated_at
      FROM atlas_packets
      WHERE packet_key = $1
      `,
      [packetKey]
    );

    if (!result.rows.length) {
      return { skip: false, reason: 'Packet not found in Postgres' };
    }

    const row = result.rows[0];
    const cachedHash = row.content_hash;

    if (!cachedHash) {
      return { skip: false, reason: 'No content_hash recorded yet' };
    }

    if (cachedHash === currentContentHash) {
      return {
        skip: true,
        reason: `Content unchanged (hash: ${cachedHash})`,
        cachedContentHash: cachedHash,
      };
    }

    return { skip: false, reason: 'Content changed, regeneration needed' };
  } catch (err) {
    console.warn('[Summary Enrichment] Skip check failed:', err);
    return { skip: false, reason: 'Database check failed, proceed with regeneration' };
  }
}

// ── Summary Audit Interface ──────────────────────────────────────────────────

export interface SummaryAuditResult {
  totalPackets: number;
  goodSummaries: number;
  badSummaries: number;
  missingRequested: number;
  placeholderDetected: number;
  needsRegeneration: number;
  topThoughtLeaks: Array<{ packetKey: string; summary: string }>;
}

/**
 * Audit all packets for summary quality.
 * Returns breakdown of good/bad/missing summaries.
 */
export async function auditAllSummaries(
  db: Pool,
  limit?: number
): Promise<SummaryAuditResult> {
  const query = limit
    ? `SELECT packet_key, summary FROM atlas_packets LIMIT $1`
    : `SELECT packet_key, summary FROM atlas_packets`;

  const params = limit ? [limit] : [];

  try {
    const result = await db.query(query, params);
    const audits = result.rows.map((row) =>
      auditSummaryQuality(row.packet_key, row.summary)
    );

    const good = audits.filter((a) => a.quality === 'good').length;
    const bad = audits.filter((a) => a.quality === 'bad').length;
    const missing = audits.filter((a) => a.quality === 'missing').length;
    const placeholder = audits.filter((a) => a.quality === 'placeholder').length;
    const needsRegen = bad + missing + placeholder;

    const thoughtLeaks = audits
      .filter((a) => a.hasThoughtLeakage)
      .slice(0, 10)
      .map((a) => ({
        packetKey: a.packetKey,
        summary: a.summary ?? '',
      }));

    return {
      totalPackets: result.rows.length,
      goodSummaries: good,
      badSummaries: bad,
      missingRequested: missing,
      placeholderDetected: placeholder,
      needsRegeneration: needsRegen,
      topThoughtLeaks: thoughtLeaks,
    };
  } catch (err) {
    console.error('[Summary Enrichment] Audit failed:', err);
    throw err;
  }
}

// ── Feature Label Extraction ───────────────────────────────────────────────────

export interface FeatureLabel {
  featureId: string;
  domain: string;
  ontology: string[];
  taskType: 'validation' | 'refactor' | 'analysis' | 'patch_proposal' | 'other';
}

/**
 * Extract feature labels from summary + source_ref using keyword patterns.
 * Assigns domain and ontology classification.
 */
export function extractFeatureLabels(
  summary: string,
  sourceRef: string
): Partial<FeatureLabel> {
  const lowerSummary = summary.toLowerCase();
  const lowerRef = sourceRef.toLowerCase();

  // Task type inference
  let taskType: FeatureLabel['taskType'] = 'other';
  if (
    lowerSummary.includes('validate') ||
    lowerSummary.includes('check') ||
    lowerRef.includes('test')
  ) {
    taskType = 'validation';
  } else if (lowerSummary.includes('refactor') || lowerSummary.includes('rewrite')) {
    taskType = 'refactor';
  } else if (lowerSummary.includes('analyze') || lowerSummary.includes('analysis')) {
    taskType = 'analysis';
  } else if (lowerSummary.includes('fix') || lowerSummary.includes('patch')) {
    taskType = 'patch_proposal';
  }

  // Domain inference
  let domain = 'general';
  const domainKeywords = {
    gpu_acceleration: ['gpu', 'cuda', 'libtorch', 'rerank', 'performance'],
    codebase_analysis: ['codebase', 'import', 'dependency', 'structure'],
    validation: ['validate', 'check', 'gan', 'audit'],
    retrieval: ['search', 'query', 'retrieval', 'qdrant'],
    authentication: ['auth', 'session', 'lucia', 'token'],
  };

  for (const [d, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some((kw) => lowerSummary.includes(kw) || lowerRef.includes(kw))) {
      domain = d;
      break;
    }
  }

  // Ontology tags (array of keywords found in summary)
  const ontology: string[] = [];
  const allKeywords = [
    'gpu',
    'cuda',
    'vector',
    'search',
    'auth',
    'validation',
    'caching',
    'api',
    'route',
    'schema',
  ];

  for (const kw of allKeywords) {
    if (lowerSummary.includes(kw) || lowerRef.includes(kw)) {
      ontology.push(kw);
    }
  }

  return { domain, taskType, ontology };
}

// ── Export Summary ──────────────────────────────────────────────────────────

export const summaryEnrichment = {
  contentHash,
  detectThoughtLeakage,
  detectPlaceholder,
  auditSummaryQuality,
  shouldSkipSummaryRegeneration,
  auditAllSummaries,
  extractFeatureLabels,
};
