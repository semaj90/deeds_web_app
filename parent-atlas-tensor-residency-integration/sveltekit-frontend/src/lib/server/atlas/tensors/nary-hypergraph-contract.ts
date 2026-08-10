export interface HyperedgeMember {
  hyperedgeId: string;
  vertexId: string;
  role: string;
  weight: number;
  sourceRevision?: string;
}

export interface NaryIncidenceArtifact {
  artifactId: string;
  workspaceRevision: string;
  rows: number;
  hyperedgeCount: number;
  vertexCount: number;
  arrowPath: string;
  contentHash: string;
}

export function canonicalizeHyperedgeMembers(members: readonly HyperedgeMember[]): HyperedgeMember[] {
  return [...members].sort((a, b) =>
    a.hyperedgeId.localeCompare(b.hyperedgeId) || a.role.localeCompare(b.role) || a.vertexId.localeCompare(b.vertexId)
  );
}
