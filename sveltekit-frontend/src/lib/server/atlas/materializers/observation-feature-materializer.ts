import { pool } from '$lib/server/db/client.js';
import {
  ObservationFeatureProjectionV1Schema,
  type ObservationFeatureProjectionV1,
} from '../contracts/observation-feature-projection-v1.js';
import type { ClusterFeatureProjectionV1 } from '../contracts/cluster-feature-projection-v1.js';

export interface ObservationFeatureMaterializationReceiptV1 {
  schema: 'atlas.observation-feature-materialization-receipt.v1';
  packetKey: string;
  sourceRef: string;
  featureRevision: string;
  inputDigest: string;
  operation: 'inserted-or-updated';
  clusterAttached: boolean;
  materializerRevision: 'atlas.observation-feature-materializer.v1';
}

/**
 * Upsert one deterministic ORF-1 projection into the ORF-2 exact-filter table.
 * The database row never mints identity and never stores a semantic vector.
 */
export async function materializeObservationFeatureProjectionV1(
  projectionInput: ObservationFeatureProjectionV1,
  options: {
    workspaceRevision?: number | null;
    cluster?: ClusterFeatureProjectionV1 | null;
  } = {},
): Promise<ObservationFeatureMaterializationReceiptV1> {
  const projection = ObservationFeatureProjectionV1Schema.parse(projectionInput);
  const cluster = options.cluster ?? null;

  if (cluster && (cluster.packetKey !== projection.packetKey || cluster.sourceRef !== projection.sourceRef)) {
    throw new Error('ORF_CLUSTER_IDENTITY_MISMATCH');
  }

  const structuralFlags = {
    hasFunction: projection.hasFunction,
    hasCall: projection.hasCall,
    hasDatabaseAccess: projection.hasDatabaseAccess,
    hasNetworkCall: projection.hasNetworkCall,
    hasTest: projection.hasTest,
    hasErrorHandler: projection.hasErrorHandler,
  };

  await pool.query(
    `INSERT INTO atlas_observation_feature_rows (
       packet_key,
       feature_revision,
       source_ref,
       source_version_receipt_id,
       workspace_revision,
       representation_id,
       representation_revision,
       tree_node_id,
       ontology_classes,
       ast_observation_kinds,
       langextract_classes,
       flattened_tags,
       ontology_mask,
       ast_pattern_mask,
       structural_flags,
       evidence_refs,
       kmeans_cluster_id,
       som_row,
       som_col,
       community_id,
       producer_revision,
       input_digest,
       updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9::text[],$10::text[],$11::text[],$12::text[],
       $13::jsonb,$14::jsonb,$15::jsonb,$16::text[],
       $17,$18,$19,$20,$21,$22,now()
     )
     ON CONFLICT (packet_key, feature_revision)
     DO UPDATE SET
       source_ref = EXCLUDED.source_ref,
       source_version_receipt_id = EXCLUDED.source_version_receipt_id,
       workspace_revision = EXCLUDED.workspace_revision,
       representation_id = EXCLUDED.representation_id,
       representation_revision = EXCLUDED.representation_revision,
       tree_node_id = EXCLUDED.tree_node_id,
       ontology_classes = EXCLUDED.ontology_classes,
       ast_observation_kinds = EXCLUDED.ast_observation_kinds,
       langextract_classes = EXCLUDED.langextract_classes,
       flattened_tags = EXCLUDED.flattened_tags,
       ontology_mask = EXCLUDED.ontology_mask,
       ast_pattern_mask = EXCLUDED.ast_pattern_mask,
       structural_flags = EXCLUDED.structural_flags,
       evidence_refs = EXCLUDED.evidence_refs,
       kmeans_cluster_id = EXCLUDED.kmeans_cluster_id,
       som_row = EXCLUDED.som_row,
       som_col = EXCLUDED.som_col,
       community_id = EXCLUDED.community_id,
       producer_revision = EXCLUDED.producer_revision,
       input_digest = EXCLUDED.input_digest,
       updated_at = now()`,
    [
      projection.packetKey,
      projection.featureRevision,
      projection.sourceRef,
      projection.sourceVersionReceiptId,
      options.workspaceRevision ?? null,
      projection.representationId,
      projection.representationRevision,
      projection.treeNodeId,
      projection.ontologyClasses,
      projection.astObservationKinds,
      projection.langextractClasses,
      projection.flattenedTags,
      JSON.stringify(projection.ontologyMask),
      JSON.stringify(projection.astPatternMask),
      JSON.stringify(structuralFlags),
      projection.evidenceRefs,
      cluster?.kmeans.clusterId ?? null,
      cluster?.som.row ?? null,
      cluster?.som.col ?? null,
      cluster?.graphCommunity.communityId ?? null,
      projection.producerRevision,
      projection.inputDigest,
    ],
  );

  return {
    schema: 'atlas.observation-feature-materialization-receipt.v1',
    packetKey: projection.packetKey,
    sourceRef: projection.sourceRef,
    featureRevision: projection.featureRevision,
    inputDigest: projection.inputDigest,
    operation: 'inserted-or-updated',
    clusterAttached: Boolean(cluster),
    materializerRevision: 'atlas.observation-feature-materializer.v1',
  };
}
