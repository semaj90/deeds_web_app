import {
  VerifiedContextRequestV1Schema,
  refuseVerifiedContextV1,
  type VerifiedContextServiceV1,
} from './verified-context-service-v1.js';
import { resolveTrustedWorkspaceAuthorityV1 } from '$lib/server/retrieval/trusted-workspace-authority-v1.js';

export const VERIFIED_CONTEXT_MISSING_PROVIDERS_V1 = [
  'authorized_workspace_scope',
  'query_representation',
  'search_runtime_topk_input',
  'source_byte_span_reader',
  'current_feature_snapshot_admission',
  'context_manifest_admission',
  'prompt_plan_tokenizer_and_revisions',
  'immutable_context_packet_hydrator',
] as const;

function runtimeStatusDetails(requestId: string, missingProviders: readonly string[] = []) {
  return {
    requestId,
    serviceHealth: 'REGISTERED_FAIL_CLOSED',
    agentExecutionStatus: 'NOT_STARTED',
    canonicalEvidenceValidity: 'NOT_ADMITTED',
    agentRunId: null,
    traceId: null,
    missingProviders,
  };
}

export function createVerifiedContextRuntimeV1(
  resolveAuthority = resolveTrustedWorkspaceAuthorityV1,
): VerifiedContextServiceV1 {
  return {
    async execute(actorId, requestInput) {
      const parsed = VerifiedContextRequestV1Schema.safeParse(requestInput);
      if (!parsed.success) {
        return refuseVerifiedContextV1('invalid-request', 'VERIFIED_CONTEXT_REQUEST_INVALID', 'REQUEST_VALIDATION');
      }
      if (!actorId?.trim()) {
        return refuseVerifiedContextV1(parsed.data.requestId, 'AUTHENTICATED_ACTOR_REQUIRED', 'WORKSPACE_AUTHORITY');
      }

      let authority;
      try {
        authority = await resolveAuthority();
      } catch {
        return refuseVerifiedContextV1(parsed.data.requestId, 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', 'WORKSPACE_AUTHORITY');
      }
      if (authority.status !== 'TRUSTED') {
        return refuseVerifiedContextV1(
          parsed.data.requestId,
          'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
          'WORKSPACE_AUTHORITY',
          runtimeStatusDetails(parsed.data.requestId),
        );
      }

      return refuseVerifiedContextV1(
        parsed.data.requestId,
        'VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED',
        'SERVICE_CONFIGURATION',
        runtimeStatusDetails(parsed.data.requestId, VERIFIED_CONTEXT_MISSING_PROVIDERS_V1),
      );
    },
  };
}

export const verifiedContextRuntimeV1 = createVerifiedContextRuntimeV1();
