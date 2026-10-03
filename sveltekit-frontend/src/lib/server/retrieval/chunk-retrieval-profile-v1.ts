import { createHash } from 'node:crypto';

/**
 * Shared chunk/file/directory retrieval vocabulary. Pure derived projections;
 * PostgreSQL remains the identity and revision authority.
 */
export interface ChunkRetrievalProfileV1 {
  canonicalChunkId: string;
  packetKey: string;
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  language?: string;
  symbolKind?: string;
  symbolName?: string;
  keywords: string[];
  identifiers: string[];
  nouns: string[];
  astNodeType?: string;
  astPath: string[];
  calls: string[];
  imports: string[];
  exports: string[];
  summary?: string;
  semanticTags: string[];
  embeddingRepresentation: 'semantic_768';
  primaryDomain?: string;
  domainConfidence?: number;
  topicIds: string[];
  kmeansCluster?: number;
  clusterMargin?: number;
  somX?: number;
  somY?: number;
  communityId?: number;
  pageRank?: number;
  manifold4?: [number, number, number, number];
  conceptIds: string[];
  entityIds: string[];
  ontologyTupleIds: string[];
  featureRevision: string;
  classifierRevision?: string;
  topologyRevision?: string;
}

export interface FileProfileV1 {
  fileKey: string;
  repositoryId: string;
  repositoryRelativePath: string;
  workspaceRevision: string;
  sourceRevisions: string[];
  chunkIds: string[];
  chunkCount: number;
  keywords: string[];
  conceptIds: string[];
  topicIds: string[];
  domains: Array<{ domain: string; probability: number }>;
  inboundImports: number;
  outboundImports: number;
  communityIds: number[];
  pageRankMean?: number;
  pageRankMax?: number;
  featureRevision: string;
}

export interface DirectoryProfileV1 {
  directoryId: string;
  directoryKey: string;
  repositoryId: string;
  path: string;
  workspaceRevision: string;
  fileCount: number;
  chunkCount: number;
  fileKeys: string[];
  keywords: string[];
  dominantDomains: Array<{ domain: string; probability: number }>;
  conceptIds: string[];
  inboundImports: number;
  outboundImports: number;
  communityIds: number[];
  pageRankMean?: number;
  pageRankMax?: number;
  featureRevision: string;
}

export interface DirectoryWeakPriorInputV1 {
  baseScore: number;
  directoryMatch: boolean;
  domainMatch?: boolean;
  exactSymbolOrIdentifierMatch?: boolean;
}

export interface DirectoryWeakPriorV1 {
  adjustedScore: number;
  adjustment: number;
  independentLane: false;
  bounded: true;
  exactEvidenceProtected: boolean;
}

/**
 * Applies directory/domain metadata as a bounded ranking hint only.
 * It cannot create a lane, replace identity, or outrank exact evidence.
 */
export function applyDirectoryWeakPriorV1(input: DirectoryWeakPriorInputV1): DirectoryWeakPriorV1 {
  if (!Number.isFinite(input.baseScore)) throw new Error('DirectoryWeakPriorV1 requires a finite base score');
  const exactEvidenceProtected = input.exactSymbolOrIdentifierMatch === true;
  const rawAdjustment = input.directoryMatch ? 0.02 : 0;
  const domainAdjustment = input.domainMatch ? 0.01 : 0;
  const adjustment = exactEvidenceProtected ? 0 : Math.min(0.03, rawAdjustment + domainAdjustment);
  return {
    adjustedScore: input.baseScore + adjustment,
    adjustment,
    independentLane: false,
    bounded: true,
    exactEvidenceProtected,
  };
}

const DIRECTORY_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface CanonicalChunkRowInputV1 {
  chunk_id: string;
  relative_path: string;
  source_ref: string;
  language?: string | null;
  kind?: string | null;
  symbol?: string | null;
  summary?: string | null;
  semantic_tags?: string[] | null;
  ast_symbols?: unknown[] | null;
  ast_imports?: string[] | null;
  ast_exports?: string[] | null;
  domain?: string | null;
  cluster_margin?: number | null;
  kmeans_cluster?: number | null;
  som_bmu_row?: number | null;
  som_bmu_col?: number | null;
  community_id?: number | null;
  page_rank_score?: number | null;
  manifold4?: number[] | null;
  tags?: unknown;
}

export interface ProvenLineageInputV1 {
  packet_key: string;
  canonical_chunk_id: string;
  source_ref: string;
  source_namespace: string;
  source_revision: string;
  revision_status: 'PROVEN';
}

import type { CandidateProjectionInput } from './retrieval-candidate-feature-matrix-v1.js';

/**
 * Joins the two existing canonical read models without fallback identity.
 * The caller must supply the repository and workspace authorities separately.
 */
export function buildChunkRetrievalProfileV1(input: {
  chunk: CanonicalChunkRowInputV1;
  lineage: ProvenLineageInputV1;
  repositoryId: string;
  workspaceRevision: string;
  featureRevision: string;
}): ChunkRetrievalProfileV1 {
  const { chunk, lineage } = input;
  if (!input.repositoryId || !input.workspaceRevision || !input.featureRevision) throw new Error('ChunkRetrievalProfileV1 requires repository, workspace, and feature revisions');
  if (!chunk.chunk_id || chunk.chunk_id !== lineage.canonical_chunk_id) throw new Error('ChunkRetrievalProfileV1 canonical chunk identity mismatch');
  if (!chunk.source_ref || chunk.source_ref !== lineage.source_ref) throw new Error('ChunkRetrievalProfileV1 source reference mismatch');
  if (!lineage.source_namespace || lineage.revision_status !== 'PROVEN' || !lineage.source_revision) throw new Error('ChunkRetrievalProfileV1 requires proven source namespace and revision');
  const manifold = Array.isArray(chunk.manifold4) && chunk.manifold4.length === 4 && chunk.manifold4.every(Number.isFinite) ? chunk.manifold4 as [number, number, number, number] : undefined;
  const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const tags = stringArray(chunk.tags);
  return {
    canonicalChunkId: chunk.chunk_id,
    packetKey: lineage.packet_key,
    repositoryId: input.repositoryId,
    repositoryRelativePath: chunk.relative_path,
    sourceRef: chunk.source_ref,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: lineage.source_revision,
    language: chunk.language ?? undefined,
    symbolKind: chunk.kind ?? undefined,
    symbolName: chunk.symbol ?? undefined,
    keywords: tags,
    identifiers: stringArray(chunk.ast_symbols),
    nouns: [],
    astPath: [],
    calls: [],
    imports: chunk.ast_imports ?? [],
    exports: chunk.ast_exports ?? [],
    summary: chunk.summary ?? undefined,
    semanticTags: chunk.semantic_tags ?? [],
    embeddingRepresentation: 'semantic_768',
    primaryDomain: chunk.domain ?? undefined,
    clusterMargin: chunk.cluster_margin ?? undefined,
    topicIds: [],
    kmeansCluster: chunk.kmeans_cluster ?? undefined,
    somX: chunk.som_bmu_col ?? undefined,
    somY: chunk.som_bmu_row ?? undefined,
    communityId: chunk.community_id ?? undefined,
    pageRank: chunk.page_rank_score ?? undefined,
    manifold4: manifold,
    conceptIds: [],
    entityIds: [],
    ontologyTupleIds: [],
    featureRevision: input.featureRevision,
  };
}

/** Projects only evidence already present on a chunk into the existing matrix. */
export function toCandidateProjectionInputV1(
  profile: ChunkRetrievalProfileV1,
  expectedSourceRevision?: string,
): CandidateProjectionInput {
  return {
    packet_key: profile.packetKey,
    summary_provenance: profile.summary ? 1 : undefined,
    dependency_fanout: profile.calls.length + profile.imports.length + profile.exports.length,
    feature_label_confidence: profile.domainConfidence,
    source_revision_match: expectedSourceRevision === undefined ? undefined : profile.sourceRevision === expectedSourceRevision ? 1 : 0,
  };
}

const unique = (values: Iterable<string>) => [...new Set([...values].filter(Boolean))].sort();
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
const normalizeRelativePath = (filePath: string) => filePath.trim().replaceAll('\\', '/').replace(/^\.\//, '');
const directoryPath = (filePath: string) => {
  const normalized = normalizeRelativePath(filePath);
  return normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
};

export function aggregateFileProfileV1(chunks: ChunkRetrievalProfileV1[]): FileProfileV1 {
  if (!chunks.length) throw new Error('FileProfileV1 requires at least one chunk');
  const first = chunks[0];
  if (new Set(chunks.map((chunk) => chunk.canonicalChunkId)).size !== chunks.length) throw new Error('FileProfileV1 duplicate canonical chunk identity');
  if (chunks.some((chunk) => chunk.repositoryId !== first.repositoryId || normalizeRelativePath(chunk.repositoryRelativePath) !== normalizeRelativePath(first.repositoryRelativePath) || chunk.workspaceRevision !== first.workspaceRevision || chunk.sourceRevision !== first.sourceRevision || chunk.featureRevision !== first.featureRevision)) throw new Error('FileProfileV1 identity or revision mismatch');
  if (new Set(chunks.map((chunk) => chunk.packetKey)).size !== 1) throw new Error('FileProfileV1 packet identity mismatch');
  const domainCounts = new Map<string, number>();
  for (const chunk of chunks) if (chunk.primaryDomain) domainCounts.set(chunk.primaryDomain, (domainCounts.get(chunk.primaryDomain) || 0) + (chunk.domainConfidence ?? 1));
  const total = [...domainCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const repositoryRelativePath = normalizeRelativePath(first.repositoryRelativePath);
  return { fileKey: `${first.repositoryId}:${repositoryRelativePath}`, repositoryId: first.repositoryId, repositoryRelativePath, workspaceRevision: first.workspaceRevision, sourceRevisions: [first.sourceRevision], chunkIds: unique(chunks.map((chunk) => chunk.canonicalChunkId)), chunkCount: chunks.length, keywords: unique(chunks.flatMap((chunk) => chunk.keywords)), conceptIds: unique(chunks.flatMap((chunk) => chunk.conceptIds)), topicIds: unique(chunks.flatMap((chunk) => chunk.topicIds)), domains: [...domainCounts.entries()].map(([domain, value]) => ({ domain, probability: value / total })).sort((a, b) => b.probability - a.probability || a.domain.localeCompare(b.domain)), inboundImports: chunks.reduce((sum, chunk) => sum + chunk.imports.length, 0), outboundImports: chunks.reduce((sum, chunk) => sum + chunk.exports.length, 0), communityIds: [...new Set(chunks.flatMap((chunk) => chunk.communityId === undefined ? [] : [chunk.communityId]))].sort((a, b) => a - b), pageRankMean: mean(chunks.flatMap((chunk) => chunk.pageRank === undefined ? [] : [chunk.pageRank])), pageRankMax: chunks.some((chunk) => chunk.pageRank !== undefined) ? Math.max(...chunks.flatMap((chunk) => chunk.pageRank === undefined ? [] : [chunk.pageRank])) : undefined, featureRevision: first.featureRevision };
}

export function aggregateDirectoryProfilesV1(chunks: ChunkRetrievalProfileV1[]): DirectoryProfileV1[] {
  const groups = new Map<string, ChunkRetrievalProfileV1[]>();
  for (const chunk of chunks) { const key = `${chunk.repositoryId}\0${directoryPath(chunk.repositoryRelativePath)}`; groups.set(key, [...(groups.get(key) || []), chunk]); }
  return [...groups.values()].map((group) => {
    const files = [...new Set(group.map((chunk) => normalizeRelativePath(chunk.repositoryRelativePath)))].sort();
    const first = group[0];
    if (group.some((chunk) => chunk.repositoryId !== first.repositoryId || chunk.workspaceRevision !== first.workspaceRevision)) throw new Error('DirectoryProfileV1 repository or workspace revision mismatch');
    const featureRevisions = unique(group.map((chunk) => chunk.featureRevision));
    if (featureRevisions.length !== 1) throw new Error('DirectoryProfileV1 mixed feature revisions');
    const fileProfiles = files.map((file) => aggregateFileProfileV1(group.filter((chunk) => normalizeRelativePath(chunk.repositoryRelativePath) === file)));
    const domainTotals = new Map<string, number>();
    for (const file of fileProfiles) for (const domain of file.domains) domainTotals.set(domain.domain, (domainTotals.get(domain.domain) || 0) + domain.probability);
    const domainTotal = [...domainTotals.values()].reduce((a, b) => a + b, 0) || 1;
    const path = directoryPath(first.repositoryRelativePath);
    return { directoryId: uuidV5(DIRECTORY_NAMESPACE, `${first.repositoryId}\0${first.workspaceRevision}\0${path}`), directoryKey: `${first.repositoryId}:${path}`, repositoryId: first.repositoryId, path, workspaceRevision: first.workspaceRevision, fileCount: fileProfiles.length, chunkCount: group.length, fileKeys: fileProfiles.map((file) => file.fileKey), keywords: unique(fileProfiles.flatMap((file) => file.keywords)), dominantDomains: [...domainTotals.entries()].map(([domain, value]) => ({ domain, probability: value / domainTotal })).sort((a, b) => b.probability - a.probability || a.domain.localeCompare(b.domain)), conceptIds: unique(fileProfiles.flatMap((file) => file.conceptIds)), inboundImports: fileProfiles.reduce((sum, file) => sum + file.inboundImports, 0), outboundImports: fileProfiles.reduce((sum, file) => sum + file.outboundImports, 0), communityIds: [...new Set(fileProfiles.flatMap((file) => file.communityIds))].sort((a, b) => a - b), pageRankMean: mean(fileProfiles.flatMap((file) => file.pageRankMean === undefined ? [] : [file.pageRankMean])), pageRankMax: fileProfiles.some((file) => file.pageRankMax !== undefined) ? Math.max(...fileProfiles.flatMap((file) => file.pageRankMax === undefined ? [] : [file.pageRankMax])) : undefined, featureRevision: featureRevisions[0] };
  }).sort((a, b) => a.directoryKey.localeCompare(b.directoryKey));
}
