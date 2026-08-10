import type { TensorArtifactManifest } from './tensor-artifact-contract';
import type { TensorTileManifest } from './tile-directory';

export interface TensorPacketReadRequest {
  packetKey: string;
  workspaceRevision: string;
  representationRevision?: string;
}

export interface TensorPacketReader {
  getArtifact(artifactId: string): Promise<TensorArtifactManifest | null>;
  getTile(tileKey: string): Promise<TensorTileManifest | null>;
  getPacketTile(packetKey: string, representationRevision?: string): Promise<{ tileId: string; rowOffset: number } | null>;
}
