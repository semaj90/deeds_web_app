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

const DEFAULT_POLICY: ContextSelectionPolicy = {
  version: 'atlas.context.ace-bridge.v1',
  token_budget: 4800,
  reserved_tokens: 300,
};

function packetKeyFor(prefix: string, id: string | undefined | null, fallbackIndex: number): string {
  const trimmed = (id ?? '').trim();
  return trimmed ? `${prefix}:${trimmed}` : `${prefix}:idx:${fallbackIndex}`;
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

export interface ACEContextManifestOptions {
  request_id: string;
  feature_id?: string;
  source_refs?: string[];
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
  const candidates: ContextCandidate[] = [
    ...fromCodebaseContext(context),
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
