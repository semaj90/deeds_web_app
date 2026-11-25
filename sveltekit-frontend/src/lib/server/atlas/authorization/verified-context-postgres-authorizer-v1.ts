import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type {
	TrustedWorkspaceAuthorityV1,
} from '$lib/server/retrieval/trusted-workspace-authority-v1.js';
import type {
	VerifiedContextRequestV1,
	VerifiedContextWorkspaceScopeV1,
} from '../execution/verified-context-service-v1.js';
import type { PostgresActorWorkspaceGrantProviderV1 } from './postgres-actor-workspace-grant-provider-v1.js';

type TrustedAuthority = Extract<TrustedWorkspaceAuthorityV1, { status: 'TRUSTED' }>;

/**
 * Resolves an untrusted request workspace selector against current explicit
 * PostgreSQL grants. Exact source refs are required by the current ACE scope
 * contract; directory prefixes are deliberately not expanded here.
 */
export function createVerifiedContextPostgresAuthorizerV1(
	grants: PostgresActorWorkspaceGrantProviderV1,
) {
	return async (input: {
		actorId: string;
		request: VerifiedContextRequestV1;
		authority: TrustedAuthority;
	}): Promise<VerifiedContextWorkspaceScopeV1 | { status: 'BLOCKED'; reason: string }> => {
		const workspaceId = input.request.workspaceId;
		if (!workspaceId) return { status: 'BLOCKED', reason: 'WORKSPACE_ID_REQUIRED' };

		const resolved = await grants.getGrantsForWorkspaceRevision(
			input.actorId,
			workspaceId,
			input.authority.workspaceRevision,
		);
		const permitted = resolved.filter((grant) =>
			grant.status === 'GRANTED'
			&& grant.actorId === input.actorId
			&& grant.workspaceId === workspaceId
			&& grant.workspaceRevision === input.authority.workspaceRevision,
		);
		const repositoryIds = [...new Set(permitted.map((grant) => grant.repositoryId))].sort();
		const allowedSourceRefs = [...new Set(permitted.flatMap((grant) => grant.permittedSourceRefs ?? []))].sort();
		if (repositoryIds.length === 0 || allowedSourceRefs.length === 0) {
			return { status: 'BLOCKED', reason: 'WORKSPACE_GRANT_NOT_FOUND_FOR_REVISION' };
		}

		const grantBindings = permitted
			.map((grant) => ({ repositoryId: grant.repositoryId, grantRevision: grant.grantRevision }))
			.sort((a, b) => a.repositoryId.localeCompare(b.repositoryId, 'en'));
		return {
			status: 'AUTHORIZED',
			actorId: input.actorId,
			workspaceId,
			workspaceRevision: input.authority.workspaceRevision,
			repositoryIds,
			allowedSourceRefs,
			authorityRef: `postgresql:atlas_actor_workspace_source_grants_v1:${canonicalSha256V1({
				schema: 'atlas.verified-context-grant-set.v1',
				actorId: input.actorId,
				workspaceId,
				workspaceRevision: input.authority.workspaceRevision,
				grantBindings,
			})}`,
		};
	};
}
