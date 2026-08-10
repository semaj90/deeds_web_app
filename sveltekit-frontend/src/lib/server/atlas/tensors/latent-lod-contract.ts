export type LatentKind = 'DETERMINISTIC_AE' | 'LOW_RANK' | 'VAE_RESEARCH';
export type Fidelity = 'FP32_REFERENCE' | 'FP16_HOT' | 'INT8_WARM' | 'INT4_COLD';

export interface LatentRepresentationManifest {
  representationId: string;
  representationRevision: string;
  sourceRepresentationId: 'semantic_768';
  sourceDimension: 768;
  latentDimension: number;
  kind: LatentKind;
  fidelity: Fidelity;
  deterministic: boolean;
  checkpointHash: string;
}

export function assertProductionLatent(m: LatentRepresentationManifest): void {
  if (m.kind === 'VAE_RESEARCH') throw new Error('VAE_RESEARCH cannot be promoted as deterministic routing truth');
  if (!m.deterministic) throw new Error('production latent must be deterministic');
  if (m.sourceRepresentationId !== 'semantic_768' || m.sourceDimension !== 768) throw new Error('source representation mismatch');
}
