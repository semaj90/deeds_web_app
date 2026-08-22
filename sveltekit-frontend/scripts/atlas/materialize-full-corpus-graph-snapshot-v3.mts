#!/usr/bin/env tsx
/**
 * Revision-qualified full-corpus graph materializer.
 * Workspace identity is consumed only from a COMPLETE persisted Graphify
 * workspace manifest. Git HEAD / env revision strings are never accepted as
 * workspace authority.
 *
 * Workspace identity is consumed only from a COMPLETE persisted Graphify
 * workspace manifest. Git HEAD / env revision strings are never accepted as
 * workspace authority. Git coordinates remain provenance on Graphify records.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg, { type PoolClient } from 'pg';

import { materializeGraphSnapshot } from '../../src/lib/server/atlas/graph/graph-snapshot-materializer.js';
import { buildGraphSnapshotRevisionWriteV1, verifyGraphSnapshotRevisionV1 } from '../../src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';
import {
  buildGraphSnapshotRevisionWriteV1,
  verifyGraphSnapshotRevisionV1,
} from '../../src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';
import { bindGraphSnapshotNodeSourceRevisionsV1 } from '../../src/lib/server/atlas/graph/graph-snapshot-source-revision-binding-v1.js';
import { materializeWorkspaceRevisionOriginV1 } from '../../src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from '../../src/lib/server/atlas/indexing/graphify-workspace-manifest-completeness-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, '.tmp', 'graph-snapshot');
const PRODUCER_REVISION = 'materialize-full-corpus-graph-snapshot-v3';
const args = process.argv.slice(2);
const mode = args.includes('--apply') ? 'apply' : args.includes('--verify') ? 'verify' : 'dry-run';

if (mode === 'apply' && process.env.ATLAS_GRAPH_SNAPSHOT_APPLY !== '1') throw new Error('GRAPH_SNAPSHOT_APPLY_CONFIRMATION_REQUIRED');
if (mode === 'apply' && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('GRAPH_SNAPSHOT_NON_PRODUCTION_DATABASE_REQUIRED');
if (mode === 'apply' && process.env.ATLAS_GRAPH_SNAPSHOT_APPLY !== '1') {
  throw new Error('GRAPH_SNAPSHOT_APPLY_CONFIRMATION_REQUIRED');
}
if (mode === 'apply' && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') {
  throw new Error('GRAPH_SNAPSHOT_NON_PRODUCTION_DATABASE_REQUIRED');
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

function sha256(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function normalizedRef(value: unknown): string { return String(value ?? '').replaceAll('\\','/').replace(/^\.\//,''); }

async function columns(client: PoolClient, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function normalizedRef(value: unknown): string {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

async function columns(client: PoolClient, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `, [table]);
  return new Set(result.rows.map((row) => row.column_name));
}

async function loadCompleteWorkspaceManifest(client: PoolClient) {
  const origin = materializeWorkspaceRevisionOriginV1({ workspaceRoot: REPO_ROOT, repositoryId: 'semaj90/deeds_web_app', producerRevision: PRODUCER_REVISION });
  const runColumns = await columns(client, 'graphify_runs');
  const fileColumns = await columns(client, 'graphify_files');
  const requiredRun = ['run_id','workspace_revision','source_manifest_digest','source_manifest_source_count'];
  const requiredFile = ['source_ref','code_source_revision','content_hash','byte_length','last_seen_run_id'];
  const missingRun = requiredRun.filter((name) => !runColumns.has(name));
  const missingFile = requiredFile.filter((name) => !fileColumns.has(name));
  if (missingRun.length || missingFile.length) throw new Error(`GRAPH_WORKSPACE_MANIFEST_SCHEMA_MISSING:run=${missingRun.join(',')}:file=${missingFile.join(',')}`);

  const runs = await client.query<{
    run_id: string; workspace_revision: string; source_manifest_digest: string; source_manifest_source_count: number;
  }>(`
    SELECT run_id,workspace_revision,source_manifest_digest,source_manifest_source_count
  const origin = materializeWorkspaceRevisionOriginV1({
    workspaceRoot: REPO_ROOT,
    repositoryId: 'semaj90/deeds_web_app',
    producerRevision: PRODUCER_REVISION,
  });

  const runColumns = await columns(client, 'graphify_runs');
  const fileColumns = await columns(client, 'graphify_files');
  const requiredRun = ['run_id', 'workspace_revision', 'source_manifest_digest', 'source_manifest_source_count'];
  const requiredFile = ['source_ref', 'code_source_revision', 'content_hash', 'byte_length', 'last_seen_run_id'];
  const missingRun = requiredRun.filter((name) => !runColumns.has(name));
  const missingFile = requiredFile.filter((name) => !fileColumns.has(name));
  if (missingRun.length || missingFile.length) {
    throw new Error(`GRAPH_WORKSPACE_MANIFEST_SCHEMA_MISSING:run=${missingRun.join(',')}:file=${missingFile.join(',')}`);
  }

  const runs = await client.query<{
    run_id: string;
    workspace_revision: string;
    source_manifest_digest: string;
    source_manifest_source_count: number;
  }>(`
    SELECT run_id, workspace_revision, source_manifest_digest, source_manifest_source_count
    FROM graphify_runs
    WHERE workspace_revision=$1 AND lower(source_manifest_digest)=lower($2)
    ORDER BY completed_at DESC NULLS LAST, started_at DESC, run_id
  `, [origin.record.workspaceRevision, origin.record.sourceManifestDigest]);
  if (runs.rowCount === 0) throw new Error('GRAPH_WORKSPACE_MANIFEST_NOT_COMPLETE:NO_MATCHING_RUN');
  if (runs.rowCount !== 1) throw new Error(`GRAPH_WORKSPACE_MANIFEST_NOT_COMPLETE:AMBIGUOUS_RUNS:${runs.rowCount}`);
  const run = runs.rows[0]!;

  const sources = await client.query<{
    source_ref: string; code_source_revision: string; content_hash: string; byte_length: string | number; last_seen_run_id: string;
  }>(`SELECT source_ref,code_source_revision,content_hash,byte_length,last_seen_run_id FROM graphify_files WHERE last_seen_run_id=$1 ORDER BY source_ref`, [run.run_id]);
  const sourceRows = await client.query<{
    source_ref: string;
    code_source_revision: string;
    content_hash: string;
    byte_length: string | number;
    last_seen_run_id: string;
  }>(`
    SELECT source_ref, code_source_revision, content_hash, byte_length, last_seen_run_id
    FROM graphify_files
    WHERE last_seen_run_id=$1
    ORDER BY source_ref
  `, [run.run_id]);

  const completeness = evaluateGraphifyWorkspaceManifestCompletenessV1({
    workspaceRecord: origin.record,
    sourceBindings: origin.bindings,
    persistedRun: {
      runId: run.run_id,
      workspaceRevision: run.workspace_revision,
      sourceManifestDigest: run.source_manifest_digest,
      sourceManifestSourceCount: Number(run.source_manifest_source_count),
    },
    persistedSources: sources.rows.map((row) => ({
      sourceRef: normalizedRef(row.source_ref),
      codeSourceRevision: row.code_source_revision,
      contentHash: String(row.content_hash).replace(/^sha256:/,'').toLowerCase(),
    persistedSources: sourceRows.rows.map((row) => ({
      sourceRef: normalizedRef(row.source_ref),
      codeSourceRevision: row.code_source_revision,
      contentHash: String(row.content_hash).replace(/^sha256:/, '').toLowerCase(),
      byteLength: Number(row.byte_length),
      lastSeenRunId: row.last_seen_run_id,
    })),
    producerRevision: PRODUCER_REVISION,
  });
  if (!completeness.complete || !completeness.graphMayConsumeWorkspaceRevision) {
    throw new Error(`GRAPH_WORKSPACE_MANIFEST_NOT_COMPLETE:${completeness.status}:${completeness.blockers.join('|')}`);
  }
  return { origin, runId: run.run_id, completeness };
}

function mapTreeNode(r: Record<string, any>) {
  return {
    nodeId: r.node_id, parentId: r.parent_id, rootId: r.root_id ?? r.node_id,
    pageIndexPath: r.page_index_path ?? `node:${r.node_id}`, nodeType: r.node_type,
    treeDepth: r.tree_depth, sourceRef: r.source_ref ?? '', filePath: r.file_path ?? r.source_ref ?? '',
    packetKey: r.packet_key, featureId: r.feature_id, title: r.title, summary: r.summary,
    contentPreview: r.content_preview ?? r.summary ?? null, domain: r.domain ?? null,
    somCluster: r.som_cluster, communityId: r.community_id, metadata: r.metadata ?? {},
    ledgerType: r.ledger_type, lineageVersion: r.lineage_version,
    nodeId: r.node_id,
    parentId: r.parent_id,
    rootId: r.root_id ?? r.node_id,
    pageIndexPath: r.page_index_path ?? `node:${r.node_id}`,
    nodeType: r.node_type,
    treeDepth: r.tree_depth,
    sourceRef: r.source_ref ?? '',
    filePath: r.file_path ?? r.source_ref ?? '',
    packetKey: r.packet_key,
    featureId: r.feature_id,
    title: r.title,
    summary: r.summary,
    contentPreview: r.content_preview ?? r.summary ?? null,
    domain: r.domain ?? null,
    somCluster: r.som_cluster,
    communityId: r.community_id,
    metadata: r.metadata ?? {},
    ledgerType: r.ledger_type,
    lineageVersion: r.lineage_version,
  };
}
function mapPacket(r: Record<string, any>) {
  return {
    packetKey: r.packet_key, sourceRef: r.source_ref ?? '', canonicalSourceRef: r.canonical_source_ref,
    directoryPath: r.directory_path ?? '', filePath: r.file_path, functionSymbol: r.function_symbol,
    featureId: r.feature_id ?? '', featureLabel: r.feature_label ?? '', titleId: r.title_id,
    communityId: r.community_id, clusterId: r.cluster_id, sha256: r.sha256, sourceKind: r.source_kind,
    sourcePath: r.source_path, topology: r.topology ?? {}, vectors: r.vectors ?? {}, metadata: r.metadata ?? {},
    domainClass: r.domain_class, tags: r.tags ?? [], lineageVersion: r.lineage_version, ledgerType: r.ledger_type,
    canonical: r.canonical, treeNodeId: r.tree_node_id, qdrantCollection: r.qdrant_collection, qdrantVectorDim: r.qdrant_vector_dim,
    packetKey: r.packet_key,
    sourceRef: r.source_ref ?? '',
    canonicalSourceRef: r.canonical_source_ref,
    directoryPath: r.directory_path ?? '',
    filePath: r.file_path,
    functionSymbol: r.function_symbol,
    featureId: r.feature_id ?? '',
    featureLabel: r.feature_label ?? '',
    titleId: r.title_id,
    communityId: r.community_id,
    clusterId: r.cluster_id,
    sha256: r.sha256,
    sourceKind: r.source_kind,
    sourcePath: r.source_path,
    topology: r.topology ?? {},
    vectors: r.vectors ?? {},
    metadata: r.metadata ?? {},
    domainClass: r.domain_class,
    tags: r.tags ?? [],
    lineageVersion: r.lineage_version,
    ledgerType: r.ledger_type,
    canonical: r.canonical,
    treeNodeId: r.tree_node_id,
    qdrantCollection: r.qdrant_collection,
    qdrantVectorDim: r.qdrant_vector_dim,
  };
}

async function assertGraphSchemaReady(client: PoolClient) {
  const snapshots = await columns(client, 'atlas_graph_snapshots_v2');
  const nodes = await columns(client, 'atlas_graph_nodes_v2');
  const required = ['workspace_revision','source_inventory_revision','graph_revision','identity_contract_version','parser_contract_version','revision_checksum'];
  const missing = required.filter((name) => !snapshots.has(name));
  if (missing.length || !nodes.has('source_revision')) throw new Error(`GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED:${missing.join(',')}:${nodes.has('source_revision') ? '' : 'source_revision'}`);
}

async function persistSnapshot(client: PoolClient, graph: ReturnType<typeof materializeGraphSnapshot>, revision: ReturnType<typeof buildGraphSnapshotRevisionWriteV1>['revision'], nodes: Array<any>) {
  const sourceManifest = { ...graph.graphSnapshot.sourceManifest, workspaceRevision: revision.workspaceRevision, sourceInventoryRevision: revision.sourceInventoryRevision, graphRevision: revision.graphRevision, revisionChecksum: revision.revisionChecksum, revisionProducer: revision.producerRevision };
  await client.query(`
    INSERT INTO atlas_graph_snapshots_v2
      (snapshot_id,schema_version,status,source_manifest,projection_policy,node_count,edge_count,relation_event_count,excluded_count,unresolved_count,source_hash,topology_hash,policy_hash,eligibility_predicate,workspace_revision,source_inventory_revision,graph_revision,identity_contract_version,parser_contract_version,revision_checksum)
    VALUES ($1,$2,'VALIDATED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
  `, [graph.graphSnapshot.snapshotId, graph.graphSnapshot.schemaVersion, JSON.stringify(sourceManifest), JSON.stringify(graph.graphSnapshot.projectionPolicy), graph.graphSnapshot.nodeCount, graph.graphSnapshot.edgeCount, graph.graphSnapshot.relationEventCount, graph.graphSnapshot.excludedCount, graph.graphSnapshot.unresolvedCount, graph.graphSnapshot.sourceHash, graph.graphSnapshot.topologyHash, graph.graphSnapshot.policyHash, graph.graphSnapshot.eligibilityPredicate, revision.workspaceRevision, revision.sourceInventoryRevision, revision.graphRevision, revision.identityContractVersion, revision.parserContractVersion, revision.revisionChecksum]);

  const BATCH = 750;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const batch = nodes.slice(i, i + BATCH); const values: unknown[] = [];
    const placeholders = batch.map((n,index) => { const o=index*9; values.push(n.snapshotId,n.nodeKey,n.nodeType,n.packetKey,n.nodeType==='packet'?null:n.treeNodeId,n.sourceRef,n.sourceRevision,n.contentHash,JSON.stringify(n.properties)); return `(${Array.from({length:9},(_,j)=>`$${o+j+1}`).join(',')})`; }).join(',');
    await client.query(`INSERT INTO atlas_graph_nodes_v2 (snapshot_id,node_key,node_type,packet_key,tree_node_id,source_ref,source_revision,content_hash,properties) VALUES ${placeholders}`, values);
  }
  for (let i = 0; i < graph.graphSnapshotEdges.length; i += BATCH) {
    const batch=graph.graphSnapshotEdges.slice(i,i+BATCH); const values:unknown[]=[];
    const placeholders=batch.map((e,index)=>{const o=index*9;values.push(e.snapshotId,e.edgeKey,e.sourceNodeKey,e.targetNodeKey,e.edgeType,e.weight,e.confidence,e.provenance,JSON.stringify(e.properties));return `(${Array.from({length:9},(_,j)=>`$${o+j+1}`).join(',')})`;}).join(',');
    await client.query(`INSERT INTO atlas_graph_edges_v2 (snapshot_id,edge_key,source_node_key,target_node_key,edge_type,weight,confidence,provenance,properties) VALUES ${placeholders}`,values);
  }
  for (let i=0;i<graph.graphSnapshotExclusions.length;i+=BATCH){const batch=graph.graphSnapshotExclusions.slice(i,i+BATCH);const values:unknown[]=[];const placeholders=batch.map((e,index)=>{const o=index*7;values.push(e.snapshotId,e.candidateKey,e.packetKey,e.sourceRef,e.exclusionStage,e.exclusionReason,JSON.stringify(e.evidence??{}));return `(${Array.from({length:7},(_,j)=>`$${o+j+1}`).join(',')})`;}).join(',');await client.query(`INSERT INTO atlas_graph_snapshot_exclusions_v2 (snapshot_id,candidate_key,packet_key,source_ref,exclusion_stage,exclusion_reason,evidence) VALUES ${placeholders}`,values);}
  const snapshot = await columns(client, 'atlas_graph_snapshots_v2');
  const node = await columns(client, 'atlas_graph_nodes_v2');
  const requiredSnapshot = [
    'workspace_revision', 'source_inventory_revision', 'graph_revision',
    'identity_contract_version', 'parser_contract_version', 'revision_checksum',
  ];
  const missing = requiredSnapshot.filter((name) => !snapshot.has(name));
  if (missing.length || !node.has('source_revision')) {
    throw new Error(`GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED:${missing.join(',')}:${node.has('source_revision') ? '' : 'source_revision'}`);
  }
}

async function persistSnapshot(client: PoolClient, run: ReturnType<typeof materializeGraphSnapshot>, revision: ReturnType<typeof buildGraphSnapshotRevisionWriteV1>['revision'], nodes: Array<any>) {
  const sourceManifest = {
    ...run.graphSnapshot.sourceManifest,
    workspaceRevision: revision.workspaceRevision,
    sourceInventoryRevision: revision.sourceInventoryRevision,
    graphRevision: revision.graphRevision,
    revisionChecksum: revision.revisionChecksum,
    revisionProducer: revision.producerRevision,
  };
  await client.query(`
    INSERT INTO atlas_graph_snapshots_v2
      (snapshot_id, schema_version, status, source_manifest, projection_policy,
       node_count, edge_count, relation_event_count, excluded_count, unresolved_count,
       source_hash, topology_hash, policy_hash, eligibility_predicate,
       workspace_revision, source_inventory_revision, graph_revision,
       identity_contract_version, parser_contract_version, revision_checksum)
    VALUES ($1,$2,'VALIDATED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
  `, [
    run.graphSnapshot.snapshotId, run.graphSnapshot.schemaVersion,
    JSON.stringify(sourceManifest), JSON.stringify(run.graphSnapshot.projectionPolicy),
    run.graphSnapshot.nodeCount, run.graphSnapshot.edgeCount, run.graphSnapshot.relationEventCount,
    run.graphSnapshot.excludedCount, run.graphSnapshot.unresolvedCount,
    run.graphSnapshot.sourceHash, run.graphSnapshot.topologyHash, run.graphSnapshot.policyHash,
    run.graphSnapshot.eligibilityPredicate, revision.workspaceRevision, revision.sourceInventoryRevision,
    revision.graphRevision, revision.identityContractVersion, revision.parserContractVersion,
    revision.revisionChecksum,
  ]);

  const BATCH = 750;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const batch = nodes.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders = batch.map((n, index) => {
      const offset = index * 9;
      values.push(n.snapshotId, n.nodeKey, n.nodeType, n.packetKey, n.nodeType === 'packet' ? null : n.treeNodeId,
        n.sourceRef, n.sourceRevision, n.contentHash, JSON.stringify(n.properties));
      return `(${Array.from({ length: 9 }, (_, j) => `$${offset + j + 1}`).join(',')})`;
    }).join(',');
    await client.query(`INSERT INTO atlas_graph_nodes_v2
      (snapshot_id,node_key,node_type,packet_key,tree_node_id,source_ref,source_revision,content_hash,properties)
      VALUES ${placeholders}`, values);
  }
  for (let i = 0; i < run.graphSnapshotEdges.length; i += BATCH) {
    const batch = run.graphSnapshotEdges.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders = batch.map((e, index) => {
      const offset = index * 9;
      values.push(e.snapshotId, e.edgeKey, e.sourceNodeKey, e.targetNodeKey, e.edgeType, e.weight, e.confidence, e.provenance, JSON.stringify(e.properties));
      return `(${Array.from({ length: 9 }, (_, j) => `$${offset + j + 1}`).join(',')})`;
    }).join(',');
    await client.query(`INSERT INTO atlas_graph_edges_v2
      (snapshot_id,edge_key,source_node_key,target_node_key,edge_type,weight,confidence,provenance,properties)
      VALUES ${placeholders}`, values);
  }
  for (let i = 0; i < run.graphSnapshotExclusions.length; i += BATCH) {
    const batch = run.graphSnapshotExclusions.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders = batch.map((e, index) => {
      const offset = index * 7;
      values.push(e.snapshotId, e.candidateKey, e.packetKey, e.sourceRef, e.exclusionStage, e.exclusionReason, JSON.stringify(e.evidence ?? {}));
      return `(${Array.from({ length: 7 }, (_, j) => `$${offset + j + 1}`).join(',')})`;
    }).join(',');
    await client.query(`INSERT INTO atlas_graph_snapshot_exclusions_v2
      (snapshot_id,candidate_key,packet_key,source_ref,exclusion_stage,exclusion_reason,evidence)
      VALUES ${placeholders}`, values);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query(mode === 'apply' ? 'BEGIN' : 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const manifest = await loadCompleteWorkspaceManifest(client);
    const workspaceRevision = manifest.completeness.workspaceRevision;
    const [tree,packets] = await Promise.all([client.query('SELECT * FROM atlas_tree_nodes ORDER BY node_id'),client.query('SELECT * FROM atlas_packets ORDER BY packet_key')]);
    const treeNodes=tree.rows.map(mapTreeNode); const packetRows=packets.rows.map(mapPacket);
    const sourceQueryHash=sha256({workspaceRevision,graphifyRunId:manifest.runId,treeCount:treeNodes.length,packetCount:packetRows.length});

    const build=()=>{const snapshotId=randomUUID();const input={snapshotId,workspaceId:'workspace:parent-atlas',sourceInventorySnapshotId:`sha256:${manifest.origin.record.sourceManifestDigest}`,identityContractVersion:'identity-contract-v1',parserContractVersion:'tree-sitter-typescript-v1',generatedAt:new Date().toISOString(),treeNodes,packets:packetRows};const graph=materializeGraphSnapshot(input);const sourceBinding=bindGraphSnapshotNodeSourceRevisionsV1({workspaceRecord:manifest.origin.record,bindings:manifest.origin.bindings,nodes:graph.graphSnapshotNodes,producerRevision:PRODUCER_REVISION});if(!sourceBinding.receipt.completeCoverage)throw new Error(`GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE:${sourceBinding.receipt.missingSourceRefs.join('|')}`);const revisionWrite=buildGraphSnapshotRevisionWriteV1({snapshotId,workspaceRevision,sourceInventoryRevision:`sha256:${graph.graphSnapshotProof.sourceInventoryHash}`,identityContractVersion:input.identityContractVersion,parserContractVersion:input.parserContractVersion,sourceInventoryHash:graph.graphSnapshotProof.sourceInventoryHash,topologyHash:graph.graphSnapshotProof.topologyHash,policyHash:graph.graphSnapshotProof.policyHash,producerRevision:PRODUCER_REVISION});return{graph,sourceBinding,revisionWrite};};
    const first=build(); let replay:ReturnType<typeof build>|null=null;
    if(mode==='verify'||mode==='apply'){replay=build();if(first.graph.graphSnapshotManifest.topologyHash!==replay.graph.graphSnapshotManifest.topologyHash||first.revisionWrite.revision.graphRevision!==replay.revisionWrite.revision.graphRevision)throw new Error('GRAPH_SNAPSHOT_REPLAY_REVISION_MISMATCH');}

    if(mode==='apply'){
      await assertGraphSchemaReady(client);await persistSnapshot(client,first.graph,first.revisionWrite.revision,first.sourceBinding.nodes);
      const readback=await client.query(`SELECT snapshot_id,source_manifest,source_hash,topology_hash,policy_hash,workspace_revision,source_inventory_revision,graph_revision,identity_contract_version,parser_contract_version,revision_checksum FROM atlas_graph_snapshots_v2 WHERE snapshot_id=$1`,[first.graph.graphSnapshot.snapshotId]);
      if(readback.rowCount!==1)throw new Error('GRAPH_SNAPSHOT_REVISION_READBACK_MISSING');const row=readback.rows[0];verifyGraphSnapshotRevisionV1({schema:'atlas.graph-snapshot-revision.v1',snapshotId:row.snapshot_id,workspaceRevision:row.workspace_revision,sourceInventoryRevision:row.source_inventory_revision,graphRevision:row.graph_revision,identityContractVersion:row.identity_contract_version,parserContractVersion:row.parser_contract_version,sourceInventoryHash:row.source_hash,topologyHash:row.topology_hash,policyHash:row.policy_hash,producerRevision:row.source_manifest.revisionProducer,revisionChecksum:row.revision_checksum});await client.query('COMMIT');
    } else await client.query('ROLLBACK');

    const report={schema:'atlas.full-corpus-graph-snapshot-proof.v3',mode,workspaceAuthority:'PERSISTED_COMPLETE_GRAPHIFY_MANIFEST',gitWorkspaceFallbackAccepted:false,envWorkspaceFallbackAccepted:false,graphifyRunId:manifest.runId,workspaceManifestCompleteness:manifest.completeness,workspaceRevision,sourceQueryHash,snapshotId:first.graph.graphSnapshot.snapshotId,graphRevision:first.revisionWrite.revision.graphRevision,revisionChecksum:first.revisionWrite.revision.revisionChecksum,topologyHash:first.graph.graphSnapshotManifest.topologyHash,sourceInventoryHash:first.graph.graphSnapshotProof.sourceInventoryHash,nodeSourceBinding:first.sourceBinding.receipt,nodeCount:first.graph.graphSnapshotManifest.nodeCount,edgeCount:first.graph.graphSnapshotManifest.edgeCount,replayGraphRevision:replay?.revisionWrite.revision.graphRevision??null,replayTopologyHash:replay?.graph.graphSnapshotManifest.topologyHash??null,canonicalWritesAttempted:mode==='apply',qdrantWritesAttempted:false,neo4jWritesAttempted:false};
    await mkdir(REPORT_DIR,{recursive:true});const output=path.resolve(REPORT_DIR,`full-corpus-graph-snapshot-${mode}-v3.json`);await writeFile(output,`${JSON.stringify(report,null,2)}\n`,'utf8');console.log(JSON.stringify({status:mode==='apply'?'GRAPH_SNAPSHOT_PERSISTED_READBACK_VERIFIED':'GRAPH_SNAPSHOT_REVISION_QUALIFIED_DRY_PROOF',output,workspaceRevision,graphRevision:report.graphRevision,graphifyRunId:manifest.runId},null,2));
  } catch(error){try{await client.query('ROLLBACK');}catch{}throw error;} finally{client.release();await pool.end();}
}
main().catch((error)=>{console.error('FAILED:',error instanceof Error?error.message:String(error));process.exitCode=1;});

    const [tree, packets] = await Promise.all([
      client.query('SELECT * FROM atlas_tree_nodes ORDER BY node_id'),
      client.query('SELECT * FROM atlas_packets ORDER BY packet_key'),
    ]);
    const treeNodes = tree.rows.map(mapTreeNode);
    const packetRows = packets.rows.map(mapPacket);
    const sourceQueryHash = sha256({ workspaceRevision, graphifyRunId: manifest.runId, treeCount: treeNodes.length, packetCount: packetRows.length });

    const build = () => {
      const snapshotId = randomUUID();
      const input = {
        snapshotId,
        workspaceId: 'workspace:parent-atlas',
        sourceInventorySnapshotId: `sha256:${manifest.origin.record.sourceManifestDigest}`,
        identityContractVersion: 'identity-contract-v1',
        parserContractVersion: 'tree-sitter-typescript-v1',
        generatedAt: new Date().toISOString(),
        treeNodes,
        packets: packetRows,
      };
      const graph = materializeGraphSnapshot(input);
      const sourceBinding = bindGraphSnapshotNodeSourceRevisionsV1({
        workspaceRecord: manifest.origin.record,
        bindings: manifest.origin.bindings,
        nodes: graph.graphSnapshotNodes,
        producerRevision: PRODUCER_REVISION,
      });
      if (!sourceBinding.receipt.completeCoverage) {
        throw new Error(`GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE:${sourceBinding.receipt.missingSourceRefs.join('|')}`);
      }
      const revisionWrite = buildGraphSnapshotRevisionWriteV1({
        snapshotId,
        workspaceRevision,
        sourceInventoryRevision: `sha256:${graph.graphSnapshotProof.sourceInventoryHash}`,
        identityContractVersion: input.identityContractVersion,
        parserContractVersion: input.parserContractVersion,
        sourceInventoryHash: graph.graphSnapshotProof.sourceInventoryHash,
        topologyHash: graph.graphSnapshotProof.topologyHash,
        policyHash: graph.graphSnapshotProof.policyHash,
        producerRevision: PRODUCER_REVISION,
      });
      return { input, graph, sourceBinding, revisionWrite };
    };

    const first = build();
    let replay: ReturnType<typeof build> | null = null;
    if (mode === 'verify' || mode === 'apply') {
      replay = build();
      if (first.graph.graphSnapshotManifest.topologyHash !== replay.graph.graphSnapshotManifest.topologyHash
        || first.revisionWrite.revision.graphRevision !== replay.revisionWrite.revision.graphRevision) {
        throw new Error('GRAPH_SNAPSHOT_REPLAY_REVISION_MISMATCH');
      }
    }

    if (mode === 'apply') {
      await assertGraphSchemaReady(client);
      await persistSnapshot(client, first.graph, first.revisionWrite.revision, first.sourceBinding.nodes);
      const readback = await client.query(`
        SELECT snapshot_id,source_manifest,source_hash,topology_hash,policy_hash,
               workspace_revision,source_inventory_revision,graph_revision,
               identity_contract_version,parser_contract_version,revision_checksum
        FROM atlas_graph_snapshots_v2 WHERE snapshot_id=$1
      `, [first.graph.graphSnapshot.snapshotId]);
      if (readback.rowCount !== 1) throw new Error('GRAPH_SNAPSHOT_REVISION_READBACK_MISSING');
      const row = readback.rows[0];
      verifyGraphSnapshotRevisionV1({
        schema: 'atlas.graph-snapshot-revision.v1', snapshotId: row.snapshot_id,
        workspaceRevision: row.workspace_revision, sourceInventoryRevision: row.source_inventory_revision,
        graphRevision: row.graph_revision, identityContractVersion: row.identity_contract_version,
        parserContractVersion: row.parser_contract_version, sourceInventoryHash: row.source_hash,
        topologyHash: row.topology_hash, policyHash: row.policy_hash,
        producerRevision: row.source_manifest.revisionProducer, revisionChecksum: row.revision_checksum,
      });
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    const report = {
      schema: 'atlas.full-corpus-graph-snapshot-proof.v3',
      mode,
      workspaceAuthority: 'PERSISTED_COMPLETE_GRAPHIFY_MANIFEST',
      gitWorkspaceFallbackAccepted: false,
      envWorkspaceFallbackAccepted: false,
      graphifyRunId: manifest.runId,
      workspaceManifestCompleteness: manifest.completeness,
      workspaceRevision,
      sourceQueryHash,
      snapshotId: first.graph.graphSnapshot.snapshotId,
      graphRevision: first.revisionWrite.revision.graphRevision,
      revisionChecksum: first.revisionWrite.revision.revisionChecksum,
      topologyHash: first.graph.graphSnapshotManifest.topologyHash,
      sourceInventoryHash: first.graph.graphSnapshotProof.sourceInventoryHash,
      nodeSourceBinding: first.sourceBinding.receipt,
      nodeCount: first.graph.graphSnapshotManifest.nodeCount,
      edgeCount: first.graph.graphSnapshotManifest.edgeCount,
      replayGraphRevision: replay?.revisionWrite.revision.graphRevision ?? null,
      replayTopologyHash: replay?.graph.graphSnapshotManifest.topologyHash ?? null,
      canonicalWritesAttempted: mode === 'apply',
      qdrantWritesAttempted: false,
      neo4jWritesAttempted: false,
    };
    await mkdir(REPORT_DIR, { recursive: true });
    const output = path.resolve(REPORT_DIR, `full-corpus-graph-snapshot-${mode}-v3.json`);
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: mode === 'apply' ? 'GRAPH_SNAPSHOT_PERSISTED_READBACK_VERIFIED' : 'GRAPH_SNAPSHOT_REVISION_QUALIFIED_DRY_PROOF', output, workspaceRevision, graphRevision: report.graphRevision, graphifyRunId: manifest.runId }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
