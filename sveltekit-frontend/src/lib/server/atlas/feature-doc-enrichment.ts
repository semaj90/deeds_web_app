import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { tracedQuery } from '$lib/server/db/client.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';
import { CLASSIFIER_VERSION } from '$lib/server/enrichment/domain-classifier.js';
import { buildIndexedSourcePacket } from '$lib/server/ace/indexed-source-packet.js';
import {
  OntologyLinkedTupleV1Schema,
  buildOntologyLinkedTuplesFromFeatureRow,
  type OntologyLinkedTupleV1,
} from './contracts/ontology-linked-tuple-v1.js';
import {
  EnrichedTreeNodeSchema,
  materializeLinkedTupleDraftsFromEnrichedTreeNode,
} from './enriched-tree-node-contract.js';
import { selectFeatureScopedRows } from './feature-scope-query.js';
import {
  FeatureDocumentManifestSchema,
  getFeatureDocumentEvidence,
  type FeatureDocumentEvidence,
} from './feature-document-evidence.js';

export const FeatureEvidenceStateSchema = z.enum([
  'ACTIVE_VERIFIED',
  'ACTIVE_DEGRADED',
  'GATED',
  'REFERENCE_ONLY',
  'SUPERSEDED',
  'FAILED',
]);

export const FeatureDocSourceCandidateSchema = z.object({
  sourceRef: z.string().min(1),
  sourceType: z.enum([
    'official_doc',
    'local_file',
    'library_document',
    'legal_chunk',
    'code_source',
    'screenshot',
    'api_schema',
    'runtime_report',
  ]),
  canonicalUrl: z.string().url().optional(),
  localPath: z.string().min(1).optional(),
  contentHash: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  authorityClass: z.enum(['official', 'first_party', 'repository', 'secondary', 'generated', 'unknown']),
  accepted: z.boolean(),
  rejectionReason: z.string().min(1).optional(),
});

export const FeatureDocEnrichmentPlanSchema = z.object({
  schemaVersion: z.literal('feature-doc-enrichment.v1'),
  featureId: z.string().min(1),
  manifestPath: z.string().min(1),
  manifestContentHash: z.string().min(1),
  evidenceState: FeatureEvidenceStateSchema,
  sourceCandidates: z.array(FeatureDocSourceCandidateSchema).max(64),
  extractionPlan: z.object({
    treeSitter: z.boolean(),
    astGrep: z.boolean(),
    lexicalFeatures: z.boolean(),
    entities: z.boolean(),
    screenshots: z.boolean(),
    apiSchemas: z.boolean(),
  }),
  retrievalPlan: z.object({
    lexical: z.boolean(),
    dense: z.boolean(),
    centroidPrefilter: z.boolean(),
    graphExpansion: z.boolean(),
    maxCandidates: z.number().int().positive().max(256),
    maxPacketCount: z.number().int().positive().max(128),
    maxContextTokens: z.number().int().positive().max(32768),
  }),
  storagePlan: z.object({
    postgres: z.boolean(),
    qdrant: z.boolean(),
    redisValkey: z.boolean(),
    seaweedfs: z.boolean(),
    neo4jProjection: z.boolean(),
  }),
  classifierPlan: z.object({
    rules: z.boolean(),
    naiveBayes: z.boolean(),
    logisticRegression: z.boolean(),
    neuralReranker: z.boolean(),
    classifierVersion: z.string().min(1).optional(),
  }),
  modelPlan: z.object({
    embeddingModel: z.string().min(1),
    summarizerModel: z.string().min(1),
    summarizerEndpoint: z.string().min(1),
    qloraAdapter: z.string().min(1).optional(),
  }),
  warnings: z.array(z.string()).max(64),
  nextCommands: z.array(z.string()).max(16),
});

export type FeatureDocEnrichmentPlan = z.infer<typeof FeatureDocEnrichmentPlanSchema>;

export const FeatureEvidenceTupleSchema = z.object({
  tupleId: z.string().min(1),
  schemaVersion: z.literal('feature-evidence-tuple.v1'),
  featureId: z.string().min(1),
  sourceRef: z.string().min(1),
  packetKey: z.string().min(1).optional(),
  treeNodeId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  qdrantPointId: z.string().min(1).optional(),
  domainClass: z.string().min(1).optional(),
  ontologyIds: z.array(z.string().min(1)).max(32),
  conceptIds: z.array(z.string().min(1)).max(32),
  astSymbols: z.array(z.string().min(1)).max(64),
  lexicalFeatures: z.array(z.string().min(1)).max(64),
  ontologyLinkedTuples: z.array(OntologyLinkedTupleV1Schema).max(64).default([]),
  entities: z.array(
    z.object({
      type: z.string().min(1),
      value: z.string().min(1),
    })
  ).max(32),
  evidenceState: FeatureEvidenceStateSchema,
  provenance: z.object({
    sourceTables: z.array(z.string().min(1)).max(12),
    classifierVersion: z.string().min(1).nullable(),
    lexicalExtractorVersion: z.string().min(1).nullable(),
    structuralParserVersion: z.string().min(1).nullable(),
    ontologyExtractorVersion: z.string().min(1).nullable(),
  }),
});

export type FeatureEvidenceTuple = z.infer<typeof FeatureEvidenceTupleSchema>;
export type OntologyLinkedTuple = OntologyLinkedTupleV1;

export interface BuildFeatureDocEnrichmentPlanResult {
  evidence: FeatureDocumentEvidence;
  plan: FeatureDocEnrichmentPlan;
}

export interface MaterializeFeatureEvidenceTuplesResult extends BuildFeatureDocEnrichmentPlanResult {
  tuples: FeatureEvidenceTuple[];
}

interface LinkedAtlasSourceRow {
  source_ref: string | null;
  packet_key: string | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  document_id: string | null;
}

interface AtlasPacketRow {
  source_ref: string | null;
  packet_key: string | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  document_id: string | null;
  domain_class: string | null;
  source_hash: string | null;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function loadManifestOkf(manifestPath: string | null) {
  if (!manifestPath) return null;

  try {
    const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = FeatureDocumentManifestSchema.parse(JSON.parse(manifestRaw));
    return manifest.okf ?? null;
  } catch {
    return null;
  }
}

function uniqueStable<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function toEvidenceState(evidence: FeatureDocumentEvidence): z.infer<typeof FeatureEvidenceStateSchema> {
  if (evidence.status === 'MANIFEST_INVALID') return 'FAILED';
  if (evidence.status === 'DOCS_PENDING') return 'GATED';
  if (evidence.status === 'NOTE_ONLY') return 'REFERENCE_ONLY';
  if (evidence.warnings.length > 0) return 'ACTIVE_DEGRADED';
  return 'ACTIVE_VERIFIED';
}

function mapArtifactCandidate(
  artifact: FeatureDocumentEvidence['artifacts'][number]
): z.infer<typeof FeatureDocSourceCandidateSchema> | null {
  if (artifact.kind === 'official_doc' && artifact.url) {
    const validation = validateExternalUrl(artifact.url);
    return {
      sourceRef: artifact.url,
      sourceType: 'official_doc',
      canonicalUrl: artifact.url,
      title: artifact.title,
      authorityClass:
        artifact.trustTier === 'official_or_primary'
          ? 'official'
          : artifact.trustTier === 'trusted_community'
            ? 'secondary'
            : 'unknown',
      accepted: validation.valid,
      rejectionReason: validation.valid ? undefined : validation.error ?? 'invalid_url',
    };
  }

  if (!artifact.path) return null;
  const lower = artifact.path.toLowerCase();
  return {
    sourceRef: artifact.path,
    sourceType:
      artifact.kind === 'screenshot'
        ? 'screenshot'
        : lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml')
          ? 'api_schema'
          : 'local_file',
    localPath: artifact.path,
    title: artifact.title,
    authorityClass: artifact.kind === 'feature_note' ? 'first_party' : 'repository',
    accepted: true,
  };
}

async function loadLinkedAtlasSources(featureId: string, limit: number): Promise<LinkedAtlasSourceRow[]> {
  const primaryOrder = 'updated_at DESC NULLS LAST, source_ref ASC';
  const legacyOrder = 'source_ref ASC';

  try {
    return await selectFeatureScopedRows<LinkedAtlasSourceRow>({
      label: 'atlas.feature_doc_enrichment.linked_sources',
      table: 'parent_atlas_documents',
      select: `source_ref,
            packet_key,
            tree_node_id::text AS tree_node_id,
            qdrant_point_id,
            NULL::text AS document_id`,
      orderBy: primaryOrder,
      limit,
      featureId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/column\s+"tree_node_id"\s+does not exist/i.test(message) && !/column\s+"updated_at"\s+does not exist/i.test(message)) {
      throw error;
    }

    return selectFeatureScopedRows<LinkedAtlasSourceRow>({
      label: 'atlas.feature_doc_enrichment.linked_sources.legacy_columns',
      table: 'parent_atlas_documents',
      select: `source_ref,
            NULL::text AS packet_key,
            NULL::text AS tree_node_id,
            qdrant_point_id,
            NULL::text AS document_id`,
      orderBy: legacyOrder,
      limit,
      featureId,
    });
  }
}

function appendAtlasCandidates(
  candidates: z.infer<typeof FeatureDocSourceCandidateSchema>[],
  rows: LinkedAtlasSourceRow[]
): z.infer<typeof FeatureDocSourceCandidateSchema>[] {
  for (const row of rows) {
    const sourceRef = String(row.source_ref ?? '').trim();
    if (!sourceRef) continue;
    candidates.push({
      sourceRef,
      sourceType: 'code_source',
      title: row.packet_key ?? undefined,
      authorityClass: 'repository',
      accepted: true,
      contentHash: row.packet_key ?? undefined,
    });
  }

  return candidates;
}

function deriveRetrievalPlan(evidence: FeatureDocumentEvidence, candidates: number) {
  const maxCandidates = Math.min(64, Math.max(12, candidates * 3));
  return {
    lexical: true,
    dense: true,
    centroidPrefilter: true,
    graphExpansion: true,
    maxCandidates,
    maxPacketCount: Math.min(24, Math.max(8, evidence.counts.parentAtlasDocuments > 0 ? 12 : 8)),
    maxContextTokens: 8192,
  };
}

function deriveNextCommands(featureId: string, evidenceState: z.infer<typeof FeatureEvidenceStateSchema>) {
  const commands = [
    `npx vitest run tests/atlas/identity/feature-doc-enrichment.test.ts --reporter verbose`,
    `npx vitest run tests/atlas/identity/feature-evidence-tuples.test.ts --reporter verbose`,
    `node scripts/ensure-mcp-server.mjs`,
    `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5173/api/library/ingest-feature-docs -ContentType application/json -Body '{\"featureId\":\"${featureId}\"}'`,
  ];

  if (evidenceState !== 'ACTIVE_VERIFIED') {
    commands.unshift(`atlas.feature_document_status ${featureId}`);
  }

  return commands.slice(0, 8);
}

export async function buildFeatureDocumentEnrichmentPlan(
  featureIdInput: string
): Promise<BuildFeatureDocEnrichmentPlanResult> {
  const featureId = String(featureIdInput ?? '').trim();
  if (!featureId) {
    throw new Error('featureId is required');
  }

  const evidence = await getFeatureDocumentEvidence(featureId);
  if (!evidence.manifestPath) {
    throw new Error(`Feature manifest missing for ${featureId}`);
  }

  const manifestRaw = fs.readFileSync(evidence.manifestPath, 'utf8');
  const manifest = FeatureDocumentManifestSchema.parse(JSON.parse(manifestRaw));
  const manifestOkf = manifest.okf ?? null;
  const manifestContentHash = sha256Hex(manifestRaw);
  const evidenceState = toEvidenceState(evidence);

  const linkedSources = await loadLinkedAtlasSources(featureId, 24);
  const candidates = evidence.artifacts
    .map((artifact) => mapArtifactCandidate(artifact))
    .filter((candidate): candidate is z.infer<typeof FeatureDocSourceCandidateSchema> => candidate !== null);

  appendAtlasCandidates(candidates, linkedSources);

  const sourceCandidates = uniqueStable(
    candidates.map((candidate) => JSON.stringify(candidate))
  )
    .map((value) => JSON.parse(value) as z.infer<typeof FeatureDocSourceCandidateSchema>)
    .slice(0, 64);

  if (manifestOkf) {
    sourceCandidates.push({
      sourceRef: `okf:${featureId}`,
      sourceType: 'runtime_report',
      title: manifestOkf.domainClassification.primaryDomain ?? manifestOkf.keywordCorpus.keywords[0] ?? featureId,
      authorityClass: 'generated',
      accepted: true,
      contentHash: manifestOkf.semanticOntology.ontologyVersion ?? manifestOkf.keywordCorpus.corpusVersion,
    });
  }

  const plan = FeatureDocEnrichmentPlanSchema.parse({
    schemaVersion: 'feature-doc-enrichment.v1',
    featureId,
    manifestPath: evidence.manifestPath,
    manifestContentHash,
    evidenceState,
    sourceCandidates,
    extractionPlan: {
      treeSitter: linkedSources.length > 0,
      astGrep: linkedSources.length > 0,
      lexicalFeatures: true,
      entities: true,
      screenshots: evidence.counts.screenshots > 0,
      apiSchemas: sourceCandidates.some((candidate) => candidate.sourceType === 'api_schema'),
    },
    retrievalPlan: deriveRetrievalPlan(evidence, sourceCandidates.length),
    storagePlan: {
      postgres: true,
      qdrant: Boolean(evidence.storage.qdrant.collection),
      redisValkey: true,
      seaweedfs: Boolean(evidence.storage.seaweedfs.bucket),
      neo4jProjection: true,
    },
    classifierPlan: {
      rules: true,
      naiveBayes: true,
      logisticRegression: false,
      neuralReranker: true,
      classifierVersion: CLASSIFIER_VERSION,
    },
    modelPlan: {
      embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
      summarizerModel: process.env.GEMMA4_MODEL || 'gemma4',
      summarizerEndpoint: process.env.LLAMA_SERVER_URL || process.env.GEMMA4_URL || 'http://127.0.0.1:8090/v1',
      qloraAdapter: process.env.QLORA_ADAPTER || undefined,
    },
    warnings: evidence.warnings.slice(0, 64),
    nextCommands: deriveNextCommands(featureId, evidenceState),
  });

  return { evidence, plan };
}

async function loadAtlasPacketRows(featureId: string, limit: number): Promise<AtlasPacketRow[]> {
  const result = await tracedQuery(
    'atlas.feature_doc_enrichment.packet_rows',
    `SELECT source_ref,
            packet_key,
            tree_node_id::text AS tree_node_id,
            qdrant_point_id,
            NULL::text AS document_id,
            domain_class,
            source_hash::text AS source_hash
       FROM atlas_packets
      WHERE feature_id = $1
      ORDER BY updated_at DESC NULLS LAST, source_ref ASC
      LIMIT $2`,
    [featureId, limit]
  );

  return result.rows as AtlasPacketRow[];
}

async function loadFactMaps(packetKeys: string[]) {
  if (packetKeys.length === 0) {
    return {
      ontologyMap: new Map<string, { ontologyIds: string[]; conceptIds: string[]; ontologyVersion: string | null }>(),
      lexicalMap: new Map<string, { lexicalFeatures: string[]; lexicalExtractorVersion: string | null; entities: Array<{ type: string; value: string }> }>(),
      structuralMap: new Map<string, { astSymbols: string[]; structuralParserVersion: string | null }>(),
    };
  }

  const [ontologyRes, lexicalRes, structuralRes] = await Promise.all([
    tracedQuery(
      'atlas.feature_doc_enrichment.ontology',
      `SELECT packet_key,
              array_remove(array_agg(DISTINCT CASE WHEN object_type = 'ontology' THEN object_id END), NULL) AS ontology_ids,
              array_remove(array_agg(DISTINCT CASE WHEN object_type = 'concept' THEN object_id END), NULL) AS concept_ids,
              max(ontology_version) AS ontology_version
         FROM feature_ontology_tuples
        WHERE packet_key = ANY($1::text[])
        GROUP BY packet_key`,
      [packetKeys]
    ),
    tracedQuery(
      'atlas.feature_doc_enrichment.lexical',
      `SELECT packet_key,
              array_remove(array_agg(DISTINCT feature), NULL) AS lexical_features,
              max(extractor_version) AS extractor_version
         FROM (
           SELECT packet_key, extractor_version, unnest(keywords || identifiers || symbols) AS feature
             FROM feature_lexical_facts
            WHERE packet_key = ANY($1::text[])
         ) items
        GROUP BY packet_key`,
      [packetKeys]
    ),
    tracedQuery(
      'atlas.feature_doc_enrichment.structural',
      `SELECT packet_key,
              array_remove(array_agg(DISTINCT symbol_name), NULL) AS ast_symbols,
              max(parser_version) AS parser_version
         FROM feature_structural_facts
        WHERE packet_key = ANY($1::text[])
        GROUP BY packet_key`,
      [packetKeys]
    ),
  ]);

  const ontologyMap = new Map<string, { ontologyIds: string[]; conceptIds: string[]; ontologyVersion: string | null }>();
  for (const row of ontologyRes.rows as Array<Record<string, unknown>>) {
    ontologyMap.set(String(row.packet_key), {
      ontologyIds: uniqueStable((row.ontology_ids as string[] | null) ?? []).slice(0, 32),
      conceptIds: uniqueStable((row.concept_ids as string[] | null) ?? []).slice(0, 32),
      ontologyVersion: row.ontology_version ? String(row.ontology_version) : null,
    });
  }

  const lexicalMap = new Map<string, { lexicalFeatures: string[]; lexicalExtractorVersion: string | null; entities: Array<{ type: string; value: string }> }>();
  for (const row of lexicalRes.rows as Array<Record<string, unknown>>) {
    const lexicalFeatures = uniqueStable((row.lexical_features as string[] | null) ?? [])
      .filter(Boolean)
      .slice(0, 64);
    lexicalMap.set(String(row.packet_key), {
      lexicalFeatures,
      lexicalExtractorVersion: row.extractor_version ? String(row.extractor_version) : null,
      entities: lexicalFeatures.slice(0, 16).map((value) => ({ type: 'lexical', value })),
    });
  }

  const structuralMap = new Map<string, { astSymbols: string[]; structuralParserVersion: string | null }>();
  for (const row of structuralRes.rows as Array<Record<string, unknown>>) {
    structuralMap.set(String(row.packet_key), {
      astSymbols: uniqueStable((row.ast_symbols as string[] | null) ?? []).slice(0, 64),
      structuralParserVersion: row.parser_version ? String(row.parser_version) : null,
    });
  }

  return { ontologyMap, lexicalMap, structuralMap };
}

async function loadLibraryDocumentMap(sourceRefs: string[]) {
  if (sourceRefs.length === 0) {
    return new Map<string, string>();
  }

  const result = await tracedQuery(
    'atlas.feature_doc_enrichment.library_documents',
    `SELECT id, title, official_url
       FROM library_documents
      WHERE title = ANY($1::text[])
         OR official_url = ANY($1::text[])`,
    [sourceRefs]
  );

  const map = new Map<string, string>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const documentId = String(row.id ?? '').trim();
    const title = String(row.title ?? '').trim();
    const officialUrl = String(row.official_url ?? '').trim();
    if (!documentId) continue;
    if (title) map.set(title, documentId);
    if (officialUrl) map.set(officialUrl, documentId);
  }
  return map;
}

export async function materializeFeatureEvidenceTuples(
  featureIdInput: string,
  options?: { maxTuples?: number }
): Promise<MaterializeFeatureEvidenceTuplesResult> {
  const { evidence, plan } = await buildFeatureDocumentEnrichmentPlan(featureIdInput);
  const manifestOkf = loadManifestOkf(evidence.manifestPath);
  const maxTuples = Math.min(64, Math.max(1, options?.maxTuples ?? 16));
  const packetRows = await loadAtlasPacketRows(plan.featureId, maxTuples);
  const packetKeys = packetRows
    .map((row) => String(row.packet_key ?? '').trim())
    .filter(Boolean);
  const { ontologyMap, lexicalMap, structuralMap } = await loadFactMaps(packetKeys);
  const sourceCandidates = plan.sourceCandidates.filter((candidate) => candidate.accepted);
  const documentIdMap = await loadLibraryDocumentMap(
    uniqueStable([
      ...packetRows.map((row) => String(row.source_ref ?? '').trim()).filter(Boolean),
      ...sourceCandidates.map((candidate) => candidate.sourceRef),
    ])
  );

  const tuples = packetRows.map((row) => {
    const packetKey = String(row.packet_key ?? '').trim();
    const ontology = ontologyMap.get(packetKey);
    const lexical = lexicalMap.get(packetKey);
    const structural = structuralMap.get(packetKey);
    const sourceRef = String(row.source_ref ?? '').trim();
    const featureRow = {
      identity: {
        packet_key: packetKey,
        source_ref: sourceRef,
        file_path: String(row.source_ref ?? '').trim(),
        function_symbol: null,
        feature_id: plan.featureId,
        title_id: null,
        tree_node_id: row.tree_node_id ?? null,
      },
      lexical: {
        method: 'bm25' as const,
        term_count: (lexical?.lexicalFeatures ?? manifestOkf?.keywordCorpus.keywords ?? []).length,
        top_terms: uniqueStable([
          ...(lexical?.lexicalFeatures ?? []),
          ...(manifestOkf?.keywordCorpus.keywords ?? []),
        ])
          .slice(0, 20)
          .map((term, index): [string, number] => [term, Math.max(0.01, 1 - index * 0.03)]),
        part_of_speech: null,
        computed_at: new Date().toISOString(),
      },
      domain_class: row.domain_class || manifestOkf?.domainClassification.primaryDomain || null,
      secondary_domains: manifestOkf?.domainClassification.secondaryDomains ?? [],
      ontology_ids: uniqueStable([
        ...(ontology?.ontologyIds ?? []),
        ...(manifestOkf?.semanticOntology.ontologyIds ?? []),
      ]).slice(0, 32),
      concept_ids: uniqueStable([
        ...(ontology?.conceptIds ?? []),
        ...(manifestOkf?.semanticOntology.conceptIds ?? []),
      ]).slice(0, 32),
      evidence_state: plan.evidenceState,
    };
    const ontologyIds = uniqueStable([
      ...(ontology?.ontologyIds ?? []),
      ...(manifestOkf?.semanticOntology.ontologyIds ?? []),
    ]).slice(0, 32);
    const conceptIds = uniqueStable([
      ...(ontology?.conceptIds ?? []),
      ...(manifestOkf?.semanticOntology.conceptIds ?? []),
    ]).slice(0, 32);
    const primaryLabel = row.domain_class || manifestOkf?.domainClassification.primaryDomain || plan.featureId;
    const sourceHash = String(row.source_hash ?? plan.manifestContentHash ?? sha256Hex(`${packetKey}:${sourceRef}`)).trim();
    const enrichedNode = row.tree_node_id
      ? EnrichedTreeNodeSchema.parse({
          identity: {
            tree_node_id: row.tree_node_id,
            directory_path: sourceRef.includes('/') ? sourceRef.slice(0, sourceRef.lastIndexOf('/')) : '.',
            source_ref: sourceRef,
            file_path: sourceRef,
            function_symbol: null,
            node_type: 'function',
            domain_class: row.domain_class || manifestOkf?.domainClassification.primaryDomain || null,
            community_id: null,
            kmeans_cluster_id: null,
            feature_id: plan.featureId,
            feature_label: primaryLabel,
            source_hash: sourceHash,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            corpus_snapshot_id: packetKey,
          },
          ast: {
            language: 'unknown',
            node_kind: 'feature_row',
            parent_tree_node_id: null,
            symbol_path: [],
            start_byte: 0,
            end_byte: 0,
          },
          pos: lexical?.lexicalExtractorVersion ? [{ tag: 'NOUN', token: primaryLabel, start_byte: 0, end_byte: primaryLabel.length, source: 'merged' as const }] : [],
          domains: [
            {
              domain_id: row.domain_class || manifestOkf?.domainClassification.primaryDomain || plan.featureId,
              label: row.domain_class || manifestOkf?.domainClassification.primaryDomain || primaryLabel,
              probability: 0.95,
              classifier: plan.classifierPlan.classifierVersion ?? 'feature-row-bridge',
              classifier_version: plan.classifierPlan.classifierVersion ?? 'feature-row-bridge',
            },
          ],
          ontology_links: ontologyIds.map((ontologyId, index) => ({
            ontology_id: ontologyId,
            concept_id: conceptIds[index] ?? ontologyId,
            relation: 'RELATED_TO' as const,
            confidence: 0.85,
            evidence_ref: `${packetKey}:${index}`,
          })),
          revisions: {
            workspace_revision: process.env.WORKSPACE_REVISION ?? 'main',
            source_hash: sourceHash,
            embedding_revision: null,
            graph_revision: null,
            ontology_revision: ontology?.ontologyVersion ?? null,
            classifier_revision: plan.classifierPlan.classifierVersion ?? null,
          },
        })
      : null;

    return FeatureEvidenceTupleSchema.parse({
      tupleId: sha256Hex(
        [
          'feature-evidence-tuple.v1',
          plan.featureId,
          sourceRef,
          packetKey,
        ].join('\0')
      ),
      schemaVersion: 'feature-evidence-tuple.v1',
      featureId: plan.featureId,
      sourceRef,
      packetKey: packetKey || undefined,
      treeNodeId: row.tree_node_id || undefined,
      documentId: row.document_id || documentIdMap.get(sourceRef) || undefined,
      qdrantPointId: row.qdrant_point_id || undefined,
      domainClass: row.domain_class || manifestOkf?.domainClassification.primaryDomain || undefined,
      ontologyIds,
      conceptIds,
      astSymbols: structural?.astSymbols ?? [],
      lexicalFeatures: uniqueStable([
        ...(lexical?.lexicalFeatures ?? []),
        ...(manifestOkf?.keywordCorpus.keywords ?? []),
      ]).slice(0, 64),
      ontologyLinkedTuples: enrichedNode
        ? materializeLinkedTupleDraftsFromEnrichedTreeNode({
            node: enrichedNode,
            packetKey,
            sourceRef,
            documentId: row.document_id || documentIdMap.get(sourceRef) || undefined,
            sourceTables: uniqueStable([
              'atlas_packets',
              ontology ? 'feature_ontology_tuples' : '',
              lexical ? 'feature_lexical_facts' : '',
              structural ? 'feature_structural_facts' : '',
              manifestOkf ? 'feature_document_manifest.okf' : '',
            ].filter(Boolean)).slice(0, 12),
            labelerVersion: plan.classifierPlan.classifierVersion ?? null,
            taggerVersion: lexical?.lexicalExtractorVersion ?? null,
            ontologyVersion: ontology?.ontologyVersion ?? null,
            nlpVersion: manifestOkf?.nlp.langextractVersion ?? null,
          }).map((draft) => OntologyLinkedTupleV1Schema.parse(draft))
        : buildOntologyLinkedTuplesFromFeatureRow({
            featureRow,
            packetKey,
            sourceRef,
            featureLabel: primaryLabel,
            sourceTables: uniqueStable([
              'atlas_packets',
              ontology ? 'feature_ontology_tuples' : '',
              lexical ? 'feature_lexical_facts' : '',
              structural ? 'feature_structural_facts' : '',
              manifestOkf ? 'feature_document_manifest.okf' : '',
            ].filter(Boolean)).slice(0, 12),
            labelerVersion: plan.classifierPlan.classifierVersion ?? null,
            taggerVersion: lexical?.lexicalExtractorVersion ?? null,
            ontologyVersion: ontology?.ontologyVersion ?? null,
            nlpVersion: manifestOkf?.nlp.langextractVersion ?? null,
          }),
      entities: lexical?.entities ?? [],
      evidenceState: plan.evidenceState,
      provenance: {
        sourceTables: uniqueStable([
          'atlas_packets',
          ontology ? 'feature_ontology_tuples' : '',
          lexical ? 'feature_lexical_facts' : '',
          structural ? 'feature_structural_facts' : '',
          manifestOkf ? 'feature_document_manifest.okf' : '',
        ].filter(Boolean)).slice(0, 12),
        classifierVersion: plan.classifierPlan.classifierVersion ?? null,
        lexicalExtractorVersion: lexical?.lexicalExtractorVersion ?? null,
        structuralParserVersion: structural?.structuralParserVersion ?? null,
        ontologyExtractorVersion: ontology?.ontologyVersion ?? null,
      },
    });
  });

  if (tuples.length < maxTuples) {
    for (const candidate of sourceCandidates) {
      if (tuples.length >= maxTuples) break;
      if (candidate.sourceType !== 'local_file' && candidate.sourceType !== 'api_schema' && candidate.sourceType !== 'code_source') {
        continue;
      }
      if (tuples.some((tuple) => tuple.sourceRef === candidate.sourceRef)) continue;

      const packet = await buildIndexedSourcePacket({
        sourceRef: candidate.sourceRef,
        featureId: plan.featureId,
      }).catch(() => null);

      tuples.push(
        FeatureEvidenceTupleSchema.parse({
          tupleId: sha256Hex(
            [
              'feature-evidence-tuple.v1',
              plan.featureId,
              candidate.sourceRef,
              packet?.packet.packet_id ?? '',
            ].join('\0')
          ),
          schemaVersion: 'feature-evidence-tuple.v1',
          featureId: plan.featureId,
          sourceRef: candidate.sourceRef,
          packetKey: packet?.packet.packet_id ?? undefined,
          treeNodeId: undefined,
          documentId: documentIdMap.get(candidate.sourceRef) ?? undefined,
          qdrantPointId: undefined,
          domainClass: manifestOkf?.domainClassification.primaryDomain || undefined,
          ontologyIds: manifestOkf?.semanticOntology.ontologyIds ?? [],
          conceptIds: manifestOkf?.semanticOntology.conceptIds ?? [],
          astSymbols: [],
          lexicalFeatures: manifestOkf?.keywordCorpus.keywords ?? [],
          ontologyLinkedTuples: buildOntologyLinkedTuplesFromFeatureRow({
            featureRow: {
              identity: {
                packet_key: packet?.packet.packet_id ?? '',
                source_ref: candidate.sourceRef,
                file_path: candidate.localPath ?? candidate.sourceRef,
                function_symbol: null,
                feature_id: plan.featureId,
                title_id: null,
                tree_node_id: undefined,
              },
              lexical: {
                method: 'bm25' as const,
                term_count: manifestOkf?.keywordCorpus.keywords.length ?? 0,
                top_terms: uniqueStable(manifestOkf?.keywordCorpus.keywords ?? [])
                  .slice(0, 20)
                  .map((term, index): [string, number] => [term, Math.max(0.01, 1 - index * 0.03)]),
                part_of_speech: null,
                computed_at: new Date().toISOString(),
              },
              domain_class: manifestOkf?.domainClassification.primaryDomain || null,
              secondary_domains: manifestOkf?.domainClassification.secondaryDomains ?? [],
              ontology_ids: manifestOkf?.semanticOntology.ontologyIds ?? [],
              concept_ids: manifestOkf?.semanticOntology.conceptIds ?? [],
              evidence_state: plan.evidenceState,
            },
            packetKey: packet?.packet.packet_id ?? '',
            sourceRef: candidate.sourceRef,
            featureLabel: manifestOkf?.domainClassification.primaryDomain ?? plan.featureId,
            sourceTables: uniqueStable([
              documentIdMap.has(candidate.sourceRef) ? 'library_documents' : '',
              'ace_packet_runtime',
              manifestOkf ? 'feature_document_manifest.okf' : '',
            ].filter(Boolean)).slice(0, 12),
            labelerVersion: plan.classifierPlan.classifierVersion ?? null,
            taggerVersion: null,
            ontologyVersion: null,
            nlpVersion: manifestOkf?.nlp.langextractVersion ?? null,
          }),
          entities: [],
          evidenceState: plan.evidenceState,
          provenance: {
            sourceTables: uniqueStable([
              documentIdMap.has(candidate.sourceRef) ? 'library_documents' : '',
              'ace_packet_runtime',
              manifestOkf ? 'feature_document_manifest.okf' : '',
            ].filter(Boolean)).slice(0, 12),
            classifierVersion: plan.classifierPlan.classifierVersion ?? null,
            lexicalExtractorVersion: null,
            structuralParserVersion: null,
            ontologyExtractorVersion: null,
          },
        })
      );
    }
  }

  return { evidence, plan, tuples };
}
