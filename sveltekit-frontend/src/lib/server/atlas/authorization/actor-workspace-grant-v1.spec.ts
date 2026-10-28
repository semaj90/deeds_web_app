import { describe, it, expect } from 'vitest';
import {
	verifyActorWorkspaceAccessV1,
	verifyCandidateEvidenceAdmissionV1,
	AuthoritativeCachedGrantProvider,
	defaultNormalizeRelativeSourceRef,
	type ActorWorkspaceGrantV1,
	type ActorWorkspaceGrantProvider,
	type CandidateLineage,
} from './actor-workspace-grant-v1.js';

describe('actor-workspace-grant-v1 (ACTOR-WORKSPACE-GRANT-V1 & ACTOR-WORKSPACE-GRANT-02)', () => {
	const mockGrant: ActorWorkspaceGrantV1 = {
		schema: 'atlas.actor-workspace-grant.v1',
		actorId: 'usr_legal_analyst_01',
		actorType: 'USER',
		tenantId: 'tenant_austin_legal',
		workspaceId: 'ws_deeds_analysis',
		repositoryId: 'repo_deeds_web_app',
		permittedSourceRefs: ['src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts'],
		permittedPrefixes: ['src/lib/server/atlas/'],
		grantRevision: 'rev_2026_10_grant_001',
		status: 'GRANTED',
		authoritativeOwner: 'auth_database_rbac_v2',
		issuedAt: '2026-10-24T00:00:00.000Z',
		expiresAt: '2099-01-01T00:00:00.000Z',
		canonicalAuthority: false,
		writesPerformed: false,
	};

	const mockProvider: ActorWorkspaceGrantProvider = {
		name: 'mock_rbac_provider',
		async getGrant(actorId: string, workspaceId: string, repositoryId: string) {
			if (actorId === 'usr_legal_analyst_01' && workspaceId === 'ws_deeds_analysis' && repositoryId === 'repo_deeds_web_app') {
				return mockGrant;
			}
			return null;
		},
	};

	it('refuses with WORKSPACE_GRANT_PROVIDER_MISSING when provider is null or undefined', async () => {
		const result = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			null
		);

		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('WORKSPACE_GRANT_PROVIDER_MISSING');
		expect(result.authoritativeOwner).toBeNull();
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('Case 1: Same source, different actor -> Deny unless separately authorized', async () => {
		const result = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_different_actor_42',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			mockProvider
		);

		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('WORKSPACE_NOT_PERMITTED');
		expect(result.authoritativeOwner).toBe('mock_rbac_provider');
	});

	it('Case 2: Same actor, different repository -> Deny unless separately authorized', async () => {
		const result = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_other_unauthorized_repo',
				sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			mockProvider
		);

		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('WORKSPACE_NOT_PERMITTED');
	});

	it('Case 3: Revoked grant with otherwise matching revision -> Deny with GRANT_REVOKED', async () => {
		const revocableProvider: ActorWorkspaceGrantProvider = {
			name: 'revocable_rbac_provider',
			async getGrant(actorId, workspaceId, repositoryId) {
				return mockGrant;
			},
			async isRevoked(grantRevision, actorId) {
				return grantRevision === 'rev_2026_10_grant_001';
			},
		};

		const result = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			revocableProvider
		);

		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('GRANT_REVOKED');
	});

	it('rejects caller-controlled verification time and denies expired grants using server time', async () => {
		const forgedRequest = {
			actorId: 'usr_legal_analyst_01',
			workspaceId: 'ws_deeds_analysis',
			repositoryId: 'repo_deeds_web_app',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			currentTime: new Date('2000-01-01T00:00:00.000Z'),
		};
		await expect(verifyActorWorkspaceAccessV1(forgedRequest, mockProvider)).rejects.toThrow();

		const expiredProvider: ActorWorkspaceGrantProvider = {
			name: 'expired_rbac_provider',
			async getGrant() {
				return { ...mockGrant, expiresAt: '2000-01-01T00:00:00.000Z' };
			},
		};
		const result = await verifyActorWorkspaceAccessV1({
			actorId: 'usr_legal_analyst_01',
			workspaceId: 'ws_deeds_analysis',
			repositoryId: 'repo_deeds_web_app',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
		}, expiredProvider);
		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('GRANT_REVISION_EXPIRED');
	});

	it('Case 4: Source prefix collision (src/a vs src/admin) -> Deny unintended prefix match', async () => {
		const prefixCollisionProvider: ActorWorkspaceGrantProvider = {
			name: 'prefix_collision_provider',
			async getGrant() {
				return {
					...mockGrant,
					permittedSourceRefs: [],
					permittedPrefixes: ['src/a'], // Target prefix: src/a
				};
			},
		};

		// Should match file directly inside src/a/
		const matchResult = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/a/valid-module.ts',
			},
			prefixCollisionProvider
		);
		expect(matchResult.authorized).toBe(true);

		// Must strictly NOT match src/admin/...
		const collisionResult = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/admin/secrets.ts',
			},
			prefixCollisionProvider
		);
		expect(collisionResult.authorized).toBe(false);
		expect(collisionResult.denialReason).toBe('SOURCE_REF_OUT_OF_SCOPE');
	});

	it('Case 5: Symlink or alternate path spelling -> Normalize through source owner, then verify scope', async () => {
		// Mock symlink normalizer representing established source owner
		const sourceOwnerNormalizer = (sourceRef: string): string | null => {
			const cleaned = defaultNormalizeRelativeSourceRef(sourceRef);
			if (!cleaned) return null;
			// Resolves symlink alias 'symlinks/atlas' to canonical path 'src/lib/server/atlas'
			if (cleaned.startsWith('symlinks/atlas/')) {
				return cleaned.replace('symlinks/atlas/', 'src/lib/server/atlas/');
			}
			return cleaned;
		};

		// 1. Alternate path spelling with redundant leading ./ and slashes
		const altSpellingResult = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: './src//lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			mockProvider,
			{ sourceNormalizer: sourceOwnerNormalizer }
		);
		expect(altSpellingResult.authorized).toBe(true);

		// 2. Symlink alias resolved through normalizer
		const symlinkResult = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'symlinks/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			},
			mockProvider,
			{ sourceNormalizer: sourceOwnerNormalizer }
		);
		expect(symlinkResult.authorized).toBe(true);

		// 3. Symlink resolving out-of-scope path is denied
		const outOfScopeSymlink = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'symlinks/atlas/../../routes/api/auth.ts',
			},
			mockProvider,
			{ sourceNormalizer: sourceOwnerNormalizer }
		);
		expect(outOfScopeSymlink.authorized).toBe(false);
		expect(outOfScopeSymlink.denialReason).toBe('SOURCE_REF_OUT_OF_SCOPE');
	});

	it('Case 6: Stale grant cache -> Refuse or revalidate with authoritative owner', async () => {
		let upstreamCallCount = 0;
		let shouldFailUpstream = false;

		const liveUpstreamProvider: ActorWorkspaceGrantProvider = {
			name: 'authoritative_db_ledger',
			async getGrant() {
				upstreamCallCount++;
				if (shouldFailUpstream) {
					throw new Error('Database connection down');
				}
				return mockGrant;
			},
		};

		// Cached provider with 50ms TTL
		const cachedProvider = new AuthoritativeCachedGrantProvider(liveUpstreamProvider, 50);
		expect('setCached' in cachedProvider).toBe(false);

		// 1. Initial fetch from upstream
		const initial = await cachedProvider.getGrant('usr_legal_analyst_01', 'ws_deeds_analysis', 'repo_deeds_web_app');
		expect(initial?.status).toBe('GRANTED');
		expect(upstreamCallCount).toBe(1);

		// 2. Hit cache while fresh
		const cached = await cachedProvider.getGrant('usr_legal_analyst_01', 'ws_deeds_analysis', 'repo_deeds_web_app');
		expect(cached?.status).toBe('GRANTED');
		expect(upstreamCallCount).toBe(1); // No additional upstream call

		// 3. Wait for TTL expiry
		await new Promise((r) => setTimeout(r, 60));

		// When upstream goes down, stale cache is REFUSED (fail closed)
		shouldFailUpstream = true;
		const staleResult = await cachedProvider.getGrant('usr_legal_analyst_01', 'ws_deeds_analysis', 'repo_deeds_web_app');
		expect(staleResult?.status).toBe('DENIED');
		expect(staleResult?.denialReason).toBe('STALE_GRANT_CACHE');
	});

	it('Case 7: Valid grant, unresolved NES identity -> Still deny canonical promotion', () => {
		const validAccessResult = {
			schema: 'atlas.access-verification-result.v1' as const,
			authorized: true,
			actorId: 'usr_legal_analyst_01',
			workspaceId: 'ws_deeds_analysis',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			grantRevision: 'rev_2026_10_grant_001',
			denialReason: null,
			authoritativeOwner: 'auth_database_rbac_v2',
			verifiedAt: new Date().toISOString(),
			canonicalAuthority: false as const,
			writesPerformed: false as const,
		};

		// Legacy NES projection candidate (from 1,992 historical rows)
		const legacyNesCandidate: CandidateLineage = {
			candidateId: 'cand_nes_001',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			lineageType: 'LEGACY_NES_PROJECTION',
			featureId: 'sparse_routing',
		};

		const admissionResult = verifyCandidateEvidenceAdmissionV1(validAccessResult, legacyNesCandidate);

		// Invariant: Valid grant must NEVER override missing lineage
		expect(admissionResult.admitted).toBe(false);
		expect(admissionResult.admissionStatus).toBe('NES_LEGACY_LINEAGE_BLOCKED');
		expect(admissionResult.summaryUpsertAllowed).toBe(false);
		expect(admissionResult.rejectionReason).toContain('Historical NES projection rows cannot be promoted');
	});

	it('Authority-produced grantRevision cannot be forged by caller-supplied revision', async () => {
		const result = await verifyActorWorkspaceAccessV1(
			{
				actorId: 'usr_legal_analyst_01',
				workspaceId: 'ws_deeds_analysis',
				repositoryId: 'repo_deeds_web_app',
				sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
				requiredGrantRevision: 'caller_manufactured_freshness_999',
			},
			mockProvider
		);

		expect(result.authorized).toBe(false);
		expect(result.denialReason).toBe('GRANT_REVISION_EXPIRED');
		// Returns the authoritative owner's actual revision, never caller's forged string
		expect(result.grantRevision).toBe('rev_2026_10_grant_001');
	});

	it('Composed admission passes only when both valid grant AND canonical lineage are proven', () => {
		const validAccessResult = {
			schema: 'atlas.access-verification-result.v1' as const,
			authorized: true,
			actorId: 'usr_legal_analyst_01',
			workspaceId: 'ws_deeds_analysis',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			grantRevision: 'rev_2026_10_grant_001',
			denialReason: null,
			authoritativeOwner: 'auth_database_rbac_v2',
			verifiedAt: new Date().toISOString(),
			canonicalAuthority: false as const,
			writesPerformed: false as const,
		};

		const canonicalCandidate: CandidateLineage = {
			candidateId: 'cand_canonical_001',
			sourceRef: 'src/lib/server/atlas/tensors/sparse-routing-bit-packer-v1.ts',
			lineageType: 'CANONICAL_ATLAS_V2',
			sourceRevision: 'git_blob_sha_12345678',
			workspaceRevision: 'git_commit_sha_abcdef',
			canonicalPacketKey: 'pkt:atlas:sparse-routing:12345678',
			featureId: 'sparse_routing',
		};

		const admission = verifyCandidateEvidenceAdmissionV1(validAccessResult, canonicalCandidate);

		expect(admission.admitted).toBe(true);
		expect(admission.admissionStatus).toBe('ADMITTED');
		expect(admission.rejectionReason).toBeNull();
		// Even when admitted, summary upsert remains blocked until durable proof exists
		expect(admission.summaryUpsertAllowed).toBe(false);
	});
});
