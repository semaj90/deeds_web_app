/**
 * Wires the already-designed `ContextManifest` contract (`context-compiler.parent-atlas.ts`,
 * previously unwired — zero production callers) into the live ACE output (`ACEContext` from
 * `features/ai/ace/context-assembler.ts`, called from 8 production routes).
 *
 * Additive only: does not modify `assembleACEContext` or any existing caller. Callers opt in
 * by calling `buildContextManifestFromACE()` after they already have an `ACEContext`.
 *
 * Per openspec/changes/parent-atlas-code-ingestion-pipeline/tasks.md
 * "GPU/NLP feature-materialization duplication audit" — recommended next action.
 */

import {
  compileContext,
  type CompiledContext,
  type ContextCandidate,
  type ContextLane,
  type ContextSelectionPolicy,
} from './context-compiler.parent-atlas.js';
import type { ACEContext } from './types.js';
import { buildAtlasProcessPacket, type AtlasProcessPacket } from '../atlas/process-packets.js';

const DEFAULT_POLICY: ContextSelectionPolicy = {
  version: 'atlas.context.ace-bridge.v1',
  token_budget: 4800,
  reserved_tokens: 300,
};

function packetKeyFor(prefix: string, id: string | undefined | null, fallbackIndex: number): string {
  const trimmed = (id ?? '').trim();
  return trimmed ? `${prefix}:${trimmed}` : `${prefix}:idx:${fallbackIndex}`;
}

function stableUnique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function inferGraphRevision(context: ACEContext): string {
  for (const item of context.codebaseContext ?? []) {
    const graphRevision = String(item.graphRevision ?? '').trim();
    if (graphRevision) return graphRevision;
  }
  return 'graph:parent-atlas';
}

function inferProcessName(processId: string, items: NonNullable<ACEContext['codebaseContext']>): string {
  const seed = items.find((item) => String(item.featureFamily ?? '').trim())?.featureFamily
    ?? items.find((item) => String(item.routeType ?? '').trim())?.routeType
    ?? items.find((item) => String(item.topoClass ?? '').trim())?.topoClass
    ?? items.find((item) => String(item.dirSummary ?? '').trim())?.dirSummary
    ?? processId;
  return String(seed).trim() || processId;
}

function inferStepSymbolId(item: NonNullable<ACEContext['codebaseContext']>[number]): string {
  const stableKey = String(item.stableKey ?? '').trim();
  if (stableKey) return stableKey;
  const filePath = String(item.filePath ?? '').trim();
  const lineStart = Number.isFinite(item.lineStart as number) ? `:${item.lineStart}` : '';
  const lineEnd = Number.isFinite(item.lineEnd as number) ? `-${item.lineEnd}` : '';
  return `${filePath}${lineStart}${lineEnd}`.trim() || filePath || 'process-step';
}

function groupProcessContext(context: ACEContext): Map<string, NonNullable<ACEContext['codebaseContext']>> {
  const groups = new Map<string, NonNullable<ACEContext['codebaseContext']>>();
  for (const item of context.codebaseContext ?? []) {
    const processIds = stableUnique((item.processIds ?? []).map((value) => String(value)));
    if (!processIds.length) continue;
    for (const processId of processIds) {
      const bucket = groups.get(processId) ?? [];
      bucket.push(item);
      groups.set(processId, bucket);
    }
  }
  return groups;
}

export function deriveProcessPacketsFromACEContext(context: ACEContext): AtlasProcessPacket[] {
  const graphRevision = inferGraphRevision(context);
  const grouped = groupProcessContext(context);

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([processId, items]) => {
      const sourceRefs = stableUnique(items.map((item) => String(item.filePath ?? '').trim()).filter(Boolean));
      const stepSymbolIds = stableUnique(items.map((item) => inferStepSymbolId(item)));
      const name = inferProcessName(processId, items);
      return buildAtlasProcessPacket({
        processId,
        name,
        sourceRefs,
        stepSymbolIds,
        dbTables: [],
        tools: [],
        endpoints: [],
        caches: [],
        graphRevision,
      }).packet;
    });
}

function fromCodebaseContext(context: ACEContext): ContextCandidate[] {
  return (context.codebaseContext ?? []).map((item, index) => ({
    packet_key: packetKeyFor('code', item.stableKey ?? item.filePath, index),
    source_ref: item.filePath,
    content: item.content ?? '',
    lanes: ['dense'] as ContextLane[],
    relevance: Number.isFinite(item.score) ? item.score : 0,
    authority: item.graphAuthorityScore ?? undefined,
  }));
}

function fromRetrievalResults(
  results: ACEContext['ragChunks'] | undefined,
  lane: ContextLane
): ContextCandidate[] {
  return (results ?? []).map((item, index) => ({
    packet_key: packetKeyFor(lane, item.packetKey ?? item.sourceRef ?? item.id, index),
    source_ref: item.sourceRef ?? item.filePath,
    content: item.content ?? item.summary ?? '',
    lanes: [lane],
    relevance: Number.isFinite(item.score) ? item.score : 0,
  }));
}

function fromKagNeighbors(context: ACEContext): ContextCandidate[] {
  return (context.kagNeighbors ?? []).map((n, index) => ({
    packet_key: packetKeyFor('kag', n.nodeId, index),
    content: n.title ?? '',
    lanes: ['graph'] as ContextLane[],
    relevance: Number.isFinite(n.score) ? (n.score as number) : 0.5,
    graph_distance: 1,
  }));
}

function fromProcessPackets(processPackets: AtlasProcessPacket[] | undefined): ContextCandidate[] {
  return (processPackets ?? []).map((packet, index) => ({
    packet_key: packet.packetKey || packetKeyFor('process', packet.processId, index),
    process_id: packet.processId,
    feature_id: packet.processId,
    source_ref: packet.sourceRefs[0] ?? packet.packetKey,
    content: [
      packet.name,
      `processId=${packet.processId}`,
      packet.stepSymbolIds.length > 0 ? `steps=${packet.stepSymbolIds.join(' -> ')}` : 'steps=none',
      packet.dbTables.length > 0 ? `tables=${packet.dbTables.join(',')}` : 'tables=none',
      packet.tools.length > 0 ? `tools=${packet.tools.join(',')}` : 'tools=none',
      packet.endpoints.length > 0 ? `endpoints=${packet.endpoints.join(',')}` : 'endpoints=none',
      packet.caches.length > 0 ? `caches=${packet.caches.join(',')}` : 'caches=none',
    ].join(' | '),
    lanes: ['graph'] as ContextLane[],
    relevance: 0.7,
    authority: 0.65,
    freshness: 0.75,
    graph_distance: 0,
  }));
}

export interface ACEContextManifestOptions {
  request_id: string;
  feature_id?: string;
  source_refs?: string[];
  processPackets?: AtlasProcessPacket[];
  policy?: Partial<ContextSelectionPolicy>;
  now?: Date;
}

/**
 * Compiles a deterministic ContextManifest from an already-assembled ACEContext,
 * without re-running retrieval and without mutating the input.
 */
export function buildContextManifestFromACE(
  context: ACEContext,
  opts: ACEContextManifestOptions
): CompiledContext {
  const processPackets = opts.processPackets ?? context.processPackets ?? undefined;
  const candidates: ContextCandidate[] = [
    ...fromCodebaseContext(context),
    ...fromProcessPackets(processPackets),
    ...fromRetrievalResults(context.ragChunks, 'dense'),
    ...fromRetrievalResults(context.kbChunks, 'lexical'),
    ...fromRetrievalResults(context.caseChunks, 'exact'),
    ...fromRetrievalResults(context.docChunks, 'lexical'),
    ...fromKagNeighbors(context),
  ];

  return compileContext({
    request_id: opts.request_id,
    feature_id: opts.feature_id,
    source_refs: opts.source_refs,
    now: opts.now,
    candidates,
    policy: { ...DEFAULT_POLICY, ...opts.policy },
  });
}

export function attachContextManifestToACE(
  context: ACEContext,
  opts: ACEContextManifestOptions
): ACEContext {
  return {
    ...context,
    contextManifest: buildContextManifestFromACE(context, opts).manifest,
  };
}
