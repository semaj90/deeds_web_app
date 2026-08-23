/**
 * Canonical representation registry for the active Atlas lane map.
 *
 * This module intentionally excludes legacy 384-dimensional lanes from the
 * canonical lookup surface. Legacy lineage belongs in migration-only tooling
 * and must not be imported by the normal retrieval path.
 */

export enum RepresentationStatus {
  ACTIVE = 'ACTIVE',
  REFERENCE_ONLY = 'REFERENCE_ONLY',
  EXPERIMENTAL = 'EXPERIMENTAL',
  SUPERSEDED = 'SUPERSEDED',
  UNKNOWN = 'UNKNOWN',
}

export type CanonicalRepresentationName =
  | 'semantic_768'
  | 'semantic_512'
  | 'semantic_256'
  | 'semantic_128'
  | 'latent_64'
  | 'lexical_v1';

export type RepresentationDimension = 768 | 512 | 256 | 128 | 64;

export type CanonicalRepresentationKey = {
  name: CanonicalRepresentationName;
  dimension: RepresentationDimension;
};

export interface RepresentationDeployment {
  name: CanonicalRepresentationName;
  dimension: RepresentationDimension;
  postgresColumn: string;
  qdrantCollection: string;
  isLiveCanonical: boolean;
  expectedDimension: RepresentationDimension;
}

export interface AuditedRepresentation {
  canonicalName: CanonicalRepresentationName;
  dimension: RepresentationDimension;
  status: RepresentationStatus;
  deployment: RepresentationDeployment;
  sourceAuditInfo: {
    source_ref: string | null;
    feature_id: string | null;
    last_updated: Date | null;
  };
}

export class CanonicalRegistryAudit {
  private representations: Map<string, AuditedRepresentation>;

  constructor() {
    this.representations = new Map<string, AuditedRepresentation>();
  }

  public runInitialAudit(): void {
    console.log('Registry audit started');

    const semantic768: RepresentationDeployment = {
      name: 'semantic_768',
      dimension: 768,
      postgresColumn: 'content_embedding',
      qdrantCollection: 'codebase_chunks_768',
      isLiveCanonical: true,
      expectedDimension: 768,
    };

    this.addRepresentation(
      'semantic_768',
      768,
      RepresentationStatus.ACTIVE,
      semantic768,
      {
        source_ref: null,
        feature_id: null,
        last_updated: null,
      }
    );

    console.log('Audit complete. Registry populated with canonical 768 mapping.');
  }

  private addRepresentation(
    name: CanonicalRepresentationName,
    dimension: RepresentationDimension,
    status: RepresentationStatus,
    deployment: RepresentationDeployment,
    auditInfo: {
      source_ref: string | null;
      feature_id: string | null;
      last_updated: Date | null;
    }
  ): void {
    this.representations.set(name, {
      canonicalName: name,
      dimension,
      status,
      deployment,
      sourceAuditInfo: auditInfo,
    });
  }

  public getRegistry(): Map<string, AuditedRepresentation> {
    return this.representations;
  }
}
