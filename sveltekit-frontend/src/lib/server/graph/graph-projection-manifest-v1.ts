/**
 * GraphProjectionManifestV1 — GDS-PROJECTION-OWNER-01.
 *
 * This repo has (at minimum) 3 separate Neo4j GDS graph projections that different algorithms
 * read from: `codeTopology` (PageRank + Louvain, `neo4j-gds-client.ts`), `retrievalAnalysis`
 * (agent/strategy graph, `neo4j-gds.ts`), and `packetGraph_leiden` (Leiden,
 * `scripts/atlas/compute-leiden-neo4j.mjs`). A live audit (2026-09-09) confirmed these are NOT
 * incidental naming drift -- they declare genuinely different node-label and relationship-type
 * sets (see `docs/reports/graph-projection-manifest-census-v1.json` for the live numbers).
 * Forcing them to share one literal Neo4j graph without evidence of which relationship/label set
 * is correct for each algorithm's purpose would silently change PageRank/Louvain/Leiden semantics.
 *
 * This module is the auditable, comparable snapshot contract instead: every projection records a
 * `GraphProjectionManifestV1` describing exactly what it is a projection OF (labels, relationship
 * types, node/edge counts) and two checksums that let two manifests be compared for equality
 * without diffing full node/edge lists:
 *
 *   - `sourceMembershipChecksum`: hash of the SORTED set of external node identities (Neo4j
 *     internal `elementId`s, or a caller-supplied stable id list) actually included in the
 *     projection. Two projections with the same membership checksum contain the exact same nodes.
 *   - `ordinalMapChecksum`: hash of the SORTED (externalId -> internal GDS ordinal) pairs. Two
 *     projections can have the same membership but different internal ordinal assignments (GDS
 *     assigns ordinals per-projection); this checksum catches that, which the membership checksum
 *     alone would not.
 *
 * A `graphRevision` is a caller-supplied string (e.g. a source-of-truth git SHA, a Postgres
 * `MAX(updated_at)`, or a monotonic counter) identifying WHEN the underlying graph data was last
 * known to change -- this module does not compute it, since "what counts as a revision" is a
 * decision for the caller's domain (matches this repo's existing `workspaceRevision`/
 * `sourceRevision` pattern elsewhere, not a new mechanism).
 *
 * Once two projections' manifests are confirmed to have IDENTICAL sourceMembershipChecksum and
 * ordinalMapChecksum, algorithms run against either are provably projections over the same
 * snapshot -- comparable results become a mechanical fact, not an assumption.
 */

import { createHash } from 'node:crypto';

export interface GraphProjectionManifestV1 {
  projectionName: string;
  nodeLabels: string[];
  relationshipTypes: string[];
  nodeCount: number;
  edgeCount: number;
  sourceMembershipChecksum: string;
  ordinalMapChecksum: string;
  graphRevision: string | null;
  computedAt: string;
}

export interface OrdinalEntry {
  externalId: string;
  ordinal: number;
}

function stableHash(sortedValues: readonly string[]): string {
  const hash = createHash('sha256');
  for (const value of sortedValues) hash.update(value).update('\n');
  return `sha256:${hash.digest('hex')}`;
}

export function computeSourceMembershipChecksum(externalIds: readonly string[]): string {
  return stableHash([...externalIds].sort());
}

export function computeOrdinalMapChecksum(entries: readonly OrdinalEntry[]): string {
  const pairs = entries
    .map((entry) => `${entry.externalId}::${entry.ordinal}`)
    .sort();
  return stableHash(pairs);
}

export function buildGraphProjectionManifestV1(input: {
  projectionName: string;
  nodeLabels: readonly string[];
  relationshipTypes: readonly string[];
  externalIds: readonly string[];
  ordinalEntries: readonly OrdinalEntry[];
  edgeCount: number;
  graphRevision?: string | null;
}): GraphProjectionManifestV1 {
  return {
    projectionName: input.projectionName,
    nodeLabels: [...input.nodeLabels].sort(),
    relationshipTypes: [...input.relationshipTypes].sort(),
    nodeCount: input.externalIds.length,
    edgeCount: input.edgeCount,
    sourceMembershipChecksum: computeSourceMembershipChecksum(input.externalIds),
    ordinalMapChecksum: computeOrdinalMapChecksum(input.ordinalEntries),
    graphRevision: input.graphRevision ?? null,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Compares two manifests and reports EXACTLY what differs, never just true/false -- a caller
 * deciding whether unification is safe needs the specific divergence (label set vs relationship
 * set vs membership vs ordinal assignment), not a boolean.
 */
export interface GraphProjectionManifestDiffV1 {
  identical: boolean;
  labelSetDiffers: boolean;
  relationshipSetDiffers: boolean;
  membershipDiffers: boolean;
  ordinalAssignmentDiffers: boolean;
  onlyInA: { nodeLabels: string[]; relationshipTypes: string[] };
  onlyInB: { nodeLabels: string[]; relationshipTypes: string[] };
}

export function diffGraphProjectionManifests(
  a: GraphProjectionManifestV1,
  b: GraphProjectionManifestV1,
): GraphProjectionManifestDiffV1 {
  const aLabels = new Set(a.nodeLabels);
  const bLabels = new Set(b.nodeLabels);
  const aRels = new Set(a.relationshipTypes);
  const bRels = new Set(b.relationshipTypes);

  const onlyInA = {
    nodeLabels: a.nodeLabels.filter((l) => !bLabels.has(l)),
    relationshipTypes: a.relationshipTypes.filter((r) => !bRels.has(r)),
  };
  const onlyInB = {
    nodeLabels: b.nodeLabels.filter((l) => !aLabels.has(l)),
    relationshipTypes: b.relationshipTypes.filter((r) => !aRels.has(r)),
  };

  const labelSetDiffers = onlyInA.nodeLabels.length > 0 || onlyInB.nodeLabels.length > 0;
  const relationshipSetDiffers = onlyInA.relationshipTypes.length > 0 || onlyInB.relationshipTypes.length > 0;
  const membershipDiffers = a.sourceMembershipChecksum !== b.sourceMembershipChecksum;
  const ordinalAssignmentDiffers = a.ordinalMapChecksum !== b.ordinalMapChecksum;

  return {
    // NOT just checksum equality: two projections can share every node (same membership
    // checksum, same ordinal assignment) while declaring entirely different relationship types
    // and edge counts (real case found live: codeTopology vs packetGraph_leiden share their
    // Packet nodes but codeTopology adds IMPORTS/CALLS/CONTAINS/etc. edges Leiden never sees).
    // That is NOT "the same snapshot" for algorithm comparability -- Louvain/Leiden/PageRank
    // results depend entirely on which edges exist, not just which nodes exist.
    identical: !membershipDiffers && !ordinalAssignmentDiffers && !relationshipSetDiffers
      && !labelSetDiffers && a.edgeCount === b.edgeCount,
    labelSetDiffers,
    relationshipSetDiffers,
    membershipDiffers,
    ordinalAssignmentDiffers,
    onlyInA,
    onlyInB,
  };
}
