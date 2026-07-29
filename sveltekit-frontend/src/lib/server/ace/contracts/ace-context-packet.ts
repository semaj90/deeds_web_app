export interface AceEvidence {
  packetKey: string;
  sourceRef: string | null;
  contentHash: string | null;
  treeNodeId?: string | null;
  featureId?: string | null;
  featureLabel?: string | null;
  workspaceRevision?: string | null;
  evidenceKind: 'lexical' | 'semantic' | 'topology' | 'playbook' | 'outcome' | 'tool';
  rawScore: number | null;
  fusedScore: number | null;
  snapshotId?: string | null;
  provenance: string[];
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type AceContextPacket = {
  evidence: AceEvidence[];
  selectedSources?: Array<{
    packetKey?: string;
    sourceRef?: string | null;
    type?: string;
  }>;
};
