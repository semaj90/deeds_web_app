import {
  CanonicalRepresentationName,
  RepresentationDeployment,
} from './canonical_representation_registry.js';

export const REPRESENTATION_DEPLOYMENT_MAP: Partial<
  Record<CanonicalRepresentationName, RepresentationDeployment>
> = {
  semantic_768: {
    name: 'semantic_768',
    dimension: 768,
    postgresColumn: 'content_embedding',
    qdrantCollection: 'codebase_chunks_768',
    isLiveCanonical: true,
    expectedDimension: 768,
  },
};

export function getDeploymentMap(
  name: CanonicalRepresentationName
): RepresentationDeployment {
  const deployment = REPRESENTATION_DEPLOYMENT_MAP[name];
  if (!deployment) {
    throw new Error(
      `No physical deployment map found for canonical name: ${name}`
    );
  }

  return deployment;
}
