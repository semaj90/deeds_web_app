import { randomUUID } from 'node:crypto';

import { ENV } from '$lib/server/env.server.js';
import {
  OakResolutionEvidenceV1Schema,
  type OakResolutionEvidenceV1,
} from './contracts/oak-resolution-evidence-v1.js';

/**
 * AR-01: typed, fail-closed client for the live OAK kernel (:8095,
 * python/atlas_oak_kernel.py). Bounded calls only: lookup, search,
 * ancestors (via /oak/traverse). Never synthesizes `concept:<raw-label>`
 * on failure -- returns RESOLUTION_UNAVAILABLE instead.
 *
 * Reuses the same base-URL resolution as the existing oak-search admin
 * proxy (ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL ||
 * 'http://127.0.0.1:8095') -- does not introduce a second sidecar owner.
 */

const RESOLVER_REVISION = 'oak-resolution-evidence-client:v1';
const DEFAULT_TIMEOUT_MS = 5000;

function oakSidecarBaseUrl(): string {
  return ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8095';
}

function normalizeLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

function unavailable(requestId: string, rawLabel: string): OakResolutionEvidenceV1 {
  return OakResolutionEvidenceV1Schema.parse({
    schema: 'atlas.oak-resolution-evidence.v1',
    requestId,
    rawLabel,
    normalizedLabel: normalizeLabel(rawLabel),
    resolvedCurie: null,
    preferredLabel: null,
    synonyms: [],
    ancestors: [],
    ontologyRevision: null,
    resolverRevision: RESOLVER_REVISION,
    state: 'RESOLUTION_UNAVAILABLE',
    evidenceRefs: [],
    canonicalAuthority: false,
  });
}

interface OakSearchResponseBody {
  matches?: Array<{ entityId: string; label: string | null }>;
}

interface OakLookupResponseBody {
  label: string | null;
  aliases: string[];
}

interface OakTraversalResponseBody {
  nodes?: Array<{ entityId: string; label: string | null }>;
}

async function oakFetchJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(`${oakSidecarBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Resolve a raw label to a CURIE via the deep OAK kernel (search, then
 * lookup for aliases). Fails closed to RESOLUTION_UNAVAILABLE -- never
 * fabricates a CURIE.
 */
export async function resolveOakEvidenceV1(
  rawLabel: string,
  opts: { timeoutMs?: number } = {}
): Promise<OakResolutionEvidenceV1> {
  const requestId = randomUUID();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const searchResult = await oakFetchJson<OakSearchResponseBody>(
    '/oak/search',
    { query: rawLabel, limit: 5 },
    timeoutMs
  );
  if (searchResult === null) return unavailable(requestId, rawLabel);

  const matches = searchResult.matches ?? [];
  if (matches.length === 0) {
    return OakResolutionEvidenceV1Schema.parse({
      schema: 'atlas.oak-resolution-evidence.v1',
      requestId,
      rawLabel,
      normalizedLabel: normalizeLabel(rawLabel),
      resolvedCurie: null,
      preferredLabel: null,
      synonyms: [],
      ancestors: [],
      ontologyRevision: null,
      resolverRevision: RESOLVER_REVISION,
      state: 'UNRESOLVED',
      evidenceRefs: [`oak:search:${rawLabel}`],
      canonicalAuthority: false,
    });
  }

  const state: 'RESOLVED' | 'AMBIGUOUS' = matches.length === 1 ? 'RESOLVED' : 'AMBIGUOUS';
  const primary = matches[0];

  const lookupResult =
    state === 'RESOLVED'
      ? await oakFetchJson<OakLookupResponseBody>(
          '/oak/lookup',
          { entity_id: primary.entityId, include_aliases: true },
          timeoutMs
        )
      : null;

  return OakResolutionEvidenceV1Schema.parse({
    schema: 'atlas.oak-resolution-evidence.v1',
    requestId,
    rawLabel,
    normalizedLabel: normalizeLabel(rawLabel),
    resolvedCurie: state === 'RESOLVED' ? primary.entityId : null,
    preferredLabel: state === 'RESOLVED' ? (lookupResult?.label ?? primary.label ?? null) : null,
    synonyms: lookupResult?.aliases ?? [],
    ancestors: [],
    ontologyRevision: null,
    resolverRevision: RESOLVER_REVISION,
    state,
    evidenceRefs: matches.map((match) => `oak:entity:${match.entityId}`),
    canonicalAuthority: false,
  });
}

/**
 * Ancestor walk for an already-resolved CURIE, via /oak/traverse.
 * Fails closed to RESOLUTION_UNAVAILABLE.
 */
export async function resolveOakAncestorsV1(
  curie: string,
  opts: { maxDepth?: number; limit?: number; timeoutMs?: number } = {}
): Promise<OakResolutionEvidenceV1> {
  const requestId = randomUUID();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const traversal = await oakFetchJson<OakTraversalResponseBody>(
    '/oak/traverse',
    {
      entity_id: curie,
      direction: 'ancestors',
      max_depth: opts.maxDepth ?? 2,
      limit: opts.limit ?? 100,
    },
    timeoutMs
  );
  if (traversal === null) return unavailable(requestId, curie);

  const nodes = traversal.nodes ?? [];
  return OakResolutionEvidenceV1Schema.parse({
    schema: 'atlas.oak-resolution-evidence.v1',
    requestId,
    rawLabel: curie,
    normalizedLabel: normalizeLabel(curie),
    resolvedCurie: curie,
    preferredLabel: null,
    synonyms: [],
    ancestors: nodes.map((node) => node.entityId),
    ontologyRevision: null,
    resolverRevision: RESOLVER_REVISION,
    state: 'RESOLVED',
    evidenceRefs: nodes.map((node) => `oak:entity:${node.entityId}`),
    canonicalAuthority: false,
  });
}
