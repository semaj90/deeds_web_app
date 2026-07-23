import { z } from 'zod';

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export const graphSnapshotStatusSchema = z.enum(['draft', 'validated', 'approved', 'failed']);

export const graphSnapshotEdgeSchema = z.object({
  source_packet_key: z.string().min(1),
  target_packet_key: z.string().min(1),
  relation_type: z.string().min(1),
  weight: z.number().finite(),
  source_ref: z.string().min(1),
  processing_pass_id: z.string().min(1),
  evidence_id: z.string().min(1),
  graph_contract_version: z.string().min(1),
});

export const graphSnapshotManifestSchema = z.object({
  graph_snapshot_version: z.string().min(1),
  graph_contract_version: z.string().min(1),
  processing_pass_id: z.string().min(1),
  source_ref: z.string().min(1),
  created_at: z.string().min(1),
  status: graphSnapshotStatusSchema,
  node_count: z.number().int().nonnegative(),
  edge_count: z.number().int().nonnegative(),
  approved: z.boolean(),
  relation_type_counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  networkx: z.record(z.string(), z.unknown()).default({}),
  neo4j_gds: z.record(z.string(), z.unknown()).default({}),
  edges: z.array(graphSnapshotEdgeSchema).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
});

export type GraphSnapshotManifest = z.infer<typeof graphSnapshotManifestSchema>;

export function buildGraphSnapshotManifest(input: unknown): GraphSnapshotManifest {
  return graphSnapshotManifestSchema.parse(input);
}

export function describeGraphSnapshotContract(): string {
  return normalizeText(
    'Graph snapshots are versioned, evidence-backed projections of canonical packet relations with NetworkX validation and Neo4j GDS operational parity.',
  );
}
