import { z } from 'zod';

export const materializationProofStateSchema = z.enum([
  'BATCHING_LOGIC_PROVEN',
  'FULL_MATERIALIZATION_PROVEN',
  'FULL_MATERIALIZATION_NOT_YET_PROVEN',
  'RESUME_SEMANTICS_PROVEN',
  'RESUME_SEMANTICS_NOT_YET_PROVEN',
  'ATOMIC_PUBLICATION_PROVEN',
  'ATOMIC_PUBLICATION_NOT_YET_PROVEN',
  'QDRANT_MIRROR_PROVEN',
  'QDRANT_MIRROR_NOT_YET_PROVEN',
  'IDENTITY_COVERAGE_COMPLETE',
  'IDENTITY_COVERAGE_STILL_PARTIAL',
]);

export const materializationProofDetailSchema = z.object({
  batchingLogic: z.enum(['PROVEN', 'NOT_YET_PROVEN']),
  fullMaterialization: z.enum(['PROVEN', 'NOT_YET_PROVEN']),
  resumeSemantics: z.enum(['PROVEN', 'RESUME_SEMANTICS_NOT_YET_PROVEN']),
  atomicPublication: z.enum(['PROVEN', 'ATOMIC_PUBLICATION_NOT_YET_PROVEN']),
  qdrantMirror: z.enum(['PROVEN', 'NOT_YET_PROVEN']),
  identityCoverage: z.enum(['COMPLETE', 'STILL_PARTIAL']),
});

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isZero(value) {
  return Number.isFinite(value) && value === 0;
}

export function deriveMaterializationProofDetail(summary = {}, options = {}) {
  const batchingLogic = isPositiveInteger(summary.materializedRows) ? 'PROVEN' : 'NOT_YET_PROVEN';
  const fullMaterialization =
    options.fullMaterializationProven === true ? 'PROVEN' : 'NOT_YET_PROVEN';
  const resumeSemantics =
    options.resumeSemanticsProven === true ? 'PROVEN' : 'RESUME_SEMANTICS_NOT_YET_PROVEN';
  const atomicPublication =
    options.atomicPublicationProven === true ? 'PROVEN' : 'ATOMIC_PUBLICATION_NOT_YET_PROVEN';
  const qdrantMirror = options.qdrantMirrorProven === true ? 'PROVEN' : 'NOT_YET_PROVEN';
  const identityCoverage =
    isZero(summary.missingQdrantPointId) &&
    isZero(summary.missingQdrantCollection) &&
    isZero(summary.missingFeatureId) &&
    isZero(summary.missingCanonicalSourceRef)
      ? 'COMPLETE'
      : 'STILL_PARTIAL';

  return materializationProofDetailSchema.parse({
    batchingLogic,
    fullMaterialization,
    resumeSemantics,
    atomicPublication,
    qdrantMirror,
    identityCoverage,
  });
}

export function deriveMaterializationProofStates(detail) {
  const parsed = materializationProofDetailSchema.parse(detail ?? {});
  const states = [];
  if (parsed.batchingLogic === 'PROVEN') states.push('BATCHING_LOGIC_PROVEN');
  if (parsed.fullMaterialization === 'PROVEN') states.push('FULL_MATERIALIZATION_PROVEN');
  else states.push('FULL_MATERIALIZATION_NOT_YET_PROVEN');
  if (parsed.resumeSemantics === 'PROVEN') states.push('RESUME_SEMANTICS_PROVEN');
  else states.push('RESUME_SEMANTICS_NOT_YET_PROVEN');
  if (parsed.atomicPublication === 'PROVEN') states.push('ATOMIC_PUBLICATION_PROVEN');
  else states.push('ATOMIC_PUBLICATION_NOT_YET_PROVEN');
  if (parsed.qdrantMirror === 'PROVEN') states.push('QDRANT_MIRROR_PROVEN');
  else states.push('QDRANT_MIRROR_NOT_YET_PROVEN');
  if (parsed.identityCoverage === 'COMPLETE') states.push('IDENTITY_COVERAGE_COMPLETE');
  else states.push('IDENTITY_COVERAGE_STILL_PARTIAL');
  return [...new Set(states)];
}
