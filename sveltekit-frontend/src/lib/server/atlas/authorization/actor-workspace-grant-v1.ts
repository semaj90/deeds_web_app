/**
 * Actor-to-Workspace Grant Boundary (ACTOR-WORKSPACE-GRANT-V1 & ACTOR-WORKSPACE-GRANT-02).
 *
 * Enforces authoritative access control between an authenticated actor, a target workspace,
 * and requested source references.
 *
 * Strict Rules:
 * 1. Fail Closed: Never implement a default-allow fallback or synthetic grant.
 * 2. If the authoritative owner is missing or null, fail closed with WORKSPACE_GRANT_PROVIDER_MISSING.
 * 3. Authority origin: Must originate from an authoritative access-control ledger/RBAC owner,
 *    never from case ownership, graph membership, or LLM inference.
 * 4. Lineage Gate: A valid grant must NEVER override missing lineage (NES_LEGACY_LINEAGE_BLOCKED).
 * 5. Invariants: canonicalAuthority=false, writesPerformed=false, summaryUpsertAllowed=false.
 */

import { z } from 'zod';

export const ActorTypeSchema = z.enum(['USER', 'SERVICE', 'SYSTEM']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const GrantDenialReasonSchema = z.enum([
	'ACTOR_NOT_AUTHENTICATED',
	'WORKSPACE_NOT_PERMITTED',
	'SOURCE_REF_OUT_OF_SCOPE',
	'GRANT_REVISION_EXPIRED',
	'GRANT_REVOKED',
	'STALE_GRANT_CACHE',
	'WORKSPACE_GRANT_PROVIDER_MISSING',
]);
export type GrantDenialReason = z.infer<typeof GrantDenialReasonSchema>;

export const ActorWorkspaceGrantV1Schema = z.object({
	schema: z.literal('atlas.actor-workspace-grant.v1'),
	actorId: z.string().min(1),
	actorType: ActorTypeSchema,
	tenantId: z.string().min(1).optional(),
	workspaceId: z.string().min(1),
	repositoryId: z.string().min(1),
	permittedSourceRefs: z.array(z.string().min(1)).optional(),
	permittedPrefixes: z.array(z.string().min(1)).optional(),
	grantRevision: z.string().min(1),
	status: z.enum(['GRANTED', 'DENIED']),
	denialReason: GrantDenialReasonSchema.optional(),
	authoritativeOwner: z.string().min(1),
	issuedAt: z.string().datetime(),
	expiresAt: z.string().datetime().optional(),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export type ActorWorkspaceGrantV1 = z.infer<typeof ActorWorkspaceGrantV1Schema>;

export const AccessVerificationRequestSchema = z.object({
	actorId: z.string().min(1),
	workspaceId: z.string().min(1),
	repositoryId: z.string().min(1),
	sourceRef: z.string().min(1),
	requiredGrantRevision: z.string().min(1).optional(),
}).strict();

export type AccessVerificationRequest = z.infer<typeof AccessVerificationRequestSchema>;

export const AccessVerificationResultSchema = z.object({
	schema: z.literal('atlas.access-verification-result.v1'),
	authorized: z.boolean(),
	actorId: z.string().min(1),
	workspaceId: z.string().min(1),
	sourceRef: z.string().min(1),
	grantRevision: z.string().min(1).nullable(),
	denialReason: GrantDenialReasonSchema.nullable(),
	authoritativeOwner: z.string().min(1).nullable(),
	verifiedAt: z.string().datetime(),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export type AccessVerificationResult = z.infer<typeof AccessVerificationResultSchema>;

export interface ActorWorkspaceGrantProvider {
	name: string;
	getGrant(actorId: string, workspaceId: string, repositoryId: string): Promise<ActorWorkspaceGrantV1 | null>;
	isRevoked?(grantRevision: string, actorId: string): Promise<boolean>;
	getLatestGrantRevision?(actorId: string, workspaceId: string, repositoryId: string): Promise<string | null>;
}

export interface CachedGrantEntry {
	grant: ActorWorkspaceGrantV1;
	cachedAtMs: number;
	maxAgeMs: number;
}

/**
 * AuthoritativeCachedGrantProvider:
 * Caches authoritative grants with explicit TTL and revalidates or refuses on stale cache.
 * Fails closed if upstream revalidation is unavailable.
 */
export class AuthoritativeCachedGrantProvider implements ActorWorkspaceGrantProvider {
	readonly name: string;
	#upstream: ActorWorkspaceGrantProvider;
	#cache = new Map<string, CachedGrantEntry>();
	#defaultTtlMs: number;

	constructor(upstream: ActorWorkspaceGrantProvider, defaultTtlMs = 60_000) {
		if (!Number.isFinite(defaultTtlMs) || defaultTtlMs <= 0) {
			throw new Error('GRANT_CACHE_TTL_INVALID');
		}
		this.name = upstream.name;
		this.#upstream = upstream;
		this.#defaultTtlMs = defaultTtlMs;
	}

	#cacheGrant(actorId: string, workspaceId: string, repositoryId: string, grant: ActorWorkspaceGrantV1, ttlMs = this.#defaultTtlMs) {
		const key = JSON.stringify([actorId, workspaceId, repositoryId]);
		this.#cache.set(key, {
			grant,
			cachedAtMs: Date.now(),
			maxAgeMs: ttlMs,
		});
	}

	invalidate(actorId: string, workspaceId: string, repositoryId: string) {
		const key = JSON.stringify([actorId, workspaceId, repositoryId]);
		this.#cache.delete(key);
	}

	async getGrant(actorId: string, workspaceId: string, repositoryId: string): Promise<ActorWorkspaceGrantV1 | null> {
		const key = JSON.stringify([actorId, workspaceId, repositoryId]);
		const entry = this.#cache.get(key);
		if (entry) {
			const age = Date.now() - entry.cachedAtMs;
			if (age > entry.maxAgeMs) {
				// Cache entry is stale -> revalidate with upstream
				try {
					const fresh = await this.#upstream.getGrant(actorId, workspaceId, repositoryId);
					if (fresh && fresh.status === 'GRANTED') {
						this.#cacheGrant(actorId, workspaceId, repositoryId, fresh, entry.maxAgeMs);
						return fresh;
					}
					// Upstream refused or revoked
					this.#cache.delete(key);
					return {
						...entry.grant,
						status: 'DENIED',
						denialReason: 'STALE_GRANT_CACHE',
					};
				} catch {
					// Network/provider failure: fail closed, never return stale unverified grant
					return {
						...entry.grant,
						status: 'DENIED',
						denialReason: 'STALE_GRANT_CACHE',
					};
				}
			}
			return entry.grant;
		}
		const fresh = await this.#upstream.getGrant(actorId, workspaceId, repositoryId);
		if (fresh) {
			this.#cacheGrant(actorId, workspaceId, repositoryId, fresh);
		}
		return fresh;
	}

	async isRevoked(grantRevision: string, actorId: string): Promise<boolean> {
		if (typeof this.#upstream.isRevoked === 'function') {
			return this.#upstream.isRevoked(grantRevision, actorId);
		}
		return false;
	}
}

export type SourceRefNormalizer = (value: string) => string | null;

export function defaultNormalizeRelativeSourceRef(value: string, allowTrailingSlash = false): string | null {
	let normalized = value.replace(/\\/g, '/');
	if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
		return null;
	}
	// Strip leading ./
	while (normalized.startsWith('./')) {
		normalized = normalized.slice(2);
	}
	// Collapse redundant slashes
	normalized = normalized.replace(/\/+/g, '/');
	const trimmed = allowTrailingSlash ? normalized.replace(/\/+$/, '') : normalized;
	const segments = trimmed.split('/');
	if (!trimmed || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		return null;
	}
	return trimmed;
}

export interface VerifyAccessOptions {
	sourceNormalizer?: SourceRefNormalizer;
	now?: Date;
}

/**
 * Verifies access for an actor requesting a specific sourceRef in a workspace.
 * Fails closed with WORKSPACE_GRANT_PROVIDER_MISSING if provider is not supplied.
 */
export async function verifyActorWorkspaceAccessV1(
	requestInput: AccessVerificationRequest,
	provider: ActorWorkspaceGrantProvider | null | undefined,
	options?: VerifyAccessOptions
): Promise<AccessVerificationResult> {
	const request = AccessVerificationRequestSchema.parse(requestInput);
	const now = options?.now ?? new Date();
	const nowIso = now.toISOString();

	// Fail closed if provider is missing
	if (!provider || typeof provider.getGrant !== 'function') {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: null,
			denialReason: 'WORKSPACE_GRANT_PROVIDER_MISSING',
			authoritativeOwner: null,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	const grant = await provider.getGrant(request.actorId, request.workspaceId, request.repositoryId);
	if (!grant) {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: null,
			denialReason: 'WORKSPACE_NOT_PERMITTED',
			authoritativeOwner: provider.name,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Validate parsed grant contract
	const parsedGrant = ActorWorkspaceGrantV1Schema.parse(grant);
	if (
		parsedGrant.actorId !== request.actorId ||
		parsedGrant.workspaceId !== request.workspaceId ||
		parsedGrant.repositoryId !== request.repositoryId
	) {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: parsedGrant.grantRevision,
			denialReason: 'WORKSPACE_NOT_PERMITTED',
			authoritativeOwner: parsedGrant.authoritativeOwner,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	if (parsedGrant.status === 'DENIED') {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: parsedGrant.grantRevision,
			denialReason: parsedGrant.denialReason ?? 'WORKSPACE_NOT_PERMITTED',
			authoritativeOwner: parsedGrant.authoritativeOwner,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Check revocation via provider if supported
	if (typeof provider.isRevoked === 'function') {
		const isRevoked = await provider.isRevoked(parsedGrant.grantRevision, parsedGrant.actorId);
		if (isRevoked) {
			return AccessVerificationResultSchema.parse({
				schema: 'atlas.access-verification-result.v1',
				authorized: false,
				actorId: request.actorId,
				workspaceId: request.workspaceId,
				sourceRef: request.sourceRef,
				grantRevision: parsedGrant.grantRevision,
				denialReason: 'GRANT_REVOKED',
				authoritativeOwner: parsedGrant.authoritativeOwner,
				verifiedAt: nowIso,
				canonicalAuthority: false,
				writesPerformed: false,
			});
		}
	}

	// Revision verification: caller assertion cannot override owner's actual revision
	if (request.requiredGrantRevision && parsedGrant.grantRevision !== request.requiredGrantRevision) {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: parsedGrant.grantRevision,
			denialReason: 'GRANT_REVISION_EXPIRED',
			authoritativeOwner: parsedGrant.authoritativeOwner,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Expiry check
	if (parsedGrant.expiresAt && new Date(parsedGrant.expiresAt) < now) {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: parsedGrant.grantRevision,
			denialReason: 'GRANT_REVISION_EXPIRED',
			authoritativeOwner: parsedGrant.authoritativeOwner,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Source reference scope check with normalizer support (symlinks / alternate path spelling)
	const normalizer = options?.sourceNormalizer ?? defaultNormalizeRelativeSourceRef;
	const normalizedTarget = normalizer(request.sourceRef);
	let inScope = false;

	if (normalizedTarget && parsedGrant.permittedSourceRefs && parsedGrant.permittedSourceRefs.length > 0) {
		const permittedNormalized = parsedGrant.permittedSourceRefs
			.map((ref) => normalizer(ref))
			.filter((r): r is string => r !== null);
		if (permittedNormalized.includes(normalizedTarget)) {
			inScope = true;
		}
	}

	if (normalizedTarget && !inScope && parsedGrant.permittedPrefixes && parsedGrant.permittedPrefixes.length > 0) {
		for (const prefix of parsedGrant.permittedPrefixes) {
			const cleanPrefix = defaultNormalizeRelativeSourceRef(prefix, true);
			// Exact path boundary check: must equal cleanPrefix or start with cleanPrefix/
			// This prevents src/a from matching src/admin
			if (cleanPrefix && (normalizedTarget === cleanPrefix || normalizedTarget.startsWith(`${cleanPrefix}/`))) {
				inScope = true;
				break;
			}
		}
	}

	// If no permittedSourceRefs or permittedPrefixes matched, fail closed
	if (!inScope) {
		return AccessVerificationResultSchema.parse({
			schema: 'atlas.access-verification-result.v1',
			authorized: false,
			actorId: request.actorId,
			workspaceId: request.workspaceId,
			sourceRef: request.sourceRef,
			grantRevision: parsedGrant.grantRevision,
			denialReason: 'SOURCE_REF_OUT_OF_SCOPE',
			authoritativeOwner: parsedGrant.authoritativeOwner,
			verifiedAt: nowIso,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	return AccessVerificationResultSchema.parse({
		schema: 'atlas.access-verification-result.v1',
		authorized: true,
		actorId: request.actorId,
		workspaceId: request.workspaceId,
		sourceRef: request.sourceRef,
		grantRevision: parsedGrant.grantRevision,
		denialReason: null,
		authoritativeOwner: parsedGrant.authoritativeOwner,
		verifiedAt: nowIso,
		canonicalAuthority: false,
		writesPerformed: false,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTOR-WORKSPACE-GRANT-02: Trusted Provider & Evidence Admission Composition
// ─────────────────────────────────────────────────────────────────────────────

export const CandidateLineageSchema = z.object({
	candidateId: z.string().min(1),
	sourceRef: z.string().min(1),
	lineageType: z.enum(['LEGACY_NES_PROJECTION', 'CANONICAL_ATLAS_V2', 'UNRESOLVED']),
	sourceRevision: z.string().min(1).optional(),
	workspaceRevision: z.string().min(1).optional(),
	canonicalPacketKey: z.string().min(1).optional(),
	featureId: z.string().optional(),
}).strict();

export type CandidateLineage = z.infer<typeof CandidateLineageSchema>;

export const CandidateAdmissionStatusSchema = z.enum([
	'ADMITTED',
	'NES_LEGACY_LINEAGE_BLOCKED',
	'SUMMARY_UPSERT_BLOCKED',
	'WORKSPACE_ADMISSION_UNPROVEN',
]);

export type CandidateAdmissionStatus = z.infer<typeof CandidateAdmissionStatusSchema>;

export const CandidateEvidenceAdmissionResultSchema = z.object({
	schema: z.literal('atlas.candidate-evidence-admission.v1'),
	candidateId: z.string().min(1),
	admitted: z.boolean(),
	admissionStatus: CandidateAdmissionStatusSchema,
	actorId: z.string().min(1),
	workspaceId: z.string().min(1),
	sourceRef: z.string().min(1),
	grantRevision: z.string().min(1).nullable(),
	rejectionReason: z.string().nullable(),
	summaryUpsertAllowed: z.literal(false),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
	verifiedAt: z.string().datetime(),
}).strict();

export type CandidateEvidenceAdmissionResult = z.infer<typeof CandidateEvidenceAdmissionResultSchema>;

/**
 * Composes authoritative ActorWorkspace access with canonical candidate lineage.
 * Enforces the stopping rule:
 * 1. Even if the grant is valid, missing or legacy NES lineage is BLOCKED (NES_LEGACY_LINEAGE_BLOCKED).
 * 2. If actor access fails, rejected with WORKSPACE_ADMISSION_UNPROVEN.
 * 3. summaryUpsertAllowed is strictly false (SUMMARY_UPSERT_BLOCKED).
 */
export function verifyCandidateEvidenceAdmissionV1(
	accessResult: AccessVerificationResult,
	lineageInput: CandidateLineage
): CandidateEvidenceAdmissionResult {
	const lineage = CandidateLineageSchema.parse(lineageInput);
	const nowIso = new Date().toISOString();

	// Invariant rule 1: Valid grant must NEVER override missing or legacy lineage
	if (lineage.lineageType === 'LEGACY_NES_PROJECTION') {
		return CandidateEvidenceAdmissionResultSchema.parse({
			schema: 'atlas.candidate-evidence-admission.v1',
			candidateId: lineage.candidateId,
			admitted: false,
			admissionStatus: 'NES_LEGACY_LINEAGE_BLOCKED',
			actorId: accessResult.actorId,
			workspaceId: accessResult.workspaceId,
			sourceRef: lineage.sourceRef,
			grantRevision: accessResult.grantRevision,
			rejectionReason:
				'Historical NES projection rows cannot be promoted to canonical FeatureRow joins without immutable source/workspace revisions.',
			summaryUpsertAllowed: false,
			canonicalAuthority: false,
			writesPerformed: false,
			verifiedAt: nowIso,
		});
	}

	if (lineage.lineageType === 'UNRESOLVED' || !lineage.sourceRevision || !lineage.workspaceRevision || !lineage.canonicalPacketKey) {
		return CandidateEvidenceAdmissionResultSchema.parse({
			schema: 'atlas.candidate-evidence-admission.v1',
			candidateId: lineage.candidateId,
			admitted: false,
			admissionStatus: 'NES_LEGACY_LINEAGE_BLOCKED',
			actorId: accessResult.actorId,
			workspaceId: accessResult.workspaceId,
			sourceRef: lineage.sourceRef,
			grantRevision: accessResult.grantRevision,
			rejectionReason: 'Candidate lacks immutable source/workspace revisions or canonical packet key.',
			summaryUpsertAllowed: false,
			canonicalAuthority: false,
			writesPerformed: false,
			verifiedAt: nowIso,
		});
	}

	// Invariant rule 2: Actor workspace authorization must be verified
	if (!accessResult.authorized) {
		return CandidateEvidenceAdmissionResultSchema.parse({
			schema: 'atlas.candidate-evidence-admission.v1',
			candidateId: lineage.candidateId,
			admitted: false,
			admissionStatus: 'WORKSPACE_ADMISSION_UNPROVEN',
			actorId: accessResult.actorId,
			workspaceId: accessResult.workspaceId,
			sourceRef: lineage.sourceRef,
			grantRevision: accessResult.grantRevision,
			rejectionReason: `Actor workspace grant not proven: ${accessResult.denialReason ?? 'DENIED'}`,
			summaryUpsertAllowed: false,
			canonicalAuthority: false,
			writesPerformed: false,
			verifiedAt: nowIso,
		});
	}

	// Both lineage and workspace access are proven
	return CandidateEvidenceAdmissionResultSchema.parse({
		schema: 'atlas.candidate-evidence-admission.v1',
		candidateId: lineage.candidateId,
		admitted: true,
		admissionStatus: 'ADMITTED',
		actorId: accessResult.actorId,
		workspaceId: accessResult.workspaceId,
		sourceRef: lineage.sourceRef,
		grantRevision: accessResult.grantRevision,
		rejectionReason: null,
		summaryUpsertAllowed: false, // Enforces SUMMARY_UPSERT_BLOCKED
		canonicalAuthority: false,
		writesPerformed: false,
		verifiedAt: nowIso,
	});
}
