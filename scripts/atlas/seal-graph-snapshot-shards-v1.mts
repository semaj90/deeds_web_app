#!/usr/bin/env npx tsx
// GRAPH-SNAPSHOT-SCOPE-V2-01 follow-up, per-repository seal shape (2026-09-28, operator-selected
// direction -- see openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
//
// Materializes one graph-snapshot shard per real repository partition
// (graphify_execution_file_membership_v2.repository_id) at the CANONICAL admitted workspace
// revision + selected execution, and writes a per-repository sealed manifest plus a top-level
// seal index. Does NOT touch atlas_packets, atlas_tree_nodes, or any other Postgres table --
// read-only against Postgres, write-only to local JSON receipt files under
// sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/.
//
// Does NOT overwrite or replace sveltekit-frontend/docs/reports/graph-snapshot-parity/manifest.json
// -- that is a separate, older NetworkX/cuGraph parity artifact with its own schema
// (nodeTableHash/edgeTableHash/parquet files) and its own real consumers; this script's output
// lives in a new `shards/` subdirectory instead of conflating the two.
//
// Fails closed rather than guessing: both the selected-execution-owner decision and the
// workspace-snapshot-binding receipt must exist, agree with each other, and carry
// canonicalAuthority/authority === true before any shard is materialized. Per this repo's own
// "grep for an existing owner-decision before minting anything" rule, this script reads those
// two existing owner-decision artifacts rather than re-deriving or hardcoding the admitted
// revision / execution_id.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-postgres.js';
import { readSubmodulePaths, classifyRepositoryId } from './lib/gitmodules-registry.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function slugifyRepositoryId(repositoryId: string): string {
  // repository_id values look like "repo:root", "repo:sites/parent-atlas-gateboard" -- strip the
  // "repo:" prefix and replace anything that isn't filesystem-safe with a hyphen so nested slashes
  // don't get interpreted as extra directory levels.
  const stripped = repositoryId.replace(/^repo:/, '');
  const slug = stripped.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'unknown';
}

async function main(): Promise<void> {
  const ownerExecution = readJson('docs/reports/selected-graphify-execution-owner-v1.json');
  if (ownerExecution.status !== 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED' || ownerExecution.canonicalAuthority !== true) {
    throw new Error(`SELECTED_EXECUTION_OWNER_NOT_AUTHORITATIVE: status=${ownerExecution.status} canonicalAuthority=${ownerExecution.canonicalAuthority}`);
  }
  const executionId: string = ownerExecution.selectedExecutionId;
  const workspaceRevision: string = ownerExecution.candidate.workspaceRevision;

  const snapshotBinding = readJson('docs/reports/graphify-workspace-snapshot-binding-v1.json');
  if (snapshotBinding.workspaceAuthorityAdmitted !== true) {
    throw new Error(`WORKSPACE_SNAPSHOT_BINDING_NOT_ADMITTED: workspaceAuthorityAdmitted=${snapshotBinding.workspaceAuthorityAdmitted}`);
  }
  if (snapshotBinding.admittedWorkspaceRevision !== workspaceRevision) {
    throw new Error(`WORKSPACE_REVISION_MISMATCH: selectedExecutionOwner=${workspaceRevision} snapshotBinding=${snapshotBinding.admittedWorkspaceRevision}`);
  }
  const sourceInventorySnapshotId: string = snapshotBinding.snapshotRevision;
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceInventorySnapshotId)) {
    throw new Error(`SOURCE_INVENTORY_SNAPSHOT_ID_NOT_SHA256: ${sourceInventorySnapshotId}`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const queryLike: QueryLike = {
    query: async <T = Record<string, unknown>,>(text: string, params?: readonly unknown[]) => {
      const result = await pool.query(text, params as unknown[] | undefined);
      return { rows: result.rows as T[] };
    }
  };

  try {
    const repoRows = await pool.query<{ repository_id: string; member_count: number }>(
      `SELECT repository_id, count(*)::int AS member_count
       FROM graphify_execution_file_membership_v2
       WHERE workspace_revision = $1 AND execution_id = $2
       GROUP BY repository_id
       ORDER BY repository_id`,
      [workspaceRevision, executionId]
    );
    const repositories = repoRows.rows;
    if (repositories.length === 0) {
      throw new Error('NO_REPOSITORIES_FOUND_FOR_ADMITTED_EXECUTION');
    }

    const shardsDir = resolve(root, 'sveltekit-frontend/docs/reports/graph-snapshot-parity/shards');
    mkdirSync(shardsDir, { recursive: true });

    // Operator decision, 2026-09-28 (see tasks.md "Submodule scope" thread): canonical packet
    // admission stays scoped to this project's own authored source (repo:root); the 6 real
    // git-submodule repositories (external third-party code, vendored) are graphified for
    // cross-reference/navigation context only, deliberately never packet-admitted. Classified here
    // so downstream consumers (the seal-index, the merge script, the fabric audit) can tell an
    // intentional boundary apart from a genuine unsealed gap, rather than treating both the same.
    const submodulePaths = readSubmodulePaths(root);

    const shardSummaries: Array<Record<string, unknown>> = [];

    for (const { repository_id: repositoryId, member_count: memberCount } of repositories) {
      const repositoryKind = classifyRepositoryId(repositoryId, submodulePaths);
      const snapshotId = randomUUID();
      const materialization = await materializeCanonicalGraphSnapshotFromPostgres(queryLike, {
        snapshotId,
        workspaceRevision,
        executionId,
        repositoryId,
        sourceInventorySnapshotId,
        identityContractVersion: 'identity-contract-v1',
        parserContractVersion: 'tree-sitter-typescript-v1'
      });

      const slug = slugifyRepositoryId(repositoryId);
      const shardDir = resolve(shardsDir, slug);
      mkdirSync(shardDir, { recursive: true });
      const manifestPath = resolve(shardDir, 'manifest.json');
      const sealedAt = new Date().toISOString();
      // Requires nodeCount > 0, not just a non-erroring empty materialization. Found live
      // (2026-09-28): 6 of the 7 real repositories have membership rows but zero corresponding
      // atlas_packets rows with a non-null source_revision/workspace_revision_key (i.e. the
      // packets that exist for those repos' source_refs are legacy, never revision-qualified --
      // not a join bug, verified by direct query). Treating a structurally-empty shard as
      // "sealed" would silently launder that real data gap into a passing predicate -- an empty
      // shard for a repository with real membership means nothing has actually been sealed for
      // it, not that there was nothing to seal.
      const sealed = materialization.graphSnapshotProof.replayMatches === true
        && materialization.graphSnapshotManifest.status === 'MATERIALIZED'
        && materialization.graphSnapshotManifest.nodeCount > 0;

      const shardManifest = {
        schema: 'atlas.graph-snapshot-shard-manifest.v1',
        repositoryId,
        repositoryKind,
        executionId,
        workspaceRevision,
        sourceInventorySnapshotId,
        memberCount,
        snapshotId,
        nodeCount: materialization.graphSnapshotManifest.nodeCount,
        edgeCount: materialization.graphSnapshotManifest.edgeCount,
        topologyHash: materialization.graphSnapshotManifest.topologyHash,
        materializerStatus: materialization.graphSnapshotManifest.status,
        replayMatches: materialization.graphSnapshotProof.replayMatches,
        // True by construction: workspaceRevision came from the owner-decision doc read above,
        // not from an arbitrary caller-supplied argument, so every shard this script produces is
        // bound to the admitted revision by definition -- there is no code path where this could
        // be a stale/mismatched value within a single run of this script.
        boundToAdmittedWorkspaceRevision: true,
        sealed,
        sealedAt
      };
      writeFileSync(manifestPath, `${JSON.stringify(shardManifest, null, 2)}\n`, 'utf8');

      const relativeManifestPath = `sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/${slug}/manifest.json`;
      shardSummaries.push({
        repositoryId,
        repositoryKind,
        slug,
        manifestPath: relativeManifestPath,
        memberCount,
        nodeCount: shardManifest.nodeCount,
        edgeCount: shardManifest.edgeCount,
        topologyHash: shardManifest.topologyHash,
        sealed
      });
      console.log(JSON.stringify({ status: 'SHARD_SEALED', repositoryId, repositoryKind, nodeCount: shardManifest.nodeCount, edgeCount: shardManifest.edgeCount, sealed }));
    }

    // "sealed" (unqualified) = every real repository partition, submodules included -- the raw
    // fact, unchanged in meaning from before this operator decision.
    const allShardsSealed = shardSummaries.every((s) => s.sealed === true);
    // "sealed within packet-admission scope" = every FIRST_PARTY/UNKNOWN repository is sealed;
    // SUBMODULE repositories are excluded from this bar by the 2026-09-28 operator decision
    // (canonical packet admission is scoped to this project's own authored source). This is the
    // field GRAPH_MANIFEST_SEALED's PASS computation now reads -- see audit-canonical-projection-fabric.mjs.
    const inScopeShards = shardSummaries.filter((s) => s.repositoryKind !== 'SUBMODULE');
    const allInScopeShardsSealed = inScopeShards.length > 0 && inScopeShards.every((s) => s.sealed === true);
    const sealIndex = {
      schema: 'atlas.graph-snapshot-seal-index.v1',
      generatedAt: new Date().toISOString(),
      workspaceRevision,
      executionId,
      sourceInventorySnapshotId,
      repositoryCount: repositories.length,
      allShardsSealed,
      allInScopeShardsSealed,
      // NOT a claim about Neo4j consumption or the older NetworkX/cuGraph parity artifact's
      // table-hash verifiability -- those remain separate, unaddressed gaps. This index only
      // certifies that every in-scope (non-submodule) repository partition of the admitted
      // revision has a materialized, replay-matched graph snapshot shard.
      shards: shardSummaries
    };
    const indexPath = resolve(shardsDir, 'seal-index.json');
    writeFileSync(indexPath, `${JSON.stringify(sealIndex, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: 'SEAL_INDEX_WRITTEN',
      indexPath: 'sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/seal-index.json',
      repositoryCount: sealIndex.repositoryCount,
      allShardsSealed,
      allInScopeShardsSealed
    }));
  } finally {
    await pool.end();
  }
}

await main();
