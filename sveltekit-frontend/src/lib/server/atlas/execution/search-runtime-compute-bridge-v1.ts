import {
  selectCandidateFeatureRowsWithOrdinalBitsetV1,
  type CandidateOrdinalBitsetSelectionArtifactV1,
} from '../features/candidate-ordinal-bitset-selection-v1.js';
import {
  buildComputeDescriptorV1,
  encodeComputeDescriptorV1,
  type ComputeDescriptorV1,
} from './compute-descriptor-v1.js';
import type { MessagePackEnvelope } from '../transport/messagepack-transport-v1.js';
import type { TensorArtifactManifestV1 } from '../tensors/tensor-artifact-manifest-v1.js';
import {
  executeSearchRuntimeTopKV1,
  type SearchRuntimeTopKCallerInputV1,
  type SearchRuntimeTopKExecutionResultV1,
} from './search-runtime-topk-caller-v1.js';

export interface SearchRuntimeComputeBridgeResultV1 {
  schema: 'atlas.search-runtime-compute-bridge-result.v1';
  status: 'DESCRIPTOR_VALIDATED' | 'BLOCKED_TOPK_VERIFICATION' | 'BLOCKED_CONTEXT_ADMISSION';
  executionResult: SearchRuntimeTopKExecutionResultV1;
  descriptors: readonly ComputeDescriptorV1[];
  descriptorEnvelopes: readonly MessagePackEnvelope[];
  writesPerformed: false;
  canonicalAuthority: false;
}

export function executeSearchRuntimeWithComputeBridgeV1(input: {
  search: SearchRuntimeTopKCallerInputV1;
  selection: CandidateOrdinalBitsetSelectionArtifactV1;
  inputArtifactManifest: TensorArtifactManifestV1;
  operation: ComputeDescriptorV1['operation'];
  executorHint: ComputeDescriptorV1['executorHint'];
}): SearchRuntimeComputeBridgeResultV1 {
  const eligibleRows = selectCandidateFeatureRowsWithOrdinalBitsetV1({
    ordinalMap: input.search.ordinalMap,
    featureSnapshot: input.search.snapshot,
    selection: input.selection,
  });
  const eligibleOrdinals = new Set(eligibleRows.map((row) => row.candidateOrdinal));
  const requestedOrdinals = input.search.candidateOrdinals
    ?? input.search.ordinalMap.candidates.map((candidate) => candidate.candidateOrdinal);
  const candidateOrdinals = requestedOrdinals.filter((ordinal) => eligibleOrdinals.has(ordinal));
  if (candidateOrdinals.length === 0) throw new Error('COMPUTE_BRIDGE_NO_ELIGIBLE_TOPK_CANDIDATES');

  const executionResult = executeSearchRuntimeTopKV1({
    ...input.search,
    candidateOrdinals,
  });
  if (executionResult.verification.status !== 'VERIFIED_PASS') {
    return {
      schema: 'atlas.search-runtime-compute-bridge-result.v1',
      status: 'BLOCKED_TOPK_VERIFICATION',
      executionResult,
      descriptors: [],
      descriptorEnvelopes: [],
      writesPerformed: false,
      canonicalAuthority: false,
    };
  }
  if (executionResult.contextManifestAdmission.status !== 'ADMITTED') {
    return {
      schema: 'atlas.search-runtime-compute-bridge-result.v1',
      status: 'BLOCKED_CONTEXT_ADMISSION',
      executionResult,
      descriptors: [],
      descriptorEnvelopes: [],
      writesPerformed: false,
      canonicalAuthority: false,
    };
  }

  const descriptors = executionResult.execution.selected.map((selected) => {
    const candidate = input.search.ordinalMap.candidates[selected.ordinal];
    if (!candidate) throw new Error(`COMPUTE_BRIDGE_TOPK_ORDINAL_NOT_IN_MAP:${selected.ordinal}`);
    if (candidate.canonicalId !== selected.canonicalId || candidate.packetKey === null) {
      throw new Error(`COMPUTE_BRIDGE_TOPK_IDENTITY_MISMATCH:${selected.ordinal}`);
    }
    return buildComputeDescriptorV1({
      packetKey: candidate.packetKey,
      operation: input.operation,
      executorHint: input.executorHint,
      ordinalMap: input.search.ordinalMap,
      featureSnapshot: input.search.snapshot,
      selection: input.selection,
      inputArtifactManifest: input.inputArtifactManifest,
      topKExecution: executionResult.execution,
    });
  });
  const descriptorEnvelopes = descriptors.map(encodeComputeDescriptorV1);

  return {
    schema: 'atlas.search-runtime-compute-bridge-result.v1',
    status: 'DESCRIPTOR_VALIDATED',
    executionResult,
    descriptors,
    descriptorEnvelopes,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
