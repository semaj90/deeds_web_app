import {
	ActorWorkspaceGrantV1Schema,
	type ActorWorkspaceGrantProvider,
	type ActorWorkspaceGrantV1,
} from './actor-workspace-grant-v1.js';

export const POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1 =
	'public.atlas_actor_workspace_source_grants_v1' as const;

export interface GrantQueryResultV1 {
	rows: unknown[];
}

export interface GrantQueryPortV1 {
	query(text: string, values?: unknown[]): Promise<GrantQueryResultV1>;
}

interface GrantRowV1 extends Record<string, unknown> {
	actor_id: unknown;
	actor_type: unknown;
	tenant_id: unknown;
	workspace_id: unknown;
	workspace_revision: unknown;
	repository_id: unknown;
	permitted_source_refs: unknown;
	grant_revision: unknown;
	status: unknown;
	issued_at: unknown;
	expires_at: unknown;
	revoked_at: unknown;
}

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') throw new Error(`GRANT_ROW_INVALID:${field}`);
	return value;
}

function timestamp(value: unknown, field: string): string {
	const date = value instanceof Date ? value : new Date(String(value));
	if (!Number.isFinite(date.getTime())) throw new Error(`GRANT_ROW_INVALID:${field}`);
	return date.toISOString();
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
		throw new Error('GRANT_ROW_INVALID:permitted_source_refs');
	}
	return [...new Set(value)];
}

function mapGrantRowV1(row: GrantRowV1, nowMs: number): ActorWorkspaceGrantV1 {
	const issuedAt = timestamp(row.issued_at, 'issued_at');
	const expiresAt = row.expires_at == null ? undefined : timestamp(row.expires_at, 'expires_at');
	const revoked = row.revoked_at != null;
	const expired = expiresAt !== undefined && new Date(expiresAt).getTime() <= nowMs;
	const deniedStatus = row.status === 'DENIED';
	const denialReason = revoked
		? 'GRANT_REVOKED'
		: expired
			? 'GRANT_REVISION_EXPIRED'
			: deniedStatus
				? 'WORKSPACE_NOT_PERMITTED'
				: undefined;

	return ActorWorkspaceGrantV1Schema.parse({
		schema: 'atlas.actor-workspace-grant.v1',
		actorId: requiredText(row.actor_id, 'actor_id'),
		actorType: row.actor_type,
		...(row.tenant_id == null ? {} : { tenantId: requiredText(row.tenant_id, 'tenant_id') }),
		workspaceId: requiredText(row.workspace_id, 'workspace_id'),
		workspaceRevision: requiredText(row.workspace_revision, 'workspace_revision'),
		repositoryId: requiredText(row.repository_id, 'repository_id'),
		permittedSourceRefs: stringArray(row.permitted_source_refs),
		grantRevision: requiredText(row.grant_revision, 'grant_revision'),
		status: denialReason ? 'DENIED' : 'GRANTED',
		...(denialReason ? { denialReason } : {}),
		authoritativeOwner: `postgresql:${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}`,
		issuedAt,
		...(expiresAt ? { expiresAt } : {}),
		canonicalAuthority: false,
		writesPerformed: false,
	});
}

/**
 * Read-only grant resolver. It never caches grants, so revocation and expiry
 * changes are observed on the next authorization check. Missing tables,
 * malformed rows, and query failures throw for the caller to fail closed.
 */
export class PostgresActorWorkspaceGrantProviderV1 implements ActorWorkspaceGrantProvider {
	readonly name = `postgresql:${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}`;
	readonly #db: GrantQueryPortV1;
	readonly #clock: () => number;

	constructor(db: GrantQueryPortV1, clock: () => number = Date.now) {
		this.#db = db;
		this.#clock = clock;
	}

	async getGrant(actorId: string, workspaceId: string, repositoryId: string): Promise<ActorWorkspaceGrantV1 | null> {
		const result = await this.#db.query(
			`SELECT actor_id, actor_type, tenant_id, workspace_id, workspace_revision,
			        repository_id, permitted_source_refs, grant_revision, status,
			        issued_at, expires_at, revoked_at
			 FROM ${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}
			 WHERE actor_id = $1 AND workspace_id = $2 AND repository_id = $3
			 ORDER BY issued_at DESC, grant_id DESC
			 LIMIT 1`,
			[actorId, workspaceId, repositoryId],
		);
		const row = result.rows[0] as GrantRowV1 | undefined;
		return row ? mapGrantRowV1(row, this.#clock()) : null;
	}

	async isRevoked(grantRevision: string, actorId: string): Promise<boolean> {
		const result = await this.#db.query(
			`SELECT revoked_at
			 FROM ${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}
			 WHERE grant_revision = $1 AND actor_id = $2
			 LIMIT 1`,
			[grantRevision, actorId],
		);
		const row = result.rows[0] as { revoked_at?: unknown } | undefined;
		return !row || row.revoked_at != null;
	}

	async getLatestGrantRevision(actorId: string, workspaceId: string, repositoryId: string): Promise<string | null> {
		const result = await this.#db.query(
			`SELECT grant_revision
			 FROM ${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}
			 WHERE actor_id = $1 AND workspace_id = $2 AND repository_id = $3
			 ORDER BY issued_at DESC, grant_id DESC
			 LIMIT 1`,
			[actorId, workspaceId, repositoryId],
		);
		const row = result.rows[0] as { grant_revision?: unknown } | undefined;
		return row ? requiredText(row.grant_revision, 'grant_revision') : null;
	}

	async getGrantsForWorkspaceRevision(
		actorId: string,
		workspaceId: string,
		workspaceRevision: string,
	): Promise<ActorWorkspaceGrantV1[]> {
		const result = await this.#db.query(
			`WITH latest AS (
			  SELECT DISTINCT ON (repository_id) actor_id, actor_type, tenant_id, workspace_id,
			         workspace_revision, repository_id, permitted_source_refs, grant_revision,
			         status, issued_at, expires_at, revoked_at, grant_id
			  FROM ${POSTGRES_ACTOR_WORKSPACE_SOURCE_GRANTS_TABLE_V1}
			  WHERE actor_id = $1 AND workspace_id = $2 AND workspace_revision = $3
			  ORDER BY repository_id, issued_at DESC, grant_id DESC
			)
			SELECT actor_id, actor_type, tenant_id, workspace_id, workspace_revision,
			       repository_id, permitted_source_refs, grant_revision, status,
			       issued_at, expires_at, revoked_at
			FROM latest
			ORDER BY repository_id`,
			[actorId, workspaceId, workspaceRevision],
		);
		return result.rows.map((row) => mapGrantRowV1(row as GrantRowV1, this.#clock()));
	}
}
