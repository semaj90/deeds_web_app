/**
 * parent-atlas-packet-assembler.ts
 *
 * Converts a source_ref / query / feature_id into a full AceFullPacket by:
 *   1. Looking up the NES/CHROM card for the source_ref (Redis hot path)
 *   2. Expanding card metadata → feature_ids, cluster_id, lane_ids
 *   3. Fetching SOM cluster packet for the resolved cluster_id
 *   4. Writing an AceFullPacket to Redis with all fields populated
 *
 * This is the "assemble from known identity" path.
 * Use query-router.ts for the "assemble from freetext query" path.
 */

import crypto from 'crypto';
import { readCardBySourceRef, normalizeCardId, type NesChromCard } from './nes-chrom-card-store.js';
import { readSomPacketById } from './som-packet-store.js';
import {
  writeAcePacket,
  readAcePacketBySourceRef,
  makeQueryHash,
  type AceFullPacket,
} from './ace-packet-store.js';

export interface AssembleOpts {
  sourceRef: string;
  query?: string;
  featureId?: string;
  forceRefresh?: boolean;
}

export interface AssembleResult {
  packet: AceFullPacket;
  card: NesChromCard | null;
  fromCache: boolean;
}

export async function assemblePacketForSourceRef(opts: AssembleOpts): Promise<AssembleResult> {
  const { sourceRef, query, featureId, forceRefresh = false } = opts;
  const norm = normalizeCardId(sourceRef);
  const effectiveQuery = query ?? norm;
  const queryHash = makeQueryHash(effectiveQuery);

  // Fast path: packet already cached in Redis for this source_ref
  if (!forceRefresh) {
    const existing = await readAcePacketBySourceRef(norm).catch(() => null);
    if (existing) {
      return { packet: existing, card: null, fromCache: true };
    }
  }

  // Load NES card
  const card = await readCardBySourceRef(norm).catch(() => null);

  // Gather metadata from card
  const sourceRefs = card ? [card.source_ref] : [norm];
  const featureIds: string[] = [];
  if (featureId) featureIds.push(featureId);
  if (card?.feature_ids?.length) {
    for (const f of card.feature_ids) {
      if (!featureIds.includes(f)) featureIds.push(f);
    }
  }
  const clusterId = card?.cluster_id ?? null;
  const laneIds: string[] = card ? ['nes-card'] : [];

  // Expand SOM cluster
  let somSourceRefs: string[] = [];
  let somFeatureIds: string[] = [];
  if (clusterId) {
    const somPacket = await readSomPacketById(clusterId).catch(() => null);
    if (somPacket) {
      somSourceRefs = somPacket.source_refs.filter(r => !sourceRefs.includes(r)).slice(0, 5);
      somFeatureIds = somPacket.feature_ids.filter(f => !featureIds.includes(f));
      laneIds.push('som-cluster');
    }
  }

  const allSourceRefs = [...new Set([...sourceRefs, ...somSourceRefs])];
  const allFeatureIds = [...new Set([...featureIds, ...somFeatureIds])];

  // Build prompt context from card summary / keywords
  const promptLines: string[] = [];
  if (card?.summary) promptLines.push(`Summary: ${card.summary}`);
  if (card?.keywords?.length) promptLines.push(`Keywords: ${card.keywords.join(', ')}`);
  if (card?.tags?.length) promptLines.push(`Tags: ${card.tags.join(', ')}`);
  const promptContext = promptLines.length
    ? `[${norm}]\n${promptLines.join('\n')}`
    : `[${norm}]\nNo cached summary available.`;

  const ranked_cards: AceFullPacket['ranked_cards'] = allSourceRefs.map((ref, i) => ({
    source_ref: ref,
    score: i === 0 ? 1.0 : 0.5,
    feature_id: allFeatureIds[0] ?? null,
    snippet: i === 0 ? (card?.summary ?? '').slice(0, 200) : '',
  }));

  const packet = await writeAcePacket({
    query: effectiveQuery,
    query_hash: queryHash,
    source_refs: allSourceRefs,
    feature_ids: allFeatureIds,
    lane_ids: [...new Set(laneIds)],
    cluster_id: clusterId,
    workspace_task_id: card?.workspace_task_id ?? null,
    qdrant_point_ids: [],
    neo4j_neighbor_ids: [],
    redis_hot_keys: [],
    prompt_context: promptContext,
    ranked_cards,
    cache_hit: 'redis',
    latency_ms: 0,
    degraded: allSourceRefs.length === 0,
    ttl_seconds: 3_600,
  }, { asLatest: false });

  return { packet, card, fromCache: false };
}

/**
 * Bulk assemble packets for a list of source_refs.
 * Useful after graphify:semantic runs and loads new cards into Redis.
 */
export async function bulkAssemblePackets(
  sourceRefs: string[],
  opts: { forceRefresh?: boolean } = {}
): Promise<{ assembled: number; skipped: number; failed: number }> {
  let assembled = 0;
  let skipped = 0;
  let failed = 0;

  for (const ref of sourceRefs) {
    try {
      const result = await assemblePacketForSourceRef({ sourceRef: ref, forceRefresh: opts.forceRefresh });
      if (result.fromCache) skipped++;
      else assembled++;
    } catch {
      failed++;
    }
  }

  return { assembled, skipped, failed };
}