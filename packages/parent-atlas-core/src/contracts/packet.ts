/**
 * Dependency-free ranked packet contract shared by Parent Atlas packages.
 * Identity remains revision-qualified when available; projection identifiers
 * are metadata and never replace packet identity.
 */
export interface RankedPacket {
  packetKey: string;
  sourceRef: string;
  content: string;
  score: number;
  rank: number;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
  contentChecksum?: string | null;
  featureId?: string | null;
  featureLabel?: string | null;
  metadata?: Record<string, unknown>;
}
