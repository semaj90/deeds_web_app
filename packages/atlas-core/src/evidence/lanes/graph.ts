import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface GraphEvidenceSummary {
  backend: 'networkx' | 'neo4j' | 'cugraph';
  snapshotId?: string;
  graphRevision?: string;
  nodeCount?: number;
  relationshipCount?: number;
  status: 'PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN' | 'CONTRADICTED';
  note?: string;
}

export function graphSummaryToEvidence(summary: GraphEvidenceSummary): EvidenceItem {
  return {
    kind: 'graph_analysis',
    lane: 'dependency_graph',
    status: summary.status,
    source: summary.backend,
    message: summary.note ?? `${summary.nodeCount ?? 0} nodes / ${summary.relationshipCount ?? 0} relationships`,
    revision: summary.graphRevision,
    score: summary.status === 'PROVEN' ? 1 : 0.6,
  };
}
