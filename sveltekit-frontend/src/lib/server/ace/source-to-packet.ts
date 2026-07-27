import fs from 'node:fs';
import path from 'node:path';

import { buildVarianceRecoveryContext } from './variance-recovery.js';
import { normalizeCardId } from './nes-chrom-card-store.js';
import {
  makeQueryHash,
  readAcePacketBySourceRef,
  writeAcePacket,
  type AceFullPacket,
} from './ace-packet-store.js';

export interface BuildSourcePacketInput {
  sourceRef?: string;
  markdown?: string;
  query?: string;
  featureId?: string;
  forceRefresh?: boolean;
  asLatest?: boolean;
}

export interface BuildSourcePacketResult {
  packet: AceFullPacket;
  fromCache: boolean;
  normalizedSourceRef: string | null;
  contentPreview: string;
}

const SOURCE_PREVIEW_LIMIT = 1800;
const PROMPT_CONTEXT_LIMIT = 3200;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimContent(value: string, limit: number): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trimEnd()}\n...[truncated]`;
}

function deriveQuery(sourceRef: string | null, markdown: string | undefined): string {
  const firstHeading = markdown
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('#') && line.replace(/^#+\s*/, '').length > 0);

  if (firstHeading) return firstHeading.replace(/^#+\s*/, '').trim();
  if (sourceRef) return sourceRef;
  return 'ace-packet-source';
}

function deriveFeatureIds(sourceRef: string | null, explicitFeatureId?: string): string[] {
  const featureIds = new Set<string>();
  if (explicitFeatureId?.trim()) featureIds.add(explicitFeatureId.trim());

  if (sourceRef) {
    const compact = sourceRef
      .replace(/\.[^.]+$/, '')
      .replace(/^sveltekit-frontend\//, '')
      .replace(/^docs\//, 'docs.')
      .replace(/^src\//, 'src.')
      .replace(/[\\/]+/g, '.')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '');

    if (compact) featureIds.add(compact);
  }

  return Array.from(featureIds).slice(0, 6);
}

function resolveCandidatePaths(sourceRef: string): string[] {
  const cwd = process.cwd();
  const repoRoot = path.resolve(cwd, '..');
  const normalized = normalizeSlashes(sourceRef).replace(/^file:/, '').trim();
  const withoutFrontendPrefix = normalized.replace(/^sveltekit-frontend\//, '');

  return Array.from(
    new Set(
      [
        normalized,
        withoutFrontendPrefix,
        path.resolve(cwd, normalized),
        path.resolve(cwd, withoutFrontendPrefix),
        path.resolve(repoRoot, normalized),
        path.resolve(repoRoot, withoutFrontendPrefix),
      ]
        .filter(Boolean)
        .map((candidate) => path.normalize(candidate))
    )
  );
}

function tryReadSourceContent(sourceRef?: string): { normalizedSourceRef: string | null; content: string | null } {
  if (!sourceRef?.trim()) {
    return { normalizedSourceRef: null, content: null };
  }

  const normalizedCardRef = normalizeCardId(sourceRef);
  for (const candidate of resolveCandidatePaths(sourceRef)) {
    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) continue;

    const raw = fs.readFileSync(candidate, 'utf8');
    const repoRoot = path.resolve(process.cwd(), '..');
    const relToFrontend = normalizeSlashes(path.relative(process.cwd(), candidate));
    const relToRepo = normalizeSlashes(path.relative(repoRoot, candidate));
    const bestRef =
      relToFrontend && !relToFrontend.startsWith('..')
        ? relToFrontend
        : relToRepo && !relToRepo.startsWith('..')
          ? relToRepo
          : normalizeSlashes(candidate);

    return {
      normalizedSourceRef: normalizedCardRef.startsWith('src/') ? normalizedCardRef : bestRef,
      content: raw,
    };
  }

  return {
    normalizedSourceRef: normalizedCardRef || normalizeSlashes(sourceRef),
    content: null,
  };
}

function buildPromptContext(args: {
  normalizedSourceRef: string | null;
  contentPreview: string;
  featureIds: string[];
  varianceRecovery: Awaited<ReturnType<typeof buildVarianceRecoveryContext>>['varianceRecovery'];
}): string {
  const lines = [
    args.normalizedSourceRef ? `Source: ${args.normalizedSourceRef}` : 'Source: inline_markdown',
    args.featureIds.length > 0 ? `FeatureIds: ${args.featureIds.join(', ')}` : 'FeatureIds: none',
    args.varianceRecovery.qdrantTags.length > 0
      ? `QdrantTags: ${args.varianceRecovery.qdrantTags.join(', ')}`
      : 'QdrantTags: none',
    args.varianceRecovery.clusterTagRecall.length > 0
      ? `ClusterRecall: ${args.varianceRecovery.clusterTagRecall.join(', ')}`
      : 'ClusterRecall: none',
    '',
    args.contentPreview || 'No file or markdown content was available.',
  ];

  return trimContent(lines.join('\n'), PROMPT_CONTEXT_LIMIT);
}

export async function buildAcePacketFromSource(
  input: BuildSourcePacketInput
): Promise<BuildSourcePacketResult> {
  const loaded = tryReadSourceContent(input.sourceRef);
  const normalizedSourceRef = loaded.normalizedSourceRef;

  if (normalizedSourceRef && !input.forceRefresh) {
    const existing = await readAcePacketBySourceRef(normalizedSourceRef).catch(() => null);
    if (existing) {
      return {
        packet: existing,
        fromCache: true,
        normalizedSourceRef,
        contentPreview: '',
      };
    }
  }

  const content = input.markdown?.trim() || loaded.content || '';
  const contentPreview = trimContent(content, SOURCE_PREVIEW_LIMIT);
  const query = (input.query?.trim() || deriveQuery(normalizedSourceRef, contentPreview)).slice(0, 500);
  const queryHash = makeQueryHash(query);
  const promptCacheKey = `ace:prompt:${queryHash}`;
  const featureIds = deriveFeatureIds(normalizedSourceRef, input.featureId);
  const baseSourceRefs = normalizedSourceRef ? [normalizedSourceRef] : ['inline:markdown'];

  const recovery = await buildVarianceRecoveryContext({
    query,
    sourceRefs: baseSourceRefs,
    rankedCards: normalizedSourceRef
      ? [{ path: normalizedSourceRef }]
      : [],
    lokiData: null,
    promptCacheKey,
    degraded: contentPreview.length === 0,
  });

  const sourceRefs = Array.from(new Set([...baseSourceRefs, ...recovery.sourceRefs])).slice(0, 12);
  const promptContext = buildPromptContext({
    normalizedSourceRef,
    contentPreview,
    featureIds,
    varianceRecovery: recovery.varianceRecovery,
  });

  const rankedCards = recovery.rankedCards.slice(0, 8).map((card, index) => ({
    source_ref: String(card.path ?? sourceRefs[index] ?? sourceRefs[0] ?? 'inline:markdown'),
    score: Number(card.score ?? (index === 0 ? 1 : 0.5)),
    feature_id: featureIds[0] ?? null,
    snippet: trimContent(
      String(card.summary ?? card.snippet ?? contentPreview ?? '').replace(/\s+/g, ' '),
      220
    ),
  }));

  const packet = await writeAcePacket(
    {
      packet_ulid: null,
      title_id: null,
      query,
      query_hash: queryHash,
      source_refs: sourceRefs,
      feature_ids: featureIds,
      lane_ids: ['source-to-packet', contentPreview ? 'content-preview' : 'identity-only'],
      cluster_id: null,
      workspace_task_id: null,
      used_concepts: recovery.varianceRecovery.langextractEntities.slice(0, 8),
      lexical_nouns: [],
      lexical_verbs: [],
      lexical_adverbs_ly: [],
      adjacency_packet_keys: [],
      adjacency_feature_ids: [],
      adjacency_source_refs: recovery.varianceRecovery.semanticSearchHits.slice(0, 8),
      packed_arrays: {
        packet_keys: [],
        feature_ids: featureIds,
        source_refs: sourceRefs,
        title_ids: [],
      },
      columnar_tables: [],
      mmap_vector_refs: [],
      qdrant_point_ids: [],
      neo4j_neighbor_ids: [],
      redis_hot_keys: [promptCacheKey],
      som_cluster: null,
      engram_ids: [],
      kag_hits: recovery.varianceRecovery.semanticSearchHits.length,
      dag_hits: recovery.varianceRecovery.clusterTagRecall.length,
      nes_chrom_packet_keys: [],
      prompt_context: promptContext,
      ranked_cards: rankedCards,
      cache_hit: 'none',
      latency_ms: 0,
      degraded: recovery.varianceRecovery.exactMatchFailed || contentPreview.length === 0,
      ttl_seconds: 3600,
    },
    { asLatest: input.asLatest ?? true }
  );

  return {
    packet,
    fromCache: false,
    normalizedSourceRef,
    contentPreview,
  };
}
