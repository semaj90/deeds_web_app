import {
  EmbeddingContextPlanV1Schema,
  digestEmbeddingInputV1,
  type EmbeddingContextPlanV1,
} from '../atlas/embedding/embedding-context-plan-v1.js';
import {
  digestSemantic768OutputV1,
  validateSemantic768OutputV1,
} from '../atlas/embedding/embedding-runtime-v1.js';

const ONNX_CPU_TOKEN_LIMIT = 512;

type ChallengerBoundary = {
  requestedRepresentationId: 'semantic_768';
  requestedRepresentationRevision: string;
  semanticSpaceParity: 'UNPROVEN';
  canonicalAuthority: false;
  promotionEligible: false;
  planChecksumVerified: false;
};

export type OnnxChallengerBatchItemV1 = ChallengerBoundary & (
  | {
      status: 'PLAN_REJECTED';
      reason: string;
      planChecksum: string | null;
    }
  | {
      status: 'UNAVAILABLE';
      reason: 'EXECUTOR_RETURNED_NO_VECTOR' | 'EXECUTOR_CALL_FAILED';
      planChecksum: string;
      inputChecksum: string;
    }
  | {
      status: 'OUTPUT_REJECTED';
      reason: 'DIMENSION_FINITE_OR_NORMALIZATION_CHECK_FAILED';
      executorId: 'ONNX_CPU_CHALLENGER';
      executionProvider: 'CPUExecutionProvider';
      planChecksum: string;
      inputChecksum: string;
    }
  | {
      status: 'COMPLETE';
      executorId: 'ONNX_CPU_CHALLENGER';
      executionProvider: 'CPUExecutionProvider';
      modelArtifactRevision: null;
      tokenizerRevision: null;
      validation: 'DIMENSION_FINITE_L2_ONLY';
      planChecksum: string;
      inputChecksum: string;
      dimension: 768;
      normalized: true;
      vector: number[];
      outputChecksum: string;
    }
);

export type OnnxCpuEmbed = (text: string) => Promise<number[] | null>;

function rejectedPlan(raw: unknown, reason: string): OnnxChallengerBatchItemV1 {
  const planChecksum = typeof raw === 'object' && raw !== null && 'planChecksum' in raw
    && typeof raw.planChecksum === 'string'
    ? raw.planChecksum
    : null;
  const representationRevision = typeof raw === 'object' && raw !== null
    && 'representationRevision' in raw && typeof raw.representationRevision === 'string'
    ? raw.representationRevision
    : 'unavailable';
  return {
    status: 'PLAN_REJECTED',
    reason,
    planChecksum,
    requestedRepresentationId: 'semantic_768',
    requestedRepresentationRevision: representationRevision,
    semanticSpaceParity: 'UNPROVEN',
    canonicalAuthority: false,
    promotionEligible: false,
    planChecksumVerified: false,
  };
}

function validatePlan(raw: unknown): { plan: EmbeddingContextPlanV1; renderedInput: string } | { rejection: OnnxChallengerBatchItemV1 } {
  const parsed = EmbeddingContextPlanV1Schema.safeParse(raw);
  if (!parsed.success) return { rejection: rejectedPlan(raw, 'EMBEDDING_CONTEXT_PLAN_SCHEMA_INVALID') };

  const plan = parsed.data;
  const renderedInput = plan.renderedInput.trim();
  if (plan.canonicalAuthority !== false) {
    return { rejection: rejectedPlan(raw, 'CANONICAL_AUTHORITY_NOT_ALLOWED') };
  }
  if (plan.estimatedTokens > ONNX_CPU_TOKEN_LIMIT) {
    return { rejection: rejectedPlan(raw, 'ONNX_INPUT_ESTIMATED_TOKEN_LIMIT_EXCEEDED') };
  }
  if (!renderedInput
    || digestEmbeddingInputV1(plan.text) !== plan.inputTextChecksum
    || digestEmbeddingInputV1(renderedInput) !== plan.renderedInputChecksum) {
    return { rejection: rejectedPlan(raw, 'EMBEDDING_CONTEXT_INPUT_CHECKSUM_MISMATCH') };
  }
  return { plan, renderedInput };
}

/**
 * Builds a plan-bound CPU challenger batch adapter. It verifies the shared
 * context-plan schema and text checksums, but never promotes ONNX output into
 * semantic_768: the shared vector validator proves shape/finiteness/L2 only.
 */
export function createOnnxChallengerBatchV1(embedCpu: OnnxCpuEmbed) {
  return async (plans: readonly unknown[]): Promise<OnnxChallengerBatchItemV1[]> => {
    const results: OnnxChallengerBatchItemV1[] = [];
    for (const raw of plans) {
      const checked = validatePlan(raw);
      if ('rejection' in checked) {
        results.push(checked.rejection);
        continue;
      }

      const { plan, renderedInput } = checked;
      const boundary: ChallengerBoundary = {
        requestedRepresentationId: plan.representationId,
        requestedRepresentationRevision: plan.representationRevision,
        semanticSpaceParity: 'UNPROVEN',
        canonicalAuthority: false,
        promotionEligible: false,
        planChecksumVerified: false,
      };
      const base = {
        ...boundary,
        planChecksum: plan.planChecksum,
        inputChecksum: plan.renderedInputChecksum,
      };

      let rawVector: number[] | null;
      try {
        rawVector = await embedCpu(renderedInput);
      } catch {
        results.push({ ...base, status: 'UNAVAILABLE', reason: 'EXECUTOR_CALL_FAILED' });
        continue;
      }
      if (rawVector === null) {
        results.push({ ...base, status: 'UNAVAILABLE', reason: 'EXECUTOR_RETURNED_NO_VECTOR' });
        continue;
      }

      let vector: Float32Array;
      try {
        vector = validateSemantic768OutputV1(rawVector);
      } catch {
        results.push({
          ...base,
          status: 'OUTPUT_REJECTED',
          reason: 'DIMENSION_FINITE_OR_NORMALIZATION_CHECK_FAILED',
          executorId: 'ONNX_CPU_CHALLENGER',
          executionProvider: 'CPUExecutionProvider',
        });
        continue;
      }

      results.push({
        ...base,
        status: 'COMPLETE',
        executorId: 'ONNX_CPU_CHALLENGER',
        executionProvider: 'CPUExecutionProvider',
        modelArtifactRevision: null,
        tokenizerRevision: null,
        validation: 'DIMENSION_FINITE_L2_ONLY',
        dimension: 768,
        normalized: true,
        vector: Array.from(vector),
        outputChecksum: digestSemantic768OutputV1(vector),
      });
    }
    return results;
  };
}
