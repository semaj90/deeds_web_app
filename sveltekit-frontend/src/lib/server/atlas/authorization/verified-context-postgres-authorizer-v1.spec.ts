import { describe, expect, it, vi } from 'vitest';
import { createVerifiedContextPostgresAuthorizerV1 } from './verified-context-postgres-authorizer-v1.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const authority = {
	status: 'TRUSTED' as const,
	workspaceRevision,
	source: 'OPERATOR_PIN' as const,
	receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT' as const,
	resolverRevision: 'atlas.trusted-workspace-resolver.v1',
};

const grant = {
	schema: 'atlas.actor-workspace-grant.v1' as const,
	actorId: 'actor-1',
	actorType: 'USER' as const,
	workspaceId,
	workspaceRevision,
	repositoryId: 'deeds-web-app',
	permittedSourceRefs: ['src/routes/+page.svelte'],
	grantRevision: `sha256:${'b'.repeat(64)}`,
	status: 'GRANTED' as const,
	authoritativeOwner: 'postgresql:public.atlas_actor_workspace_source_grants_v1',
	issuedAt: '2026-11-24T00:00:00.000Z',
	canonicalAuthority: false as const,
	writesPerformed: false as const,
};

describe('verified-context PostgreSQL workspace authorizer', () => {
	it('authorizes only the actor, workspace, and trusted revision read back from grants', async () => {
		const grants = { getGrantsForWorkspaceRevision: vi.fn().mockResolvedValue([grant]) };
		const authorize = createVerifiedContextPostgresAuthorizerV1(grants as never);

		const result = await authorize({
			actorId: 'actor-1',
			request: { requestId: 'req-1', query: 'find route', workspaceId },
			authority,
		});

		expect(grants.getGrantsForWorkspaceRevision).toHaveBeenCalledWith('actor-1', workspaceId, workspaceRevision);
		expect(result).toMatchObject({
			status: 'AUTHORIZED', actorId: 'actor-1', workspaceId, workspaceRevision,
			repositoryIds: ['deeds-web-app'], allowedSourceRefs: ['src/routes/+page.svelte'],
			authorityRef: expect.stringMatching(/^postgresql:atlas_actor_workspace_source_grants_v1:[a-f0-9]{64}$/),
		});
	});

	it('blocks a grant from another workspace revision', async () => {
		const grants = {
			getGrantsForWorkspaceRevision: vi.fn().mockResolvedValue([
				{ ...grant, workspaceRevision: `sha256:${'c'.repeat(64)}` },
			]),
		};
		const authorize = createVerifiedContextPostgresAuthorizerV1(grants as never);

		await expect(authorize({
			actorId: 'actor-1',
			request: { requestId: 'req-2', query: 'find route', workspaceId },
			authority,
		})).resolves.toEqual({ status: 'BLOCKED', reason: 'WORKSPACE_GRANT_NOT_FOUND_FOR_REVISION' });
	});

	it('rejects a missing workspace selector without reading grants', async () => {
		const grants = { getGrantsForWorkspaceRevision: vi.fn().mockResolvedValue([grant]) };
		const authorize = createVerifiedContextPostgresAuthorizerV1(grants as never);

		await expect(authorize({
			actorId: 'actor-1',
			request: { requestId: 'req-3', query: 'find route' },
			authority,
		})).resolves.toEqual({ status: 'BLOCKED', reason: 'WORKSPACE_ID_REQUIRED' });
		expect(grants.getGrantsForWorkspaceRevision).not.toHaveBeenCalled();
	});
});
