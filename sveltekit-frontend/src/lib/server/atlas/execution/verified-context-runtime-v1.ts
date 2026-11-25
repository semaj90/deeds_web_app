import {
  VerifiedContextRequestV1Schema,
  VerifiedContextWorkspaceScopeV1Schema,
  refuseVerifiedContextV1,
  type VerifiedContextRequestV1,
  type VerifiedContextServiceV1,
  type VerifiedContextWorkspaceScopeV1,
} from './verified-context-service-v1.js';
import {
  resolveTrustedWorkspaceAuthorityV1,
  type TrustedWorkspaceAuthorityV1,
} from '$lib/server/retrieval/trusted-workspace-authority-v1.js';

export type VerifiedContextAuthorizeScopeFnV1 = (input: {
  actorId: string;
  request: VerifiedContextRequestV1;
  authority: Extract<TrustedWorkspaceAuthorityV1, { status: 'TRUSTED' }>;
}) => Promise<VerifiedContextWorkspaceScopeV1 | { status: 'BLOCKED'; reason: string }>;

export interface VerifiedContextRuntimeDepsV1 {
  authorizeWorkspaceScope?: VerifiedContextAuthorizeScopeFnV1;
}

export const VERIFIED_CONTEXT_MISSING_PROVIDERS_V1 = [
  'authorizeWorkspaceScope',
  'resolveQueryRepresentation',
  'retrieveTopKInput',
  'resolveFeatureSnapshot',
  'tokenizer',
  'promptTemplateRevision',
  'instructionRevision',
] as const;

export const VERIFIED_CONTEXT_TOPK_INPUT_REQUIREMENTS_V1 = [
  'ordinalMap',
  'columnar',
  'snapshot',
  'sourceFetchPort',
  'graphifyLifecycle',
] as const;

// The route now performs in-memory checksum validation and hydration before model inference.
export const VERIFIED_CONTEXT_FINAL_HANDOFF_GAPS_V1 = [] as const;

function runtimeStatusDetails(requestId: string, missingProviders: readonly string[] = []) {
  return {
    requestId,
    serviceHealth: 'REGISTERED_FAIL_CLOSED',
    agentExecutionStatus: 'NOT_STARTED',
    canonicalEvidenceValidity: 'NOT_ADMITTED',
    agentRunId: null,
    traceId: null,
    missingProviders,
    searchRuntimeInputRequirements: VERIFIED_CONTEXT_TOPK_INPUT_REQUIREMENTS_V1,
    finalHandoffGaps: VERIFIED_CONTEXT_FINAL_HANDOFF_GAPS_V1,
  };
}

export function createVerifiedContextRuntimeV1(
  resolveAuthority = resolveTrustedWorkspaceAuthorityV1,
  deps: VerifiedContextRuntimeDepsV1 = {},
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

      if (deps.authorizeWorkspaceScope) {
        let scopeResult: VerifiedContextWorkspaceScopeV1 | { status: 'BLOCKED'; reason: string };
        try {
          scopeResult = await deps.authorizeWorkspaceScope({
            actorId,
            request: parsed.data,
            authority,
          });
        } catch {
          return refuseVerifiedContextV1(
            parsed.data.requestId,
            'WORKSPACE_GRANT_READBACK_UNAVAILABLE',
            'WORKSPACE_AUTHORIZATION',
            runtimeStatusDetails(parsed.data.requestId),
          );
        }
        if (scopeResult.status !== 'AUTHORIZED') {
          return refuseVerifiedContextV1(
            parsed.data.requestId,
            scopeResult.reason,
            'WORKSPACE_AUTHORIZATION',
            runtimeStatusDetails(parsed.data.requestId),
          );
        }

        let scope: VerifiedContextWorkspaceScopeV1;
        try {
          scope = VerifiedContextWorkspaceScopeV1Schema.parse(scopeResult);
        } catch {
          return refuseVerifiedContextV1(
            parsed.data.requestId,
            'WORKSPACE_SCOPE_INVALID',
            'WORKSPACE_AUTHORIZATION',
            runtimeStatusDetails(parsed.data.requestId),
          );
        }
        if (
          scope.actorId !== actorId
          || scope.workspaceId !== parsed.data.workspaceId
          || scope.workspaceRevision !== authority.workspaceRevision
        ) {
          return refuseVerifiedContextV1(
            parsed.data.requestId,
            'WORKSPACE_SCOPE_BINDING_MISMATCH',
            'WORKSPACE_AUTHORIZATION',
            runtimeStatusDetails(parsed.data.requestId),
          );
        }
      }

      const missingProviders = deps.authorizeWorkspaceScope
        ? VERIFIED_CONTEXT_MISSING_PROVIDERS_V1.filter((provider) => provider !== 'authorizeWorkspaceScope')
        : VERIFIED_CONTEXT_MISSING_PROVIDERS_V1;

      return refuseVerifiedContextV1(
        parsed.data.requestId,
        'VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED',
        'SERVICE_CONFIGURATION',
        runtimeStatusDetails(parsed.data.requestId, missingProviders),
      );
    },
  };
}

export const verifiedContextRuntimeV1 = createVerifiedContextRuntimeV1();
