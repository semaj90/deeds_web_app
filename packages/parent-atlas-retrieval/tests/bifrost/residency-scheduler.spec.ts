import { describe, expect, it } from 'vitest';
import {
  MIN_GPU_ADMISSION_BYTES,
  RESIDENCY_RELEASE_SCORE,
  RESIDENCY_PROMOTE_SCORE,
  chooseResidencyTierV1,
  planResidencySchedulerV1,
} from '../../src/bifrost/residency-scheduler';

describe('revision-qualified residency scheduler', () => {
  it('bounds one query to three unique evidence branches and keeps semantic_768 executable', () => {
    const plan = planResidencySchedulerV1({
      workspaceRevision: 'workspace:r1',
      sourceRevision: 'source:r1',
      candidateSnapshotChecksum: 'sha256:candidates',
      requestedCandidateCount: 128,
      requestedBranches: ['LEXICAL', 'SEMANTIC', 'STRUCTURAL', 'GRAPH'],
      derivedRepresentations: ['semantic_mrl_512', 'semantic_mrl_256', 'semantic_mrl_128', 'latent_256', 'latent_128', 'latent_64'],
    });

    expect(plan.selectedBranches).toEqual(['LEXICAL', 'SEMANTIC', 'STRUCTURAL']);
    expect(plan.queryRepresentation).toBe('semantic_768');
    expect(plan.residencyHints[0]).toMatchObject({ representation: 'semantic_768', queryExecutable: true, derivedFrom: null });
    expect(plan.residencyHints.find((hint) => hint.representation === 'semantic_mrl_256')).toMatchObject({ derivedFrom: 'semantic_768', queryExecutable: false });
    expect(plan.residencyHints.find((hint) => hint.representation === 'latent_128')).toMatchObject({ derivedFrom: 'latent_256', queryExecutable: false });
    expect(plan.writesPerformed).toBe(false);
  });

  it('admits GPU only with explicit headroom and otherwise degrades without mutation', () => {
    const plan = planResidencySchedulerV1({
      workspaceRevision: 'workspace:r1',
      sourceRevision: 'source:r1',
      candidateSnapshotChecksum: 'sha256:candidates',
      requestedCandidateCount: 64,
      freeVramBytes: MIN_GPU_ADMISSION_BYTES * 2,
      reservedVramBytes: MIN_GPU_ADMISSION_BYTES,
      gpuAvailable: true,
    });
    expect(plan.executionHeadroom.gpuAdmission).toBe(true);
    expect(plan.residencyHints[0].tier).toBe('HOT_GPU');

    const degraded = planResidencySchedulerV1({
      workspaceRevision: 'workspace:r1',
      sourceRevision: 'source:r1',
      candidateSnapshotChecksum: 'sha256:candidates',
      requestedCandidateCount: 64,
      freeVramBytes: MIN_GPU_ADMISSION_BYTES - 1,
      gpuAvailable: true,
    });
    expect(degraded.executionHeadroom.gpuAdmission).toBe(false);
    expect(degraded.residencyHints[0].tier).toBe('HOT_CPU');
  });

  it('uses hysteresis so ordinary score noise does not thrash hot residency', () => {
    expect(chooseResidencyTierV1({ score: RESIDENCY_PROMOTE_SCORE, currentTier: 'WARM', gpuEligible: true })).toBe('HOT_GPU');
    expect(chooseResidencyTierV1({ score: RESIDENCY_RELEASE_SCORE, currentTier: 'HOT_GPU', gpuEligible: true })).toBe('HOT_GPU');
    expect(chooseResidencyTierV1({ score: RESIDENCY_RELEASE_SCORE - 0.001, currentTier: 'HOT_GPU', gpuEligible: true })).toBe('WARM');
  });
});
