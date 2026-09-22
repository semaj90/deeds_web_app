/**
 * StableFileIdentityMintV1 (S01-08I) — the ONE canonical creator for RepositoryIdentityV1 and
 * StableFileIdentityV1, per docs/reports/stable-file-identity-design-v1.json (S01-08G) and
 * docs/reports/stable-file-schema-ddl-v1.sql (the live, applied G1 schema). Owner census (grep,
 * this gate): zero other code paths in scripts/atlas or sveltekit-frontend/src reference
 * atlas_repository_identity / atlas_stable_file_identity / atlas_stable_file_revision_binding /
 * atlas_stable_file_alias -- canonicalStableFileWriterOwnerCount == 1.
 *
 * Decisions resolved here (previously open in S01-08G's unresolvedDecisions), CORRECTED per
 * operator direction after the first pass (which used deterministic UUIDv8 for repositoryId):
 *  - repositoryId: random UUIDv7 (`randomUUIDv7()`) -- SAME rule as stableFileId. Canonical
 *    lifecycle entities (things a writer decides to CREATE, once, on an explicit event) mint
 *    UUIDv7; only DERIVED identities (a value that is intentionally a deterministic function of
 *    canonical inputs -- e.g. a future tree-node-occurrence ID keyed on sourceRevision+astPath)
 *    use the existing `deriveUUID()` UUIDv8 utility. `source_authority_repo_id` (a separate,
 *    already-persisted TEXT column) is what bridges to the external repo key -- repository_id
 *    itself does not need to encode or derive from that key. Concurrency safety no longer comes
 *    from determinism: it comes from the live `UNIQUE (source_authority_repo_id)` constraint on
 *    `atlas_repository_identity` plus graceful handling of a `23505` unique-violation at INSERT
 *    time (re-read and return the row the other transaction actually won), not from picking the
 *    same UUID by construction. RFC 9562 gives UUIDv7 built-in creation-time-ordered uniqueness
 *    semantics that UUIDv8 (explicitly application-defined, no such standard guarantee) does not.
 *  - stableFileId: random UUIDv7 (`randomUUIDv7()`), unchanged from the first pass -- a file's
 *    identity has NO stable external key (path and content both change over its lifetime), so
 *    deterministic derivation would violate the "never derive stableFileId from path/content"
 *    prohibition. Concurrency safety comes from the dedup-before-mint check below plus the caller
 *    wrapping both statements in one transaction with a readback before COMMIT.
 *  - The `uuid` npm package is deliberately NOT used for either -- `randomUUIDv7()` is a small
 *    self-contained RFC 9562 implementation in `sveltekit-frontend/src/lib/utils/uuid.ts` (Node's
 *    own `crypto.randomUUID()` only produces UUIDv4), so this module never depends on a package
 *    that happens to be present only as someone else's transitive dependency.
 *
 * Hard rules enforced by this module (not just documented):
 *  - stable_file_id is NEVER a column default; it is minted here, once, on an explicit CREATE.
 *  - The caller NEVER supplies sourceIdentityKey -- it is always computed internally as
 *    `${repositoryId}:${canonicalSourceRef}`, structurally forbidding path-only identity
 *    matching (S08I-NO-PATH-ID-01): a path can never resolve an existing file without also
 *    being scoped through a verified repositoryId.
 *  - Before any mint/bind, the exact admitted row is verified to exist in
 *    atlas_workspace_source_bindings for (source_authority_repo_id, canonical_source_ref,
 *    source_revision, workspace_revision) -- never a "latest row" lookup, never HEAD/Git-commit
 *    substitution. This module reads that table; it never writes to it and never redefines its
 *    sourceRevision/contentDigest authority.
 *  - Every function here is DB-effecting only through the injected `StableFileIdentityDbClient`
 *    (matches the ShadowReadQuery pattern already used by graphify-authority-shadow-read-v1.ts) --
 *    no pool/connection is opened inside this module. The caller owns the transaction boundary.
 *  - Ambiguity (>1 existing row for what should be a unique scope) throws rather than picking
 *    arbitrarily, per this repo's fail-closed identity discipline.
 *  - This module MINTS. It never classifies a bulk backfill population -- that is S01-08J/K's job,
 *    which calls into the pure decision functions here per-row, one row at a time, inside its own
 *    bounded transactions.
 *
 * NOT implemented here (explicitly out of scope, deferred to S01-08L per the design's proofPlan):
 * RENAME/alias-writing and TOMBSTONE. Only CREATE (mint a new repository or stable file) and
 * MODIFY (bind a new revision to an existing ACTIVE stable file) are implemented -- these are the
 * two lifecycle events S01-08J/K's population backfill actually needs. RECREATE-at-a-tombstoned-
 * path is implemented as a side effect of CREATE's own dedup rule (a tombstoned identity is never
 * matched by the ACTIVE-only lookup, so a fresh mint happens automatically) but is not itself
 * independently fixture-tested against a real tombstone-writing path, since none exists yet.
 */
import { randomUUIDv7 } from '../../../utils/uuid';

export interface StableFileIdentityDbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Typed failure vocabulary. Every throw in this module uses one of these as the message prefix. */
export const StableFileWriterErrorCode = Object.freeze({
  REPOSITORY_IDENTITY_MISSING: 'REPOSITORY_IDENTITY_MISSING',
  SOURCE_AUTHORITY_BINDING_MISSING: 'SOURCE_AUTHORITY_BINDING_MISSING',
  SOURCE_REVISION_MISMATCH: 'SOURCE_REVISION_MISMATCH',
  CONTENT_DIGEST_MISMATCH: 'CONTENT_DIGEST_MISMATCH',
  STABLE_FILE_IDENTITY_AMBIGUOUS: 'STABLE_FILE_IDENTITY_AMBIGUOUS',
  REPOSITORY_IDENTITY_AMBIGUOUS: 'REPOSITORY_IDENTITY_AMBIGUOUS',
  CROSS_REPOSITORY_IDENTITY_CONFLICT: 'CROSS_REPOSITORY_IDENTITY_CONFLICT',
  TOMBSTONED_IDENTITY_NOT_REUSABLE: 'TOMBSTONED_IDENTITY_NOT_REUSABLE',
} as const);
export type StableFileWriterErrorCodeV1 = (typeof StableFileWriterErrorCode)[keyof typeof StableFileWriterErrorCode];

function typedError(code: StableFileWriterErrorCodeV1, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}

const REVISION_SHAPE_RE = /^sha256:[0-9a-f]{64}$/;
const DIGEST_SHAPE_RE = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------------------------
// RepositoryIdentityV1
// ---------------------------------------------------------------------------------------------

export interface RepositoryIdentityMintRequestV1 {
  sourceAuthorityRepoId: string;
  repositoryName: string;
  repositoryPath: string;
  repositoryKind: 'ROOT' | 'NESTED_GIT_REPOSITORY';
  gitmoduleName?: string | null;
  originUrl?: string | null;
  parentRepositoryId?: string | null;
}

export interface RepositoryIdentityRowV1 {
  repository_id: string;
  source_authority_repo_id: string;
  repository_name: string;
  repository_path: string;
  repository_kind: string;
  gitmodule_name: string | null;
  origin_url: string | null;
  parent_repository_id: string | null;
  known_commit_oids: string[];
  created_at: string;
}

/** Pure: decide REUSE vs MINT vs AMBIGUOUS from already-fetched rows. Never picks arbitrarily. */
export function decideRepositoryIdentityMintV1(
  existingRows: RepositoryIdentityRowV1[],
): 'REUSE_EXISTING' | 'MINT_NEW' | 'AMBIGUOUS' {
  if (existingRows.length === 0) return 'MINT_NEW';
  if (existingRows.length === 1) return 'REUSE_EXISTING';
  return 'AMBIGUOUS';
}

export interface RepositoryIdentityMintOutcomeV1 {
  outcome: 'REUSED_EXISTING' | 'MINTED_NEW';
  row: RepositoryIdentityRowV1;
}

/**
 * Idempotent by (source_authority_repo_id): looks up first, mints only if absent. The caller is
 * responsible for wrapping this in a transaction and reading the row back before COMMIT.
 */
export async function mintOrReuseRepositoryIdentityV1(
  db: StableFileIdentityDbClient,
  request: RepositoryIdentityMintRequestV1,
): Promise<RepositoryIdentityMintOutcomeV1> {
  const existing = await db.query<RepositoryIdentityRowV1>(
    `SELECT repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
            gitmodule_name, origin_url, parent_repository_id, known_commit_oids, created_at
       FROM atlas_repository_identity
      WHERE source_authority_repo_id = $1`,
    [request.sourceAuthorityRepoId],
  );
  const decision = decideRepositoryIdentityMintV1(existing.rows);
  if (decision === 'AMBIGUOUS') {
    throw typedError(
      StableFileWriterErrorCode.REPOSITORY_IDENTITY_AMBIGUOUS,
      `${existing.rows.length} rows already exist for source_authority_repo_id=${request.sourceAuthorityRepoId}`,
    );
  }
  if (decision === 'REUSE_EXISTING') {
    return { outcome: 'REUSED_EXISTING', row: existing.rows[0] };
  }

  const repositoryId = randomUUIDv7();
  try {
    const inserted = await db.query<RepositoryIdentityRowV1>(
      `INSERT INTO atlas_repository_identity
          (repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
           gitmodule_name, origin_url, parent_repository_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
                  gitmodule_name, origin_url, parent_repository_id, known_commit_oids, created_at`,
      [
        repositoryId,
        request.sourceAuthorityRepoId,
        request.repositoryName,
        request.repositoryPath,
        request.repositoryKind,
        request.gitmoduleName ?? null,
        request.originUrl ?? null,
        request.parentRepositoryId ?? null,
      ],
    );
    return { outcome: 'MINTED_NEW', row: inserted.rows[0] };
  } catch (err) {
    // repositoryId is now random (UUIDv7), not deterministic -- a genuine concurrent mint for the
    // SAME sourceAuthorityRepoId can race past the SELECT-first check above. The live
    // UNIQUE (source_authority_repo_id) constraint on atlas_repository_identity is the real
    // safety net: on 23505 (unique_violation), re-read and return the row the OTHER transaction
    // actually won, rather than surfacing a raw constraint error or minting a second row.
    if (isPostgresUniqueViolation(err)) {
      const reread = await db.query<RepositoryIdentityRowV1>(
        `SELECT repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
                gitmodule_name, origin_url, parent_repository_id, known_commit_oids, created_at
           FROM atlas_repository_identity
          WHERE source_authority_repo_id = $1`,
        [request.sourceAuthorityRepoId],
      );
      if (reread.rows.length === 1) return { outcome: 'REUSED_EXISTING', row: reread.rows[0] };
    }
    throw err;
  }
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505';
}

// ---------------------------------------------------------------------------------------------
// StableFileIdentityV1 + StableFileRevisionBindingV1
// ---------------------------------------------------------------------------------------------

export interface StableFileCreateOrBindRequestV1 {
  repositoryId: string;
  sourceAuthorityRepoId: string;
  canonicalSourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
  provenance: string;
}

export interface StableFileRevisionBindingRowV1 {
  stable_file_id: string;
  repository_id: string;
  source_authority_repo_id: string;
  canonical_source_ref: string;
  workspace_revision: string;
  source_revision: string;
  content_digest: string;
  byte_length: string;
  source_identity_key: string;
  observed_at: string;
  provenance: string;
}

interface AdmittedSourceBindingRowV1 {
  repo_id: string;
  canonical_source_ref: string;
  workspace_revision: string;
  source_revision: string;
  content_digest: string;
}

/**
 * Builds the ONE canonical source_identity_key. Never accept this as caller input -- computing
 * it here, always scoped through repositoryId, is what makes path-only identity matching
 * structurally impossible (S08I-NO-PATH-ID-01) rather than merely a convention callers must
 * remember to follow.
 */
export function computeSourceIdentityKeyV1(repositoryId: string, canonicalSourceRef: string): string {
  return `${repositoryId}:${canonicalSourceRef}`;
}

/**
 * Verifies the repository referenced by `repositoryId` exists AND its source_authority_repo_id
 * matches the caller's independently-supplied `sourceAuthorityRepoId` -- a consistency check
 * that catches a caller passing a repositoryId for one repository while asserting a different
 * repository's external key (CROSS_REPOSITORY_IDENTITY_CONFLICT), not just repository absence.
 */
export async function verifyRepositoryIdentityV1(
  db: StableFileIdentityDbClient,
  repositoryId: string,
  sourceAuthorityRepoId: string,
): Promise<RepositoryIdentityRowV1> {
  const rows = await db.query<RepositoryIdentityRowV1>(
    `SELECT repository_id, source_authority_repo_id, repository_name, repository_path, repository_kind,
            gitmodule_name, origin_url, parent_repository_id, known_commit_oids, created_at
       FROM atlas_repository_identity WHERE repository_id = $1`,
    [repositoryId],
  );
  const row = rows.rows[0];
  if (!row) {
    throw typedError(StableFileWriterErrorCode.REPOSITORY_IDENTITY_MISSING, `no atlas_repository_identity row for repository_id=${repositoryId}`);
  }
  if (row.source_authority_repo_id !== sourceAuthorityRepoId) {
    throw typedError(
      StableFileWriterErrorCode.CROSS_REPOSITORY_IDENTITY_CONFLICT,
      `repository_id=${repositoryId} is bound to source_authority_repo_id=${row.source_authority_repo_id}, not the requested ${sourceAuthorityRepoId}`,
    );
  }
  return row;
}

/**
 * Verifies the exact admitted row exists in atlas_workspace_source_bindings for
 * (source_authority_repo_id, canonical_source_ref, source_revision, workspace_revision) --
 * never a latest-row lookup, never HEAD/Git-commit substitution -- and that the caller's own
 * sourceRevision/contentDigest pair is internally consistent AND matches the admitted row's
 * content_digest exactly. Reads atlas_workspace_source_bindings only; never writes to it.
 */
export async function verifySourceAuthorityBindingV1(
  db: StableFileIdentityDbClient,
  request: Pick<StableFileCreateOrBindRequestV1, 'sourceAuthorityRepoId' | 'canonicalSourceRef' | 'workspaceRevision' | 'sourceRevision' | 'contentDigest'>,
): Promise<AdmittedSourceBindingRowV1> {
  if (!REVISION_SHAPE_RE.test(request.workspaceRevision)) {
    throw typedError(StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH, `workspaceRevision does not match sha256 shape: ${request.workspaceRevision}`);
  }
  if (!REVISION_SHAPE_RE.test(request.sourceRevision)) {
    throw typedError(StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH, `sourceRevision does not match sha256 shape: ${request.sourceRevision}`);
  }
  if (!DIGEST_SHAPE_RE.test(request.contentDigest)) {
    throw typedError(StableFileWriterErrorCode.CONTENT_DIGEST_MISMATCH, `contentDigest does not match 64-hex shape: ${request.contentDigest}`);
  }
  if (request.sourceRevision !== `sha256:${request.contentDigest}`) {
    throw typedError(
      StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH,
      `sourceRevision (${request.sourceRevision}) is not sha256:contentDigest (sha256:${request.contentDigest})`,
    );
  }

  const admitted = await db.query<AdmittedSourceBindingRowV1>(
    `SELECT repo_id, canonical_source_ref, workspace_revision, source_revision, content_digest
       FROM atlas_workspace_source_bindings
      WHERE repo_id = $1 AND canonical_source_ref = $2 AND source_revision = $3 AND workspace_revision = $4`,
    [request.sourceAuthorityRepoId, request.canonicalSourceRef, request.sourceRevision, request.workspaceRevision],
  );
  const row = admitted.rows[0];
  if (!row) {
    throw typedError(
      StableFileWriterErrorCode.SOURCE_AUTHORITY_BINDING_MISSING,
      `no admitted atlas_workspace_source_bindings row for repo_id=${request.sourceAuthorityRepoId} canonical_source_ref=${request.canonicalSourceRef} source_revision=${request.sourceRevision} workspace_revision=${request.workspaceRevision}`,
    );
  }
  if (row.content_digest !== request.contentDigest) {
    throw typedError(
      StableFileWriterErrorCode.CONTENT_DIGEST_MISMATCH,
      `admitted content_digest (${row.content_digest}) does not match requested contentDigest (${request.contentDigest})`,
    );
  }
  return row;
}

/**
 * Pure: decide the lifecycle outcome from already-fetched rows.
 *  - no ACTIVE stable file for this sourceIdentityKey -> SAFE_NEW_ID (mint one; also the outcome
 *    for RECREATE_SAME_PATH, since a tombstoned predecessor is excluded by the ACTIVE-only lookup)
 *  - exactly one ACTIVE stable file, no binding yet for this workspaceRevision -> BOUND_NEW_REVISION_FOR_EXISTING_ID
 *  - exactly one ACTIVE stable file, binding for this workspaceRevision already exists -> SAFE_EXISTING_CONTINUITY (idempotent replay)
 *  - more than one ACTIVE stable file for the same sourceIdentityKey -> AMBIGUOUS_CONTINUITY (fail closed, never picked arbitrarily)
 */
export function decideStableFileMintV1(
  activeStableFileIdsForKey: string[],
  existingBindingForRevision: StableFileRevisionBindingRowV1 | null,
): 'SAFE_NEW_ID' | 'SAFE_EXISTING_CONTINUITY' | 'BOUND_NEW_REVISION_FOR_EXISTING_ID' | 'AMBIGUOUS_CONTINUITY' {
  if (activeStableFileIdsForKey.length > 1) return 'AMBIGUOUS_CONTINUITY';
  if (activeStableFileIdsForKey.length === 0) return 'SAFE_NEW_ID';
  return existingBindingForRevision ? 'SAFE_EXISTING_CONTINUITY' : 'BOUND_NEW_REVISION_FOR_EXISTING_ID';
}

export interface StableFileMintOutcomeV1 {
  outcome: 'SAFE_NEW_ID' | 'SAFE_EXISTING_CONTINUITY' | 'BOUND_NEW_REVISION_FOR_EXISTING_ID';
  stableFileId: string;
  binding: StableFileRevisionBindingRowV1;
}

/**
 * CREATE (mint a new stableFileId) or MODIFY (bind a new revision to an existing ACTIVE one).
 * Verifies, in order: (1) repositoryId exists and matches sourceAuthorityRepoId, (2) the exact
 * admitted source-authority binding exists and its digest matches. Only then looks up dedup
 * state and mints/binds. The caller wraps this in one transaction and reads the row(s) back
 * before COMMIT, matching the S01-10E/S01-08H apply-script pattern. Never mints when
 * AMBIGUOUS_CONTINUITY -- throws instead, per this repo's fail-closed rule.
 */
export async function mintOrBindStableFileV1(
  db: StableFileIdentityDbClient,
  request: StableFileCreateOrBindRequestV1,
): Promise<StableFileMintOutcomeV1> {
  await verifyRepositoryIdentityV1(db, request.repositoryId, request.sourceAuthorityRepoId);
  await verifySourceAuthorityBindingV1(db, request);

  const sourceIdentityKey = computeSourceIdentityKeyV1(request.repositoryId, request.canonicalSourceRef);

  const activeRows = await db.query<{ stable_file_id: string }>(
    `SELECT DISTINCT b.stable_file_id
       FROM atlas_stable_file_revision_binding b
       JOIN atlas_stable_file_identity f ON f.stable_file_id = b.stable_file_id
      WHERE b.source_identity_key = $1 AND f.lifecycle_state = 'ACTIVE'`,
    [sourceIdentityKey],
  );
  const activeStableFileIds = activeRows.rows.map((row) => row.stable_file_id);

  let existingBinding: StableFileRevisionBindingRowV1 | null = null;
  if (activeStableFileIds.length === 1) {
    const bindingRows = await db.query<StableFileRevisionBindingRowV1>(
      `SELECT * FROM atlas_stable_file_revision_binding WHERE stable_file_id = $1 AND workspace_revision = $2`,
      [activeStableFileIds[0], request.workspaceRevision],
    );
    existingBinding = bindingRows.rows[0] ?? null;
  }

  const decision = decideStableFileMintV1(activeStableFileIds, existingBinding);
  if (decision === 'AMBIGUOUS_CONTINUITY') {
    throw typedError(
      StableFileWriterErrorCode.STABLE_FILE_IDENTITY_AMBIGUOUS,
      `${activeStableFileIds.length} ACTIVE stable files share source_identity_key=${sourceIdentityKey}`,
    );
  }
  if (decision === 'SAFE_EXISTING_CONTINUITY') {
    return { outcome: decision, stableFileId: activeStableFileIds[0], binding: existingBinding! };
  }

  const stableFileId = decision === 'BOUND_NEW_REVISION_FOR_EXISTING_ID' ? activeStableFileIds[0] : randomUUIDv7();
  if (decision === 'SAFE_NEW_ID') {
    await db.query(`INSERT INTO atlas_stable_file_identity (stable_file_id, repository_id) VALUES ($1, $2)`, [
      stableFileId,
      request.repositoryId,
    ]);
  }

  const bindingResult = await db.query<StableFileRevisionBindingRowV1>(
    `INSERT INTO atlas_stable_file_revision_binding
        (stable_file_id, repository_id, source_authority_repo_id, canonical_source_ref, workspace_revision,
         source_revision, content_digest, byte_length, source_identity_key, provenance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
    [
      stableFileId,
      request.repositoryId,
      request.sourceAuthorityRepoId,
      request.canonicalSourceRef,
      request.workspaceRevision,
      request.sourceRevision,
      request.contentDigest,
      request.byteLength,
      sourceIdentityKey,
      request.provenance,
    ],
  );
  return { outcome: decision, stableFileId, binding: bindingResult.rows[0] };
}
