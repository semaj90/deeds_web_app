/**
 * okf-topic-ingestion.ts
 *
 * Local deep research (LDR) ingestion for OKF topics.
 * Converts research artifacts (docs, screenshots, citations) into canonical packets.
 *
 * Flow:
 *   1. Local research run (LDR or manual)
 *   2. OKF metadata (title, author, source, freshness)
 *   3. Screenshot + docs ingest
 *   4. Citation extraction
 *   5. Packetize into atlas_packets + feature_matrix_rows (offline-safe)
 *
 * Key rule: Research output never invents identity.
 *   Must resolve back to canonical packet_key or create new row via explicit flow.
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import { classifyOkfFit, OKF_FIT_VERSION } from './okf-fit.js';
import { buildHMMObservationFromOkfFit, HMMObservationSchema } from '../analysis/nlp-feature-compiler.js';
import type { FeatureMatrixRowV1 } from './feature-matrix-schema';
import { FeatureSourceManifestSchema, buildFeatureSourceManifest } from './tensors/feature-matrix-contract.js';

/**
 * OKF (Open Knowledge Format) topic metadata.
 */
export const OKFTopicMetadataSchema = z.object({
  title: z.string().min(1).max(256),
  topic_id: z.string().describe('Unique topic identifier (okf:topic:*)'),
  author: z.string().optional().nullable(),
  source: z.enum(['local_research', 'ldr', 'manual', 'firecrawl']).describe('How this topic was generated'),
  freshness: z.enum(['immediate', 'hours', 'days', 'weeks']).describe('Data freshness level'),
  offline_safe: z.boolean().default(true).describe('Can this be regenerated without internet?'),
  base_url: z.string().optional().nullable().describe('Reference URL if from web research'),
  created_at: z.string().datetime(),
  ingested_at: z.string().datetime(),
  research_notes: z.array(z.string()).optional().describe('Research process notes'),
  okf: z.lazy(() => OKFTopicAnalysisSchema).optional()
});

export type OKFTopicMetadata = z.infer<typeof OKFTopicMetadataSchema>;

export const OKFKeywordCorpusSchema = z.object({
  corpus_version: z.string().min(1),
  keywords: z.array(z.string().min(1)).max(128),
  source_terms: z.array(z.string().min(1)).max(128).default([]),
});

export type OKFKeywordCorpus = z.infer<typeof OKFKeywordCorpusSchema>;

export const OKFDomainClassificationSchema = z.object({
  primary_domain: z.string().min(1).nullable(),
  secondary_domains: z.array(z.string().min(1)).max(8),
  confidence: z.number().min(0).max(1),
  classifier_version: z.string().min(1),
  evidence_terms: z.array(z.string().min(1)).max(32).default([]),
  naive_bayes_score: z.number().min(0).max(1).default(0),
  logistic_regression_score: z.number().min(0).max(1).default(0),
  fit_margin: z.number().finite().default(0),
  fit_decision: z.enum(['ACCEPT', 'REVIEW', 'ABSTAIN']).default('ABSTAIN'),
});

export type OKFDomainClassification = z.infer<typeof OKFDomainClassificationSchema>;

export const OKFSemanticOntologySchema = z.object({
  ontology_version: z.string().min(1).nullable(),
  ontology_ids: z.array(z.string().min(1)).max(32),
  concept_ids: z.array(z.string().min(1)).max(32),
  extraction_lane: z.string().min(1),
  authority_class: z.enum(['official', 'first_party', 'generated', 'secondary']),
});

export type OKFSemanticOntology = z.infer<typeof OKFSemanticOntologySchema>;

export const OKFNlpProvenanceSchema = z.object({
  langextract_version: z.string().min(1).nullable(),
  mixedbread_model: z.string().min(1).nullable(),
  middleware: z.array(z.string().min(1)).max(16),
  source_engines: z.array(z.string().min(1)).max(16).default([]),
  hmm_observation: HMMObservationSchema.optional().nullable().default(null),
});

export type OKFNlpProvenance = z.infer<typeof OKFNlpProvenanceSchema>;

export const OKFTopicAnalysisSchema = z.object({
  keyword_corpus: OKFKeywordCorpusSchema,
  domain_classification: OKFDomainClassificationSchema,
  semantic_ontology: OKFSemanticOntologySchema,
  nlp: OKFNlpProvenanceSchema,
  feature_source_manifest: FeatureSourceManifestSchema.optional().nullable().default(null),
});

export type OKFTopicAnalysis = z.infer<typeof OKFTopicAnalysisSchema>;

/**
 * Screenshot artifact from research session.
 */
export const ResearchScreenshotSchema = z.object({
  id: z.string().uuid(),
  topic_id: z.string(),
  image_path: z.string().describe('Relative path to screenshot file'),
  image_hash: z.string().describe('SHA-256 of image'),
  caption: z.string().optional().nullable(),
  captured_at: z.string().datetime(),
  indexed: z.boolean().default(false)
});

export type ResearchScreenshot = z.infer<typeof ResearchScreenshotSchema>;

/**
 * Canonical document from research (Markdown, PDF extract, etc.).
 */
export const ResearchDocumentSchema = z.object({
  id: z.string().uuid(),
  topic_id: z.string(),
  document_key: z.string().describe('docs:topic:* naming'),
  title: z.string().min(1),
  content: z.string().describe('Full document text'),
  content_hash: z.string().describe('SHA-256 of content'),
  document_type: z.enum(['research_notes', 'transcript', 'analysis', 'definition', 'reference']),
  indexed: z.boolean().default(false),
  created_at: z.string().datetime()
});

export type ResearchDocument = z.infer<typeof ResearchDocumentSchema>;

/**
 * Citation found during research.
 */
export const ResearchCitationSchema = z.object({
  id: z.string().uuid(),
  topic_id: z.string(),
  cited_text: z.string().max(500),
  source_reference: z.string().describe('Where this was cited from (URL, filename, packet_key)'),
  confidence: z.number().min(0).max(1).default(0.8),
  citation_type: z.enum(['url', 'packet_key', 'document', 'person', 'statute', 'case']),
  captured_at: z.string().datetime()
});

export type ResearchCitation = z.infer<typeof ResearchCitationSchema>;

/**
 * Full research artifact bundle.
 */
export const ResearchArtifactBundleSchema = z.object({
  topic_metadata: OKFTopicMetadataSchema,
  documents: z.array(ResearchDocumentSchema),
  screenshots: z.array(ResearchScreenshotSchema),
  citations: z.array(ResearchCitationSchema)
});

export type ResearchArtifactBundle = z.infer<typeof ResearchArtifactBundleSchema>;

/**
 * Packetized output (maps to atlas_packets + feature_matrix_rows).
 */
export const ResearchPacketSchema = z.object({
  packet_key: z.string().describe('Generated or resolved from identity'),
  source_ref: z.string().describe('docs:okf:topic:{topic_id}'),
  file_path: z.string().optional().nullable(),
  feature_id: z.string().describe('research.okf_topics'),
  title: z.string(),
  summary: z.string().describe('Synthesized research summary'),
  okf: OKFTopicAnalysisSchema.optional(),
  research_metadata: z.object({
    topic_id: z.string(),
    source: z.string(),
    freshness: z.string(),
    offline_safe: z.boolean(),
    citation_count: z.number().int(),
    screenshot_count: z.number().int(),
    document_count: z.number().int()
  }),
  citations_resolved: z.array(
    z.object({
      text: z.string(),
      resolved_to: z.string().optional().nullable().describe('packet_key or URL'),
      confidence: z.number()
    })
  ),
  workspace_revision: z.string().default('main')
});

export type ResearchPacket = z.infer<typeof ResearchPacketSchema>;

const DEFAULT_MIXEDBREAD_MODEL = 'mixedbread-ai/mxbai-rerank-base-v2';
const DEFAULT_LANGEXTRACT_VERSION = 'langextract-v1';
const OKF_KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'into', 'are',
  'was', 'were', 'been', 'have', 'has', 'had', 'about', 'into', 'over', 'under',
  'into', 'via', 'using', 'used', 'use', 'based', 'when', 'then', 'than', 'after',
  'before', 'into', 'also', 'only', 'more', 'less', 'most', 'must', 'should',
  'would', 'could', 'will', 'can', 'may', 'not', 'all', 'any', 'one', 'two',
  'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'zero', 'and', 'or',
  'of', 'in', 'on', 'at', 'by', 'to', 'a', 'an', 'as', 'is', 'it', 'be', 'we',
  'you', 'your', 'their', 'our', 'they', 'them', 'its', 'who', 'what', 'where',
  'why', 'how', 'rtf', 'json', 'yaml', 'md', 'txt'
]);

function normalizeOkfToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_/.\-]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function extractOkfKeywords(values: Array<string | null | undefined>, limit = 24): string[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = normalizeOkfToken(String(value ?? ''));
    if (!normalized) continue;

    for (const token of normalized.split(/\s+/)) {
      if (!token || token.length < 3) continue;
      if (OKF_KEYWORD_STOPWORDS.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function slugifyConcept(value: string): string {
  return normalizeOkfToken(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

export function buildOkfTopicAnalysis(input: {
  topicId: string;
  featureId: string;
  title: string;
  query: string;
  summary: string;
  sourceTitles?: string[];
  sourceSnippets?: string[];
  sourceUrls?: string[];
  sourceEngine?: string;
  authorityClass?: 'official' | 'first_party' | 'generated' | 'secondary';
}): OKFTopicAnalysis {
  const keywords = extractOkfKeywords([
    input.featureId,
    input.title,
    input.query,
    input.summary,
    ...(input.sourceTitles ?? []),
    ...(input.sourceSnippets ?? []),
    ...(input.sourceUrls ?? []),
  ]);

  const classified = classifyOkfFit({
    topicId: input.topicId,
    featureId: input.featureId,
    title: input.title,
    query: input.query,
    summary: input.summary,
    sourceTitles: input.sourceTitles,
    sourceSnippets: input.sourceSnippets,
    sourceUrls: input.sourceUrls,
    sourceEngine: input.sourceEngine,
  });
  const primaryDomain = classified.primary_domain ?? 'general';
  const secondaryDomains = classified.secondary_domains.slice(0, 4);
  const ontologyIds = [
    `ontology:domain:${slugifyConcept(primaryDomain)}`,
    ...secondaryDomains.map((domain) => `ontology:domain:${slugifyConcept(domain)}`),
    ...keywords.slice(0, 10).map((keyword) => `ontology:keyword:${slugifyConcept(keyword)}`),
  ];
  const conceptIds = [
    `concept:feature:${slugifyConcept(input.featureId)}`,
    `concept:topic:${slugifyConcept(input.topicId)}`,
    ...keywords.slice(0, 10).map((keyword) => `concept:keyword:${slugifyConcept(keyword)}`),
  ];

  return {
    keyword_corpus: {
      corpus_version: 'keyword-corpus-v1',
      keywords,
      source_terms: [
        input.featureId,
        input.title,
        input.query,
        input.summary,
        ...(input.sourceTitles ?? []),
      ].filter((value): value is string => Boolean(value && value.trim())),
    },
    domain_classification: {
      primary_domain: classified.primary_domain,
      secondary_domains: secondaryDomains,
      confidence: classified.confidence,
      classifier_version: OKF_FIT_VERSION,
      evidence_terms: classified.evidence.map((evidence) => evidence.value).slice(0, 16),
      naive_bayes_score: classified.naive_bayes_score,
      logistic_regression_score: classified.logistic_regression_score,
      fit_margin: classified.fit_margin,
      fit_decision: classified.fit_decision,
    },
    semantic_ontology: {
      ontology_version: 'okf-ontology-v1',
      ontology_ids: Array.from(new Set(ontologyIds)),
      concept_ids: Array.from(new Set(conceptIds)),
      extraction_lane: input.sourceEngine ?? 'ldr',
      authority_class: input.authorityClass ?? 'generated',
    },
    nlp: {
      langextract_version: DEFAULT_LANGEXTRACT_VERSION,
      mixedbread_model: DEFAULT_MIXEDBREAD_MODEL,
      middleware: ['ldr', 'langextract', 'mixedbread'],
      source_engines: input.sourceEngine ? [input.sourceEngine] : ['searxng', 'wikipedia'],
      hmm_observation: buildHMMObservationFromOkfFit({
        requestId: input.topicId ?? input.title,
        packetKey: `ace:packet:research:okf:${input.topicId}`,
        sourceRef: `docs:okf:topic:${input.topicId}`,
        sourceRevision: OKF_FIT_VERSION,
        fitDecision: classified.fit_decision,
        logisticRegressionScore: classified.logistic_regression_score,
        naiveBayesScore: classified.naive_bayes_score,
        fitMargin: classified.fit_margin,
        evidenceCount: classified.evidence.length,
      }),
    },
    feature_source_manifest: buildFeatureSourceManifest({
      workspaceRevision: 'main',
      featureRevision: 'feature-matrix-5-t2-lineage-v1',
      packetKey: `ace:packet:research:okf:${input.topicId}`,
      sourceRef: `docs:okf:topic:${input.topicId}`,
    }),
  };
}

/**
 * Ingest research artifacts into canonical packets.
 *
 * Steps:
 *   1. Validate OKF metadata
 *   2. Hash documents/screenshots (lineage tracking)
 *   3. Extract and resolve citations
 *   4. Synthesize summary
 *   5. Generate packet (no inventing identity; use docs:okf:topic:{topic_id})
 */
export async function ingestResearchArtifacts(
  bundle: ResearchArtifactBundle
): Promise<{
  ok: boolean;
  packet: ResearchPacket | null;
  errors: string[];
}> {
  const errors: string[] = [];

  // Validate metadata
  try {
    OKFTopicMetadataSchema.parse(bundle.topic_metadata);
  } catch (e) {
    errors.push(`Invalid topic metadata: ${e}`);
    return { ok: false, packet: null, errors };
  }

  // Hash all content for lineage
  const documentHashes = bundle.documents.map(doc => ({
    doc_id: doc.id,
    hash: doc.content_hash
  }));

  const screenshotHashes = bundle.screenshots.map(ss => ({
    ss_id: ss.id,
    hash: ss.image_hash
  }));

  // Resolve citations
  const resolvedCitations = await resolveCitations(bundle.citations);

  // Synthesize summary (placeholder; in real flow, call Gemma4)
  const summary = synthesizeSummary(bundle);

  // Generate packet (identity from docs:okf:topic:{topic_id})
  const packetKey = `ace:packet:research:okf:${bundle.topic_metadata.topic_id}`;
  const sourceRef = `docs:okf:topic:${bundle.topic_metadata.topic_id}`;

  const packet: ResearchPacket = {
    packet_key: packetKey,
    source_ref: sourceRef,
    file_path: null,
    feature_id: 'research.okf_topics',
    title: bundle.topic_metadata.title,
    summary,
    okf: bundle.topic_metadata.okf ?? buildOkfTopicAnalysis({
      topicId: bundle.topic_metadata.topic_id,
      featureId: 'research.okf_topics',
      title: bundle.topic_metadata.title,
      query: bundle.topic_metadata.title,
      summary,
      sourceTitles: bundle.documents.map((doc) => doc.title),
      sourceSnippets: bundle.citations.map((citation) => citation.cited_text),
      sourceUrls: bundle.citations
        .filter((citation) => citation.citation_type === 'url')
        .map((citation) => citation.source_reference),
      sourceEngine: bundle.topic_metadata.source,
      authorityClass: 'generated',
    }),
    research_metadata: {
      topic_id: bundle.topic_metadata.topic_id,
      source: bundle.topic_metadata.source,
      freshness: bundle.topic_metadata.freshness,
      offline_safe: bundle.topic_metadata.offline_safe,
      citation_count: bundle.citations.length,
      screenshot_count: bundle.screenshots.length,
      document_count: bundle.documents.length
    },
    citations_resolved: resolvedCitations,
    workspace_revision: 'main'
  };

  return { ok: errors.length === 0, packet, errors };
}

/**
 * Resolve citations to canonical packet_keys or URLs.
 * Never invents identity; only resolves known references.
 */
async function resolveCitations(
  citations: ResearchCitation[]
): Promise<Array<{ text: string; resolved_to: string | null; confidence: number }>> {
  return Promise.all(
    citations.map(async (citation) => {
      let resolved_to: string | null = null;

      // If source_reference already looks like a packet_key, use it
      if (citation.source_reference.startsWith('ace:packet:')) {
        resolved_to = citation.source_reference;
      }
      // If it's a URL, keep as-is
      else if (citation.source_reference.startsWith('http')) {
        resolved_to = citation.source_reference;
      }
      // Otherwise, mark as unresolved (don't invent)
      else {
        resolved_to = null;
      }

      return {
        text: citation.cited_text,
        resolved_to,
        confidence: citation.confidence
      };
    })
  );
}

/**
 * Synthesize summary from documents + citations.
 * In production, call Gemma4; here, concatenate abstracts.
 */
function synthesizeSummary(bundle: ResearchArtifactBundle): string {
  const docs = bundle.documents
    .map(d => `**${d.title}**: ${d.content.slice(0, 300)}...`)
    .join('\n\n');

  const citations = bundle.citations
    .map(c => `- ${c.cited_text} (${c.citation_type})`)
    .slice(0, 5)
    .join('\n');

  return `# Research Summary: ${bundle.topic_metadata.title}\n\n${docs}\n\n## Key Citations:\n${citations}`;
}

/**
 * Create a feature matrix row from a research packet.
 * (Typically called after packetizing, to build dense representations.)
 */
export function createFeatureRowFromResearchPacket(
  packet: ResearchPacket
): Omit<FeatureMatrixRowV1, 'schema_version' | 'created_at' | 'updated_at'> & {
  created_at: string;
  updated_at: string;
  schema_version: string;
} {
  const laneStatus = packet.okf ? 'ACTIVE' : 'REFERENCE_ONLY';
  const evidenceState = packet.okf ? 'ACTIVE_VERIFIED' : 'GATED';
  const knowledgeResolution = packet.okf ? 'RESOLVED' : 'UNCLASSIFIED';
  return {
    schema_version: '1.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace_revision: packet.workspace_revision,
    lane_status: laneStatus,
    evidence_state: evidenceState,
    knowledge_resolution: knowledgeResolution,
    identity: {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      file_path: packet.file_path ?? '',
      function_symbol: null,
      feature_id: packet.feature_id,
      title_id: packet.title,
      tree_node_id: null
    },
    dense_768: null,
    dense_384: null,
    latent_64: null,
    lexical: {
      method: 'bm25' as const,
      term_count: packet.summary.split(/\s+/).length,
      part_of_speech: null,
      top_terms: extractTopTerms(packet.summary, 10),
      computed_at: new Date().toISOString()
    },
    topology: {
      pagerank_score: null,
      som_cell_row: null,
      som_cell_col: null,
      som_index: null,
      som_distance_to_centroid: null,
      hilbert_order: null,
      neighbors_k_hop: [],
      computed_at: new Date().toISOString()
    },
      classifiers: packet.okf
      ? {
          naive_bayes_class: packet.okf.domain_classification.primary_domain ?? null,
          naive_bayes_score: packet.okf.domain_classification.naive_bayes_score ?? null,
          logistic_regression_score: packet.okf.domain_classification.logistic_regression_score ?? null,
          xgboost_score: null,
          computed_at: new Date().toISOString(),
        }
      : null,
    is_valid: true,
    validation_errors: [],
    feature_labels: [
      'research',
      'okf',
      'offline_safe',
      ...(packet.okf?.keyword_corpus.keywords ?? []),
      ...(packet.okf?.semantic_ontology.concept_ids ?? []),
      ...(packet.okf?.semantic_ontology.ontology_ids ?? []),
    ],
    domain_class: packet.okf?.domain_classification.primary_domain ?? null,
    secondary_domains: packet.okf?.domain_classification.secondary_domains ?? [],
    ontology_ids: packet.okf?.semantic_ontology.ontology_ids ?? [],
    concept_ids: packet.okf?.semantic_ontology.concept_ids ?? [],
    runtime_evidence_refs: packet.citations_resolved.map((citation) => citation.resolved_to ?? citation.text),
    test_evidence_refs: [],
  };
}

/**
 * Extract top terms from text (simple lexical fallback).
 *
 * This is intentionally lightweight until the sidecar grows a real
 * corpus-level TF-IDF/embedding index. It still returns a deterministic,
 * ranked term list rather than a mocked placeholder.
 */
function extractTopTerms(text: string, limit: number): Array<[string, number]> {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  if (words.length === 0 || limit <= 0) return [];
  const freq = new Map<string, number>();

  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => [term, count / words.length]);
}

/**
 * Validation gate: Check that packet identity is fully resolved (no missing fields).
 */
export function validatePacketIdentity(packet: ResearchPacket): boolean {
  return !!(
    packet.packet_key &&
    packet.source_ref &&
    packet.feature_id &&
    packet.title &&
    packet.summary
  );
}

/**
 * Schema for serializing ingestion result to JSON (for durable storage).
 */
export const IngestionResultSchema = z.object({
  topic_id: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  packet: ResearchPacketSchema.optional().nullable(),
  errors: z.array(z.string()),
  timestamp: z.string().datetime()
});

export type IngestionResult = z.infer<typeof IngestionResultSchema>;
