import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
	worktreeLeases,
	type WorktreeLeaseRow,
	type WorktreeLeaseStatus,
} from '../../db/schema/worktree-leases.js';
import {
	ActorWorkspaceGrantV1Schema,
	type ActorWorkspaceGrantProvider,
	type ActorWorkspaceGrantV1,
} from './actor-workspace-grant-v1.js';

/**
 * ============================================================================
 * WORKTREE-LEASE-GRANT-PROVIDER-01: Database-backed RBAC Grant Provider
 * Connecting PostgreSQL `worktree_leases` to `AuthoritativeCachedGrantProvider`
 * ============================================================================
 *
 * Enforces:
 *  1. Only active leases with valid fence epochs produce GRANTED status.
 *  2. Released/blocked/archived leases return DENIED with GRANT_REVOKED.
 *  3. Leases with past `expiresAt` return DENIED with GRANT_REVISION_EXPIRED.
 *  4. Monotonic `fenceEpoch` maps directly to `grantRevision`.
 *  5. Strict non-canonical flags (`canonicalAuthority: false`, `writesPerformed: false`).
 *  6. ActorType is 'SERVICE' for agent execution leases.
 */

const ACTIVE_LEASE_STATUSES: readonly WorktreeLeaseStatus[] = [
	'ALLOCATED',
	'ACTIVE',
	'VALIDATING',
	'READY_FOR_REVIEW',
];

export interface LeaseFinderDatabase {
	query: {
		worktreeLeases: {
			findFirst: (options: {
				where: SQL | undefined;
				orderBy?: SQL | SQL[];
			}) => Promise<WorktreeLeaseRow | null | undefined>;
		};
	};
}

export function mapWorktreeLeaseToActorWorkspaceGrantV1(
	row: WorktreeLeaseRow,
	requestedRepositoryId?: string,
	nowMs: number = Date.now(),
): ActorWorkspaceGrantV1 {
	const grantRevision = `epoch-${row.fenceEpoch}`;
	const issuedAt = row.acquiredAt
		? new Date(row.acquiredAt).toISOString()
		: new Date().toISOString();
	const expiresAt = row.expiresAt ? new Date(row.expiresAt).toISOString() : undefined;

	// Check repository scope match
	if (requestedRepositoryId && requestedRepositoryId !== row.repositoryRoot) {
		return ActorWorkspaceGrantV1Schema.parse({
			schema: 'atlas.actor-workspace-grant.v1',
			actorId: row.ownerAgent,
			actorType: 'SERVICE',
			workspaceId: row.taskId,
			repositoryId: requestedRepositoryId,
			permittedPrefixes: [],
			grantRevision,
			status: 'DENIED',
			denialReason: 'WORKSPACE_NOT_PERMITTED',
			authoritativeOwner: 'postgresql:worktree_leases',
			issuedAt,
			expiresAt,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Check expiration
	if (row.expiresAt && new Date(row.expiresAt).getTime() <= nowMs) {
		return ActorWorkspaceGrantV1Schema.parse({
			schema: 'atlas.actor-workspace-grant.v1',
			actorId: row.ownerAgent,
			actorType: 'SERVICE',
			workspaceId: row.taskId,
			repositoryId: row.repositoryRoot,
			permittedPrefixes: Array.isArray(row.allowedPaths) ? (row.allowedPaths as string[]) : [],
			grantRevision,
			status: 'DENIED',
			denialReason: 'GRANT_REVISION_EXPIRED',
			authoritativeOwner: 'postgresql:worktree_leases',
			issuedAt,
			expiresAt,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Check revocation / inactive status
	const isActive = ACTIVE_LEASE_STATUSES.includes(row.status as WorktreeLeaseStatus);
	if (!isActive) {
		return ActorWorkspaceGrantV1Schema.parse({
			schema: 'atlas.actor-workspace-grant.v1',
			actorId: row.ownerAgent,
			actorType: 'SERVICE',
			workspaceId: row.taskId,
			repositoryId: row.repositoryRoot,
			permittedPrefixes: Array.isArray(row.allowedPaths) ? (row.allowedPaths as string[]) : [],
			grantRevision,
			status: 'DENIED',
			denialReason: 'GRANT_REVOKED',
			authoritativeOwner: 'postgresql:worktree_leases',
			issuedAt,
			expiresAt,
			canonicalAuthority: false,
			writesPerformed: false,
		});
	}

	// Active and unexpired
	return ActorWorkspaceGrantV1Schema.parse({
		schema: 'atlas.actor-workspace-grant.v1',
		actorId: row.ownerAgent,
		actorType: 'SERVICE',
		workspaceId: row.taskId,
		repositoryId: row.repositoryRoot,
		permittedPrefixes: Array.isArray(row.allowedPaths) ? (row.allowedPaths as string[]) : [],
		grantRevision,
		status: 'GRANTED',
		authoritativeOwner: 'postgresql:worktree_leases',
		issuedAt,
		expiresAt,
		canonicalAuthority: false,
		writesPerformed: false,
	});
}

/**
 * Database-backed implementation of `ActorWorkspaceGrantProvider`
 * that resolves authoritative leases from PostgreSQL `worktree_leases`.
 */
export class WorktreeLeaseGrantProvider implements ActorWorkspaceGrantProvider {
	readonly name = 'postgresql:worktree_leases';
	#db: LeaseFinderDatabase;
	#clock: () => number;

	constructor(
		db: LeaseFinderDatabase | PostgresJsDatabase<Record<string, unknown>>,
		clock: () => number = () => Date.now(),
	) {
		this.#db = db as LeaseFinderDatabase;
		this.#clock = clock;
	}

	async getGrant(
		actorId: string,
		workspaceId: string,
		repositoryId: string,
	): Promise<ActorWorkspaceGrantV1 | null> {
		const row = await this.#db.query.worktreeLeases.findFirst({
			where: and(
				eq(worktreeLeases.ownerAgent, actorId),
				eq(worktreeLeases.taskId, workspaceId),
			),
			orderBy: [desc(worktreeLeases.fenceEpoch)],
		});

		if (!row || row.taskId !== workspaceId) {
			return null;
		}

		return mapWorktreeLeaseToActorWorkspaceGrantV1(row, repositoryId, this.#clock());
	}
}
