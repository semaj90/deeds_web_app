import { describe, expect, it, vi } from 'vitest';
import type { WorktreeLeaseRow } from '../../db/schema/worktree-leases.js';
import {
	AuthoritativeCachedGrantProvider,
	verifyActorWorkspaceAccessV1,
} from './actor-workspace-grant-v1.js';
import {
	WorktreeLeaseGrantProvider,
	mapWorktreeLeaseToActorWorkspaceGrantV1,
} from './worktree-lease-grant-provider-v1.js';

describe('WORKTREE-LEASE-GRANT-PROVIDER-01', () => {
	const baseRow: WorktreeLeaseRow = {
		leaseId: '11111111-1111-1111-1111-111111111111',
		taskId: 'task-workspace-1',
		runId: 'run-workspace-1',
		ownerAgent: 'agent-alice',
		repositoryRoot: 'repo-deeds',
		worktreePath: 'c:/worktrees/task-1',
		branchName: 'feature/atlas-rbac',
		baseCommit: 'commit-sha-1234',
		allowedPaths: ['src/lib/server/atlas/', 'src/lib/components/'],
		forbiddenPaths: ['src/secrets/'],
		status: 'ACTIVE',
		acquiredAt: '2026-10-24T10:00:00.000Z',
		heartbeatAt: '2026-10-24T12:00:00.000Z',
		expiresAt: '2026-10-25T14:00:00.000Z',
		releasedAt: null,
		fenceEpoch: 42,
		metadata: {},
		createdAt: '2026-10-24T10:00:00.000Z',
		updatedAt: '2026-10-24T12:00:00.000Z',
	};

	it('maps an active, unexpired lease to a GRANTED ActorWorkspaceGrantV1', () => {
		const grant = mapWorktreeLeaseToActorWorkspaceGrantV1(
			baseRow,
			'repo-deeds',
			Date.parse('2026-10-24T11:00:00.000Z'),
		);

		expect(grant.status).toBe('GRANTED');
		expect(grant.actorId).toBe('agent-alice');
		expect(grant.actorType).toBe('SERVICE');
		expect(grant.workspaceId).toBe('task-workspace-1');
		expect(grant.repositoryId).toBe('repo-deeds');
		expect(grant.grantRevision).toBe('epoch-42');
		expect(grant.permittedPrefixes).toEqual(['src/lib/server/atlas/', 'src/lib/components/']);
		expect(grant.canonicalAuthority).toBe(false);
		expect(grant.writesPerformed).toBe(false);
	});

	it('maps an expired lease to DENIED with GRANT_REVISION_EXPIRED', () => {
		const expiredRow: WorktreeLeaseRow = {
			...baseRow,
			expiresAt: '2026-10-24T10:30:00.000Z',
		};
		const grant = mapWorktreeLeaseToActorWorkspaceGrantV1(
			expiredRow,
			'repo-deeds',
			Date.parse('2026-10-24T11:00:00.000Z'),
		);

		expect(grant.status).toBe('DENIED');
		expect(grant.denialReason).toBe('GRANT_REVISION_EXPIRED');
		expect(grant.grantRevision).toBe('epoch-42');
	});

	it('maps a released or archived lease to DENIED with GRANT_REVOKED', () => {
		const releasedRow: WorktreeLeaseRow = {
			...baseRow,
			status: 'RELEASED',
			releasedAt: '2026-10-24T11:30:00.000Z',
		};
		const grant = mapWorktreeLeaseToActorWorkspaceGrantV1(
			releasedRow,
			'repo-deeds',
			Date.parse('2026-10-24T11:45:00.000Z'),
		);

		expect(grant.status).toBe('DENIED');
		expect(grant.denialReason).toBe('GRANT_REVOKED');
	});

	it('integrates with AuthoritativeCachedGrantProvider and verifies permitted source access', async () => {
		const mockDb = {
			query: {
				worktreeLeases: {
					findFirst: vi.fn(async () => baseRow),
				},
			},
		};

		const upstreamProvider = new WorktreeLeaseGrantProvider(
			mockDb as any,
			() => Date.parse('2026-10-24T11:00:00.000Z'),
		);
		const cachedProvider = new AuthoritativeCachedGrantProvider(upstreamProvider, 60_000);

		// 1. Permitted source reference under prefix
		const allowed = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'agent-alice',
				workspaceId: 'task-workspace-1',
				repositoryId: 'repo-deeds',
				sourceRef: 'src/lib/server/atlas/authorization/token.ts',
			},
			cachedProvider,
			{ now: new Date('2026-10-24T11:00:00.000Z') },
		);
		expect(allowed.authorized).toBe(true);
		expect(allowed.grantRevision).toBe('epoch-42');

		// 2. Out of scope source reference
		const deniedOutOfScope = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'agent-alice',
				workspaceId: 'task-workspace-1',
				repositoryId: 'repo-deeds',
				sourceRef: 'src/lib/server/admin/secret.ts',
			},
			cachedProvider,
			{ now: new Date('2026-10-24T11:00:00.000Z') },
		);
		expect(deniedOutOfScope.authorized).toBe(false);
		expect(deniedOutOfScope.denialReason).toBe('SOURCE_REF_OUT_OF_SCOPE');

		// 3. Different repository mismatch
		const deniedRepoMismatch = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'agent-alice',
				workspaceId: 'task-workspace-1',
				repositoryId: 'different-repo',
				sourceRef: 'src/lib/server/atlas/authorization/token.ts',
			},
			cachedProvider,
			{ now: new Date('2026-10-24T11:00:00.000Z') },
		);
		expect(deniedRepoMismatch.authorized).toBe(false);
		expect(deniedRepoMismatch.denialReason).toBe('WORKSPACE_NOT_PERMITTED');
	});

	it('does not treat a run ID as the leased workspace ID', async () => {
		const provider = new WorktreeLeaseGrantProvider(
			{
				query: {
					worktreeLeases: {
						findFirst: vi.fn(async () => baseRow),
					},
				},
			} as any,
			() => Date.parse('2026-10-24T11:00:00.000Z'),
		);

		const grant = await provider.getGrant('agent-alice', 'run-workspace-1', 'repo-deeds');

		expect(grant).toBeNull();
	});
});
