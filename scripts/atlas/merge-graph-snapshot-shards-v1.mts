#!/usr/bin/env npx tsx
// GRAPH-SNAPSHOT-MERGE-V1-01 (2026-09-28, operator-selected design/build direction).
//
// Deterministically merges the sealed per-repository graph-snapshot shards
// (GRAPH-SNAPSHOT-SCOPE-V2-01's seal-index.json / shards/<slug>/manifest.json, built by
// seal-graph-snapshot-shards-v1.mts) into one workspace-wide manifest, per the design captured in
// openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md.
//
// Design decisions (recorded here, not just in prose, so the code and the doc can't drift):
//  1. Shard bulk data (nodes/edges) is NOT persisted to disk anywhere -- a single-repository
//     export already produced a 147MB JSON file (repo:root alone), which would violate this
//     repo's pre-commit >10MB file-size gate if tracked. Shard manifests stay summary-only
//     (counts + topologyHash + provenance); this script RE-MATERIALIZES each sealed shard's full
//     node/edge set live from Postgres, using the exact (workspaceRevision, executionId,
//     repositoryId, sourceInventorySnapshotId) recorded in that shard's own manifest.json --
//     cross-checked against seal-index.json, fails closed on any mismatch. This is deterministic
//     as long as the admitted revision's underlying Postgres rows don't change between sealing and
//     merging, which this repo's revision-qualification discipline is designed to guarantee.
//  2. Dedup identity is nodeKey / edgeKey, NOT repository position -- per the external review this
//     follows: "if the same canonical node legitimately appears across repository boundaries,
//     dedup by canonical graph identity, not by repository position." nodeKey/edgeKey are already
//     globally-unique-by-construction (packet:<packetKey>, tree:<uuid>) in the current packet-key
//     scheme, so a cross-repo duplicate is not expected in practice today -- but the merge handles
//     it correctly if the packet-key scheme ever changes: two shards claiming the SAME nodeKey/
//     edgeKey with IDENTICAL content (everything except the shard-local `snapshotId`, which
//     topologyHash() already excludes) are deduped and their contributing repositories recorded.
//     Two shards claiming the same key with DIFFERENT content are a NODE_IDENTITY_CONFLICT /
//     EDGE_IDENTITY_CONFLICT -- reported, and BOTH conflicting copies are excluded from the merged
//     set rather than one being arbitrarily kept. This fails closed on the specific conflicting
//     entities without failing the whole merge, since this is diagnostic read-only work, not an
//     admission-critical write.
//  3. Only `sealed: true` shards are merged. Repositories with a shard that isn't sealed (today:
//     6 of 7 -- see seal-index.json) are recorded in `excludedRepositories` with the reason, never
//     silently omitted without a trail.
//  4. The merged manifest gets its own fresh snapshotId; every included node/edge has its
//     `snapshotId` field rewritten to that value (their `snapshotId` field represents provenance
//     to a specific materialization, and the merged output is itself a new, distinct
//     materialization of the union).
//  5. topologyHash is computed via the EXISTING `topologyHash()` export from graph-snapshot.ts --
//     not reimplemented here -- which already sorts by nodeKey/edgeKey and excludes snapshotId,
//     giving a deterministic, ordering-independent, snapshotId-independent digest for free.
//
// Read-only against Postgres (reuses materializeCanonicalGraphSnapshotFromPostgres, which never
// writes). Writes exactly one new small JSON receipt (merged-manifest.json); does not overwrite
// any per-repository shard manifest, the legacy NetworkX/cuGraph parity manifest, or seal-index.json.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-postgres.js';
import { topologyHash, type GraphNode, type GraphEdge } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot.js';

const root = resolve(import.meta.dirname, '..', '..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function withoutSnapshotId<T extends { snapshotId: string }>(value: T): Omit<T, 'snapshotId'> {
  const { snapshotId: _snapshotId, ...rest } = value;
  return rest;
}

function deepEqualIgnoringSnapshotId(a: GraphNode | GraphEdge, b: GraphNode | GraphEdge): boolean {
  return JSON.stringify(withoutSnapshotId(a)) === JSON.stringify(withoutSnapshotId(b));
}

interface ConflictRecord {
  kind: 'NODE_IDENTITY_CONFLICT' | 'EDGE_IDENTITY_CONFLICT';
  key: string;
  repositories: string[];
}

async function main(): Promise<void> {
  const shardsDir = resolve(root, 'sveltekit-frontend/docs/reports/graph-snapshot-parity/shards');
  const sealIndex = readJson('sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/seal-index.json');
  if (!sealIndex.workspaceRevision || !sealIndex.executionId) {
    throw new Error('SEAL_INDEX_MISSING_IDENTITY_FIELDS');
  }

  const sealedShards = (sealIndex.shards ?? []).filter((s: any) => s.sealed === true);
  // 2026-09-28 operator decision (tasks.md "Submodule scope" thread): SUBMODULE repositories are
  // an intentional packet-admission boundary, not a gap -- distinguish that from a genuine unsealed
  // gap on a FIRST_PARTY/UNKNOWN repository so a future reader doesn't mistake one for the other.
  const excludedRepositories = (sealIndex.shards ?? [])
    .filter((s: any) => s.sealed !== true)
    .map((s: any) => ({
      repositoryId: s.repositoryId,
      reason: s.repositoryKind === 'SUBMODULE'
        ? 'SUBMODULE_OUT_OF_PACKET_ADMISSION_SCOPE_BY_DESIGN'
        : 'SHARD_NOT_SEALED_ZERO_QUALIFIED_CONTENT_OR_REPLAY_MISMATCH'
    }));

  if (sealedShards.length === 0) {
    throw new Error('NO_SEALED_SHARDS_TO_MERGE');
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const queryLike: QueryLike = {
    query: async <T = Record<string, unknown>,>(text: string, params?: readonly unknown[]) => {
      const result = await pool.query(text, params as unknown[] | undefined);
      return { rows: result.rows as T[] };
    }
  };

  try {
    const nodesByKey = new Map<string, { node: GraphNode; repositories: Set<string> }>();
    const edgesByKey = new Map<string, { edge: GraphEdge; repositories: Set<string> }>();
    const conflicts: ConflictRecord[] = [];
    const mergedFromRepositories: string[] = [];

    for (const shardSummary of sealedShards) {
      const shardManifest = readJson(shardSummary.manifestPath);
      // Cross-check the shard's own manifest against what seal-index.json claims about it --
      // fail closed on any drift rather than silently trusting a possibly-stale index entry.
      if (
        shardManifest.repositoryId !== shardSummary.repositoryId
        || shardManifest.workspaceRevision !== sealIndex.workspaceRevision
        || shardManifest.executionId !== sealIndex.executionId
        || shardManifest.sealed !== true
      ) {
        throw new Error(`SHARD_MANIFEST_SEAL_INDEX_MISMATCH: ${shardSummary.repositoryId}`);
      }

      const materialization = await materializeCanonicalGraphSnapshotFromPostgres(queryLike, {
        snapshotId: randomUUID(),
        workspaceRevision: shardManifest.workspaceRevision,
        executionId: shardManifest.executionId,
        repositoryId: shardManifest.repositoryId,
        sourceInventorySnapshotId: shardManifest.sourceInventorySnapshotId,
        identityContractVersion: 'identity-contract-v1',
        parserContractVersion: 'tree-sitter-typescript-v1'
      });

      mergedFromRepositories.push(shardManifest.repositoryId);

      for (const node of materialization.graphSnapshotNodes) {
        const existing = nodesByKey.get(node.nodeKey);
        if (!existing) {
          nodesByKey.set(node.nodeKey, { node, repositories: new Set([shardManifest.repositoryId]) });
        } else if (deepEqualIgnoringSnapshotId(existing.node, node)) {
          existing.repositories.add(shardManifest.repositoryId);
        } else {
          conflicts.push({
            kind: 'NODE_IDENTITY_CONFLICT',
            key: node.nodeKey,
            repositories: [...existing.repositories, shardManifest.repositoryId]
          });
        }
      }

      for (const edge of materialization.graphSnapshotEdges) {
        const existing = edgesByKey.get(edge.edgeKey);
        if (!existing) {
          edgesByKey.set(edge.edgeKey, { edge, repositories: new Set([shardManifest.repositoryId]) });
        } else if (deepEqualIgnoringSnapshotId(existing.edge, edge)) {
          existing.repositories.add(shardManifest.repositoryId);
        } else {
          conflicts.push({
            kind: 'EDGE_IDENTITY_CONFLICT',
            key: edge.edgeKey,
            repositories: [...existing.repositories, shardManifest.repositoryId]
          });
        }
      }

      console.log(JSON.stringify({
        status: 'SHARD_MERGED_IN',
        repositoryId: shardManifest.repositoryId,
        nodeCountContributed: materialization.graphSnapshotNodes.length,
        edgeCountContributed: materialization.graphSnapshotEdges.length
      }));
    }

    // Conflicting keys are excluded from the merged set entirely (fail closed on the specific
    // entity, not silently pick a winner) -- collect the conflicting key set first.
    const conflictingNodeKeys = new Set(conflicts.filter((c) => c.kind === 'NODE_IDENTITY_CONFLICT').map((c) => c.key));
    const conflictingEdgeKeys = new Set(conflicts.filter((c) => c.kind === 'EDGE_IDENTITY_CONFLICT').map((c) => c.key));

    const mergedSnapshotId = randomUUID();
    const mergedNodes: GraphNode[] = [...nodesByKey.entries()]
      .filter(([key]) => !conflictingNodeKeys.has(key))
      .map(([, v]) => ({ ...v.node, snapshotId: mergedSnapshotId }))
      .sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
    const mergedEdges: GraphEdge[] = [...edgesByKey.entries()]
      .filter(([key]) => !conflictingEdgeKeys.has(key))
      .map(([, v]) => ({ ...v.edge, snapshotId: mergedSnapshotId }))
      .sort((a, b) => a.edgeKey.localeCompare(b.edgeKey));

    const mergedTopologyHash = topologyHash(mergedNodes, mergedEdges);

    const crossRepositoryDuplicates = [...nodesByKey.entries()]
      .filter(([key, v]) => !conflictingNodeKeys.has(key) && v.repositories.size > 1)
      .map(([key, v]) => ({ nodeKey: key, repositories: [...v.repositories] }));

    const mergedManifest = {
      schema: 'atlas.graph-snapshot-merged-manifest.v1',
      snapshotId: mergedSnapshotId,
      workspaceRevision: sealIndex.workspaceRevision,
      executionId: sealIndex.executionId,
      sourceInventorySnapshotId: sealedShards[0] ? readJson(sealedShards[0].manifestPath).sourceInventorySnapshotId : null,
      mergedFromRepositories,
      excludedRepositories,
      nodeCount: mergedNodes.length,
      edgeCount: mergedEdges.length,
      topologyHash: mergedTopologyHash,
      crossRepositoryDuplicateNodeCount: crossRepositoryDuplicates.length,
      crossRepositoryDuplicates,
      conflicts,
      status: conflicts.length > 0 ? 'MERGED_WITH_CONFLICTS_EXCLUDED' : 'MERGED_NO_CONFLICTS',
      generatedAt: new Date().toISOString()
    };

    mkdirSync(shardsDir, { recursive: true });
    const mergedManifestPath = resolve(shardsDir, 'merged-manifest.json');
    writeFileSync(mergedManifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
      status: 'GRAPH_SNAPSHOT_MERGED',
      mergedManifestPath: 'sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/merged-manifest.json',
      mergedFromRepositories,
      excludedRepositoryCount: excludedRepositories.length,
      nodeCount: mergedManifest.nodeCount,
      edgeCount: mergedManifest.edgeCount,
      conflictCount: conflicts.length,
      topologyHash: mergedTopologyHash
    }));
  } finally {
    await pool.end();
  }
}

await main();
