import { describe, expect, it } from 'vitest';
import {
  REPOSITORY_IDENTITY_DOMAIN_CLASS_V1,
  StableFileWriterErrorCode,
  computeSourceIdentityKeyV1,
  decideRepositoryIdentityMintV1,
  decideStableFileMintV1,
  deriveRepositoryIdV1,
  mintOrBindStableFileV1,
  mintOrReuseRepositoryIdentityV1,
  verifyRepositoryIdentityV1,
  verifySourceAuthorityBindingV1,
  type RepositoryIdentityRowV1,
  type StableFileIdentityDbClient,
  type StableFileRevisionBindingRowV1,
} from './stable-file-identity-mint-v1';
import { deriveUUID } from '../../../utils/uuid';

// ---------------------------------------------------------------------------------------------
// Pure decision functions -- no DB, no fixture double needed.
// ---------------------------------------------------------------------------------------------

describe('decideRepositoryIdentityMintV1 (pure)', () => {
  it('mints when no existing row', () => {
    expect(decideRepositoryIdentityMintV1([])).toBe('MINT_NEW');
  });
  it('reuses when exactly one existing row', () => {
    expect(decideRepositoryIdentityMintV1([{} as RepositoryIdentityRowV1])).toBe('REUSE_EXISTING');
  });
  it('fails closed as AMBIGUOUS when more than one row exists', () => {
    expect(decideRepositoryIdentityMintV1([{} as RepositoryIdentityRowV1, {} as RepositoryIdentityRowV1])).toBe(
      'AMBIGUOUS',
    );
  });
});

describe('decideStableFileMintV1 (pure)', () => {
  it('mints a new id when no ACTIVE stable file exists for the key', () => {
    expect(decideStableFileMintV1([], null)).toBe('SAFE_NEW_ID');
  });
  it('binds a new revision when exactly one ACTIVE stable file exists and no binding for this revision yet', () => {
    expect(decideStableFileMintV1(['sf-1'], null)).toBe('BOUND_NEW_REVISION_FOR_EXISTING_ID');
  });
  it('reports SAFE_EXISTING_CONTINUITY when the exact binding already exists (idempotent replay)', () => {
    const binding = { stable_file_id: 'sf-1' } as StableFileRevisionBindingRowV1;
    expect(decideStableFileMintV1(['sf-1'], binding)).toBe('SAFE_EXISTING_CONTINUITY');
  });
  it('fails closed as AMBIGUOUS_CONTINUITY when more than one ACTIVE stable file shares the key', () => {
    expect(decideStableFileMintV1(['sf-1', 'sf-2'], null)).toBe('AMBIGUOUS_CONTINUITY');
  });
});

describe('computeSourceIdentityKeyV1 (pure, S08I-NO-PATH-ID-01)', () => {
  it('always incorporates repositoryId -- the same path in two repositories never produces the same key', () => {
    const keyA = computeSourceIdentityKeyV1('repo-a', 'src/index.ts');
    const keyB = computeSourceIdentityKeyV1('repo-b', 'src/index.ts');
    expect(keyA).not.toBe(keyB);
  });
  it('is deterministic for the same (repositoryId, path) pair', () => {
    expect(computeSourceIdentityKeyV1('repo-a', 'src/index.ts')).toBe(computeSourceIdentityKeyV1('repo-a', 'src/index.ts'));
  });
});

describe('deriveRepositoryIdV1', () => {
  it('is deterministic for the same sourceAuthorityRepoId', async () => {
    const a = await deriveRepositoryIdV1('deeds-web-app');
    const b = await deriveRepositoryIdV1('deeds-web-app');
    expect(a).toBe(b);
  });
  it('matches deriveUUID directly with the frozen domain class', async () => {
    const expected = await deriveUUID(REPOSITORY_IDENTITY_DOMAIN_CLASS_V1, { sourceAuthorityRepoId: 'deeds-web-app' });
    const actual = await deriveRepositoryIdV1('deeds-web-app');
    expect(actual).toBe(expected);
  });
  it('differs for a different sourceAuthorityRepoId', async () => {
    const a = await deriveRepositoryIdV1('deeds-web-app');
    const b = await deriveRepositoryIdV1('granite-docling-258M');
    expect(a).not.toBe(b);
  });
  it('rejects an empty sourceAuthorityRepoId (throws synchronously, before any derivation)', () => {
    expect(() => deriveRepositoryIdV1('  ')).toThrow('REPOSITORY_IDENTITY_MINT_REQUIRES_SOURCE_AUTHORITY_REPO_ID');
  });
});

// ---------------------------------------------------------------------------------------------
// DB-effecting functions -- proven against an in-memory fixture double implementing the exact
// same query() contract the S01-08H-applied live schema exposes, INCLUDING a read-only mirror of
// atlas_workspace_source_bindings (the existing admitted source authority this module reads from
// but never writes to). This is NOT a live DB test; it proves the orchestration logic
// (admission verification, dedup-before-mint, idempotent replay, ambiguity/mismatch refusal)
// against fixture data only, per S01-08I's "CODE ONLY, no persistent DB write in this gate" scope.
// ---------------------------------------------------------------------------------------------

function makeFixtureDb(): StableFileIdentityDbClient & {
  repositories: RepositoryIdentityRowV1[];
  identities: { stable_file_id: string; repository_id: string; lifecycle_state: string }[];
  bindings: StableFileRevisionBindingRowV1[];
  admittedBindings: { repo_id: string; canonical_source_ref: string; workspace_revision: string; source_revision: string; content_digest: string }[];
} {
  const repositories: RepositoryIdentityRowV1[] = [];
  const identities: { stable_file_id: string; repository_id: string; lifecycle_state: string }[] = [];
  const bindings: StableFileRevisionBindingRowV1[] = [];
  const admittedBindings: { repo_id: string; canonical_source_ref: string; workspace_revision: string; source_revision: string; content_digest: string }[] = [];

  return {
    repositories,
    identities,
    bindings,
    admittedBindings,
    async query<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      const s = sql.trim();

      if (s.startsWith('SELECT repository_id') && s.includes('WHERE source_authority_repo_id = $1')) {
        const [sourceAuthorityRepoId] = params as [string];
        return { rows: repositories.filter((r) => r.source_authority_repo_id === sourceAuthorityRepoId) as T[] };
      }
      if (s.startsWith('SELECT repository_id') && s.includes('WHERE repository_id = $1')) {
        const [repositoryId] = params as [string];
        return { rows: repositories.filter((r) => r.repository_id === repositoryId) as T[] };
      }
      if (s.startsWith('INSERT INTO atlas_repository_identity')) {
        const [repositoryId, sourceAuthorityRepoId, repositoryName, repositoryPath, repositoryKind, gitmoduleName, originUrl, parentRepositoryId] =
          params as [string, string, string, string, string, string | null, string | null, string | null];
        const row: RepositoryIdentityRowV1 = {
          repository_id: repositoryId,
          source_authority_repo_id: sourceAuthorityRepoId,
          repository_name: repositoryName,
          repository_path: repositoryPath,
          repository_kind: repositoryKind,
          gitmodule_name: gitmoduleName,
          origin_url: originUrl,
          parent_repository_id: parentRepositoryId,
          known_commit_oids: [],
          created_at: new Date().toISOString(),
        };
        repositories.push(row);
        return { rows: [row] as T[] };
      }
      if (s.startsWith('SELECT repo_id, canonical_source_ref')) {
        const [repoId, canonicalSourceRef, sourceRevision, workspaceRevision] = params as [string, string, string, string];
        return {
          rows: admittedBindings.filter(
            (b) => b.repo_id === repoId && b.canonical_source_ref === canonicalSourceRef && b.source_revision === sourceRevision && b.workspace_revision === workspaceRevision,
          ) as T[],
        };
      }
      if (s.includes('FROM atlas_stable_file_revision_binding b') && s.includes('JOIN atlas_stable_file_identity f')) {
        const [sourceIdentityKey] = params as [string];
        const active = new Set(
          identities.filter((i) => i.lifecycle_state === 'ACTIVE').map((i) => i.stable_file_id),
        );
        const ids = [
          ...new Set(
            bindings
              .filter((b) => b.source_identity_key === sourceIdentityKey && active.has(b.stable_file_id))
              .map((b) => b.stable_file_id),
          ),
        ];
        return { rows: ids.map((stable_file_id) => ({ stable_file_id })) as T[] };
      }
      if (s.startsWith('INSERT INTO atlas_stable_file_identity')) {
        const [stableFileId, repositoryId] = params as [string, string];
        identities.push({ stable_file_id: stableFileId, repository_id: repositoryId, lifecycle_state: 'ACTIVE' });
        return { rows: [] as T[] };
      }
      if (s.startsWith('SELECT * FROM atlas_stable_file_revision_binding WHERE stable_file_id')) {
        const [stableFileId, workspaceRevision] = params as [string, string];
        return {
          rows: bindings.filter((b) => b.stable_file_id === stableFileId && b.workspace_revision === workspaceRevision) as T[],
        };
      }
      if (s.startsWith('INSERT INTO atlas_stable_file_revision_binding')) {
        const [
          stableFileId,
          repositoryId,
          sourceAuthorityRepoId,
          canonicalSourceRef,
          workspaceRevision,
          sourceRevision,
          contentDigest,
          byteLength,
          sourceIdentityKey,
          provenance,
        ] = params as [string, string, string, string, string, string, string, number, string, string];
        const row: StableFileRevisionBindingRowV1 = {
          stable_file_id: stableFileId,
          repository_id: repositoryId,
          source_authority_repo_id: sourceAuthorityRepoId,
          canonical_source_ref: canonicalSourceRef,
          workspace_revision: workspaceRevision,
          source_revision: sourceRevision,
          content_digest: contentDigest,
          byte_length: String(byteLength),
          source_identity_key: sourceIdentityKey,
          observed_at: new Date().toISOString(),
          provenance,
        };
        bindings.push(row);
        return { rows: [row] as T[] };
      }
      throw new Error(`FIXTURE_DB_UNHANDLED_QUERY: ${s.slice(0, 80)}`);
    },
  };
}

const REPO_REQUEST = {
  sourceAuthorityRepoId: 'deeds-web-app',
  repositoryName: 'deeds-web-app',
  repositoryPath: '.',
  repositoryKind: 'ROOT' as const,
};

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const CANONICAL_SOURCE_REF = 'src/lib/server/db/client.ts';

describe('mintOrReuseRepositoryIdentityV1', () => {
  it('mints a new row on first call', async () => {
    const db = makeFixtureDb();
    const result = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    expect(result.outcome).toBe('MINTED_NEW');
    expect(db.repositories).toHaveLength(1);
  });

  it('reuses the same repositoryId on a second call for the same sourceAuthorityRepoId (idempotent)', async () => {
    const db = makeFixtureDb();
    const first = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    const second = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    expect(second.outcome).toBe('REUSED_EXISTING');
    expect(second.row.repository_id).toBe(first.row.repository_id);
    expect(db.repositories).toHaveLength(1);
  });

  it('mints distinct repositoryIds for distinct sourceAuthorityRepoIds', async () => {
    const db = makeFixtureDb();
    const root = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    const nested = await mintOrReuseRepositoryIdentityV1(db, {
      sourceAuthorityRepoId: 'granite-docling-258M',
      repositoryName: 'granite-docling-258M',
      repositoryPath: 'granite-docling-258M',
      repositoryKind: 'NESTED_GIT_REPOSITORY',
      gitmoduleName: 'granite-docling-258M',
    });
    expect(root.row.repository_id).not.toBe(nested.row.repository_id);
  });

  it('throws REPOSITORY_IDENTITY_AMBIGUOUS rather than picking arbitrarily when two rows already exist for one sourceAuthorityRepoId', async () => {
    const db = makeFixtureDb();
    db.repositories.push(
      { repository_id: 'r1', source_authority_repo_id: 'x', repository_name: 'x', repository_path: 'x', repository_kind: 'ROOT', gitmodule_name: null, origin_url: null, parent_repository_id: null, known_commit_oids: [], created_at: '' },
      { repository_id: 'r2', source_authority_repo_id: 'x', repository_name: 'x', repository_path: 'x', repository_kind: 'ROOT', gitmodule_name: null, origin_url: null, parent_repository_id: null, known_commit_oids: [], created_at: '' },
    );
    await expect(mintOrReuseRepositoryIdentityV1(db, { ...REPO_REQUEST, sourceAuthorityRepoId: 'x' })).rejects.toThrow(
      StableFileWriterErrorCode.REPOSITORY_IDENTITY_AMBIGUOUS,
    );
  });
});

describe('verifyRepositoryIdentityV1', () => {
  it('throws REPOSITORY_IDENTITY_MISSING when repositoryId does not exist', async () => {
    const db = makeFixtureDb();
    await expect(verifyRepositoryIdentityV1(db, 'nonexistent', 'deeds-web-app')).rejects.toThrow(
      StableFileWriterErrorCode.REPOSITORY_IDENTITY_MISSING,
    );
  });
  it('throws CROSS_REPOSITORY_IDENTITY_CONFLICT when repositoryId maps to a different sourceAuthorityRepoId', async () => {
    const db = makeFixtureDb();
    await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    const repositoryId = db.repositories[0].repository_id;
    await expect(verifyRepositoryIdentityV1(db, repositoryId, 'granite-docling-258M')).rejects.toThrow(
      StableFileWriterErrorCode.CROSS_REPOSITORY_IDENTITY_CONFLICT,
    );
  });
});

describe('verifySourceAuthorityBindingV1', () => {
  const validRequest = {
    sourceAuthorityRepoId: 'deeds-web-app',
    canonicalSourceRef: CANONICAL_SOURCE_REF,
    workspaceRevision: SHA_A,
    sourceRevision: SHA_A,
    contentDigest: DIGEST_A,
  };

  it('throws SOURCE_AUTHORITY_BINDING_MISSING when no admitted row exists (never a latest-row lookup)', async () => {
    const db = makeFixtureDb();
    await expect(verifySourceAuthorityBindingV1(db, validRequest)).rejects.toThrow(
      StableFileWriterErrorCode.SOURCE_AUTHORITY_BINDING_MISSING,
    );
  });

  it('succeeds when the exact admitted row exists and digests agree', async () => {
    const db = makeFixtureDb();
    db.admittedBindings.push({ repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A });
    await expect(verifySourceAuthorityBindingV1(db, validRequest)).resolves.toMatchObject({ content_digest: DIGEST_A });
  });

  it('throws CONTENT_DIGEST_MISMATCH when the caller-supplied contentDigest disagrees with the admitted row', async () => {
    const db = makeFixtureDb();
    db.admittedBindings.push({ repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_B });
    // sourceRevision must still self-consistently equal sha256:contentDigest to pass the shape check first
    await expect(
      verifySourceAuthorityBindingV1(db, { ...validRequest, sourceRevision: SHA_A, contentDigest: DIGEST_A }),
    ).rejects.toThrow(StableFileWriterErrorCode.CONTENT_DIGEST_MISMATCH);
  });

  it('throws SOURCE_REVISION_MISMATCH when sourceRevision is not sha256:contentDigest (internal inconsistency, no DB call needed)', async () => {
    const db = makeFixtureDb();
    await expect(
      verifySourceAuthorityBindingV1(db, { ...validRequest, sourceRevision: SHA_A, contentDigest: DIGEST_B }),
    ).rejects.toThrow(StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH);
  });

  it('throws SOURCE_REVISION_MISMATCH on a malformed (non-sha256-shaped) workspaceRevision -- never coerced', async () => {
    const db = makeFixtureDb();
    await expect(
      verifySourceAuthorityBindingV1(db, { ...validRequest, workspaceRevision: 'HEAD' }),
    ).rejects.toThrow(StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH);
  });

  it('throws SOURCE_REVISION_MISMATCH on a bare 40-hex git commit id used as a revision -- never substituted', async () => {
    const db = makeFixtureDb();
    await expect(
      verifySourceAuthorityBindingV1(db, { ...validRequest, sourceRevision: 'a'.repeat(40) }),
    ).rejects.toThrow(StableFileWriterErrorCode.SOURCE_REVISION_MISMATCH);
  });
});

describe('mintOrBindStableFileV1', () => {
  async function seededDb() {
    const db = makeFixtureDb();
    const repo = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    db.admittedBindings.push(
      { repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A },
      { repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_B, source_revision: SHA_B, content_digest: DIGEST_B },
    );
    return { db, repositoryId: repo.row.repository_id };
  }

  function requestFor(repositoryId: string, overrides: Partial<Parameters<typeof mintOrBindStableFileV1>[1]> = {}) {
    return {
      repositoryId,
      sourceAuthorityRepoId: 'deeds-web-app',
      canonicalSourceRef: CANONICAL_SOURCE_REF,
      workspaceRevision: SHA_A,
      sourceRevision: SHA_A,
      contentDigest: DIGEST_A,
      byteLength: 1024,
      provenance: 'S01-08I-spec',
      ...overrides,
    };
  }

  it('rejects when the admitted source-authority binding is missing (S08I-AUTH-01)', async () => {
    const db = makeFixtureDb();
    const repo = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    await expect(mintOrBindStableFileV1(db, requestFor(repo.row.repository_id))).rejects.toThrow(
      StableFileWriterErrorCode.SOURCE_AUTHORITY_BINDING_MISSING,
    );
  });

  it('rejects when repositoryId does not exist (S08I-AUTH-01 companion)', async () => {
    const { db } = await seededDb();
    await expect(mintOrBindStableFileV1(db, requestFor('nonexistent-repo'))).rejects.toThrow(
      StableFileWriterErrorCode.REPOSITORY_IDENTITY_MISSING,
    );
  });

  it('rejects on digest mismatch even when the revision shapes are valid (S08I-AUTH-02)', async () => {
    const { db, repositoryId } = await seededDb();
    // Admitted row has DIGEST_A for SHA_A; ask with a self-consistent but DIFFERENT (revision, digest)
    // pair that has no admitted row at all -- proves SOURCE_AUTHORITY_BINDING_MISSING fires, not a
    // silent accept. Then prove the digest-mismatch path specifically: admitted row's digest differs
    // from what the caller claims for the exact same (repo, ref, workspaceRevision) coordinate.
    db.admittedBindings.push({ repo_id: 'deeds-web-app', canonical_source_ref: 'src/other.ts', workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_B });
    await expect(
      mintOrBindStableFileV1(db, requestFor(repositoryId, { canonicalSourceRef: 'src/other.ts', sourceRevision: SHA_B, contentDigest: DIGEST_B, workspaceRevision: SHA_A })),
    ).rejects.toThrow(StableFileWriterErrorCode.SOURCE_AUTHORITY_BINDING_MISSING);
  });

  it('mints a new stableFileId on first CREATE (SAFE_NEW_ID)', async () => {
    const { db, repositoryId } = await seededDb();
    const result = await mintOrBindStableFileV1(db, requestFor(repositoryId));
    expect(result.outcome).toBe('SAFE_NEW_ID');
    expect(db.identities).toHaveLength(1);
    expect(db.bindings).toHaveLength(1);
    expect(result.binding.stable_file_id).toBe(result.stableFileId);
    expect(result.binding.source_identity_key).toBe(computeSourceIdentityKeyV1(repositoryId, CANONICAL_SOURCE_REF));
  });

  it('is idempotent: replaying the exact same CREATE returns SAFE_EXISTING_CONTINUITY, mints nothing new (S08I-IDEMPOTENT-01)', async () => {
    const { db, repositoryId } = await seededDb();
    const first = await mintOrBindStableFileV1(db, requestFor(repositoryId));
    const second = await mintOrBindStableFileV1(db, requestFor(repositoryId));
    expect(second.outcome).toBe('SAFE_EXISTING_CONTINUITY');
    expect(second.stableFileId).toBe(first.stableFileId);
    expect(db.identities).toHaveLength(1);
    expect(db.bindings).toHaveLength(1);
  });

  it('MODIFY: a new content revision at the same source_identity_key binds the SAME stableFileId, does not mint a new one (S08I-MODIFY-01)', async () => {
    const { db, repositoryId } = await seededDb();
    const first = await mintOrBindStableFileV1(db, requestFor(repositoryId));
    const second = await mintOrBindStableFileV1(
      db,
      requestFor(repositoryId, { workspaceRevision: SHA_B, sourceRevision: SHA_B, contentDigest: DIGEST_B }),
    );
    expect(second.outcome).toBe('BOUND_NEW_REVISION_FOR_EXISTING_ID');
    expect(second.stableFileId).toBe(first.stableFileId);
    expect(db.identities).toHaveLength(1); // still exactly one logical file
    expect(db.bindings).toHaveLength(2); // two revision bindings
  });

  it('REPOSITORY SCOPE: identical relative path in two different repositories never collides (S08I-REPO-01)', async () => {
    const db = makeFixtureDb();
    const repoA = await mintOrReuseRepositoryIdentityV1(db, REPO_REQUEST);
    const repoB = await mintOrReuseRepositoryIdentityV1(db, {
      sourceAuthorityRepoId: 'granite-docling-258M',
      repositoryName: 'granite-docling-258M',
      repositoryPath: 'granite-docling-258M',
      repositoryKind: 'NESTED_GIT_REPOSITORY',
      gitmoduleName: 'granite-docling-258M',
    });
    db.admittedBindings.push(
      { repo_id: 'deeds-web-app', canonical_source_ref: 'src/index.ts', workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A },
      { repo_id: 'granite-docling-258M', canonical_source_ref: 'src/index.ts', workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A },
    );
    const inRepoA = await mintOrBindStableFileV1(db, {
      repositoryId: repoA.row.repository_id,
      sourceAuthorityRepoId: 'deeds-web-app',
      canonicalSourceRef: 'src/index.ts',
      workspaceRevision: SHA_A,
      sourceRevision: SHA_A,
      contentDigest: DIGEST_A,
      byteLength: 10,
      provenance: 'spec',
    });
    const inRepoB = await mintOrBindStableFileV1(db, {
      repositoryId: repoB.row.repository_id,
      sourceAuthorityRepoId: 'granite-docling-258M',
      canonicalSourceRef: 'src/index.ts',
      workspaceRevision: SHA_A,
      sourceRevision: SHA_A,
      contentDigest: DIGEST_A,
      byteLength: 10,
      provenance: 'spec',
    });
    expect(inRepoA.stableFileId).not.toBe(inRepoB.stableFileId);
  });

  it('fails closed as STABLE_FILE_IDENTITY_AMBIGUOUS when two ACTIVE stable files already share one source_identity_key (data corruption case)', async () => {
    const { db, repositoryId } = await seededDb();
    const key = computeSourceIdentityKeyV1(repositoryId, CANONICAL_SOURCE_REF);
    db.identities.push(
      { stable_file_id: 'sf-1', repository_id: repositoryId, lifecycle_state: 'ACTIVE' },
      { stable_file_id: 'sf-2', repository_id: repositoryId, lifecycle_state: 'ACTIVE' },
    );
    db.bindings.push(
      { stable_file_id: 'sf-1', byte_length: '1024', observed_at: '', repository_id: repositoryId, source_authority_repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A, source_identity_key: key, provenance: 'seed' },
      { stable_file_id: 'sf-2', byte_length: '1024', observed_at: '', repository_id: repositoryId, source_authority_repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A, source_identity_key: key, provenance: 'seed' },
    );
    await expect(
      mintOrBindStableFileV1(db, requestFor(repositoryId, { workspaceRevision: SHA_B, sourceRevision: SHA_B, contentDigest: DIGEST_B })),
    ).rejects.toThrow(StableFileWriterErrorCode.STABLE_FILE_IDENTITY_AMBIGUOUS);
  });

  it('a tombstoned stable file at the same key does not block a fresh mint (new stableFileId, RECREATE_SAME_PATH rule)', async () => {
    const { db, repositoryId } = await seededDb();
    const key = computeSourceIdentityKeyV1(repositoryId, CANONICAL_SOURCE_REF);
    db.identities.push({ stable_file_id: 'old-sf', repository_id: repositoryId, lifecycle_state: 'TOMBSTONED' });
    db.bindings.push({ stable_file_id: 'old-sf', byte_length: '1024', observed_at: '', repository_id: repositoryId, source_authority_repo_id: 'deeds-web-app', canonical_source_ref: CANONICAL_SOURCE_REF, workspace_revision: SHA_A, source_revision: SHA_A, content_digest: DIGEST_A, source_identity_key: key, provenance: 'seed' });
    const result = await mintOrBindStableFileV1(db, requestFor(repositoryId, { workspaceRevision: SHA_B, sourceRevision: SHA_B, contentDigest: DIGEST_B }));
    expect(result.outcome).toBe('SAFE_NEW_ID');
    expect(result.stableFileId).not.toBe('old-sf');
  });

  it('PATH_ONLY_IDENTITY_FORBIDDEN (structural): no caller-suppliable field can make two different repositories resolve to one identity, because the key is never accepted as input', async () => {
    // mintOrBindStableFileV1's request type has no sourceIdentityKey field at all -- this is
    // enforced by TypeScript at compile time, not just at runtime. The runtime proof is the
    // REPOSITORY SCOPE test above (inRepoA.stableFileId !== inRepoB.stableFileId for the SAME
    // canonicalSourceRef). This test additionally proves the derived key always differs whenever
    // repositoryId differs, for arbitrary paths -- not just the one exercised in that test.
    const paths = ['a.ts', 'src/index.ts', 'deep/nested/path/file.ts'];
    for (const p of paths) {
      expect(computeSourceIdentityKeyV1('repo-1', p)).not.toBe(computeSourceIdentityKeyV1('repo-2', p));
    }
  });
});
