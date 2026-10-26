import { describe, it, expect } from 'vitest';
import { selectRoundRobinSourcesWithCursor } from './graphify-run-source-readback-v1.mjs';
import {
  selectNextRoundRobinAstBatchV1,
  verifyParserCompletenessV1,
  sealAstCoverageLedgerV1,
  settleAstCoverageBatchV1,
  type SealedSourceEntryV1,
  type AstCoverageLedgerV1,
  type AstParserCompletenessReceiptV1
} from './ast-incremental-coverage-cursor-v1.mjs';

describe('AST Incremental Coverage Cursor & Completeness Gates', () => {
  const allowedRepoIds = new Set(['main-repo']);
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const workspaceRevision = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const snapshotManifestSha256 = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const extractorVersion = 'tree-sitter-4.0.0';

  const resumeFixture = () => {
    const sources: SealedSourceEntryV1[] = ['a', 'b', 'c', 'd'].map((name) => ({
      canonicalSourceId: `id:${name}`,
      repoId: 'main-repo',
      relativePath: `src/${name}/file.ts`,
      sha256Hex: '1'.repeat(64),
      byteLength: 10,
      isSymlink: false
    }));
    const params = {
      sources, allowedRepoIds, workspaceId, workspaceRevision,
      snapshotManifestSha256, extractorVersion, batchSize: 2
    };
    return { params, ledger: selectNextRoundRobinAstBatchV1(params).nextLedgerPreExecution };
  };

  const receiptFor = (source: SealedSourceEntryV1): AstParserCompletenessReceiptV1 => ({
    canonicalSourceId: source.canonicalSourceId,
    sourceSha256Hex: source.sha256Hex,
    readbackBytesVerified: true,
    extractorVersion,
    utf8ByteLength: source.byteLength,
    rootNodeHasError: false,
    errorNodeCount: 0,
    missingNodeCount: 0,
    chunkCount: 0,
    edgeCount: 0
  });

  it('settles exact selected sources once and preserves outcome evidence on resume', () => {
    const { params } = resumeFixture();
    const batch = selectNextRoundRobinAstBatchV1(params);
    const results = batch.selectedBatch.map((source) => ({
      canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
    }));
    const settled = settleAstCoverageBatchV1({ ledger: batch.nextLedgerPreExecution, selectedBatch: batch.selectedBatch, results });
    expect(batch.nextLedgerPreExecution.statusBySourceId['id:a']).toBe('PENDING');
    expect(settled.statusBySourceId['id:a']).toBe('COMPLETED');
    expect(settled.attemptsBySourceId['id:a']).toBe(1);
    expect(settled.lastOutcomeBySourceId?.['id:a'].parserReceipt).toEqual(results[0].parserReceipt);
    const resumed = selectNextRoundRobinAstBatchV1({ ...params, previousLedger: JSON.parse(JSON.stringify(settled)) });
    expect(resumed.selectedBatch.map((source) => source.canonicalSourceId)).toEqual(['id:c', 'id:d']);
    expect(() => settleAstCoverageBatchV1({ ledger: settled, selectedBatch: batch.selectedBatch, results }))
      .toThrow('AST_BATCH_ALREADY_SETTLED_OR_INVALID');
  });

  it('records retryable failure and parser quarantine without counting either as complete', () => {
    const { params } = resumeFixture();
    const batch = selectNextRoundRobinAstBatchV1(params);
    const settled = settleAstCoverageBatchV1({
      ledger: batch.nextLedgerPreExecution, selectedBatch: batch.selectedBatch,
      results: [
        { canonicalSourceId: 'id:a', failure: 'SIDECAR_TIMEOUT' },
        { canonicalSourceId: 'id:b', parserReceipt: { ...receiptFor(batch.selectedBatch[1]), missingNodeCount: 1 } }
      ]
    });
    expect(settled.statusBySourceId['id:a']).toBe('FAILED_RETRYABLE');
    expect(settled.statusBySourceId['id:b']).toBe('QUARANTINED_PARSE_INCOMPLETE');
    expect(settled.lastOutcomeBySourceId?.['id:a'].reason).toBe('SIDECAR_TIMEOUT');
    expect(settled.lastOutcomeBySourceId?.['id:b'].reason).toContain('missingNodes=1');
    expect(settled.attemptsBySourceId['id:a']).toBe(1);
    expect(settled.attemptsBySourceId['id:b']).toBe(1);
  });

  it('refuses incomplete, duplicate, or substituted batch results atomically', () => {
    const { params } = resumeFixture();
    const batch = selectNextRoundRobinAstBatchV1(params);
    const result = { canonicalSourceId: 'id:a', parserReceipt: receiptFor(batch.selectedBatch[0]) };
    for (const results of [[result], [result, result], [result, { ...result, canonicalSourceId: 'unknown' }]]) {
      expect(() => settleAstCoverageBatchV1({ ledger: batch.nextLedgerPreExecution, selectedBatch: batch.selectedBatch, results }))
        .toThrow('AST_BATCH_RESULT_MEMBERSHIP_MISMATCH');
    }
    expect(() => settleAstCoverageBatchV1({
      ledger: batch.nextLedgerPreExecution,
      selectedBatch: [params.sources[2], params.sources[3]],
      results: [{ canonicalSourceId: 'id:c', failure: 'timeout' }, { canonicalSourceId: 'id:d', failure: 'timeout' }]
    })).toThrow('AST_BATCH_RESULT_MEMBERSHIP_MISMATCH');
    expect(batch.nextLedgerPreExecution.attemptsBySourceId['id:a']).toBe(0);
  });

  it('refuses parser identity mismatch and never completes unverified source bytes', () => {
    const { params } = resumeFixture();
    const batch = selectNextRoundRobinAstBatchV1(params);
    const results = batch.selectedBatch.map((source) => ({
      canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
    }));
    for (const patch of [{ canonicalSourceId: 'other' }, { extractorVersion: 'other' }]) {
      expect(() => settleAstCoverageBatchV1({
        ledger: batch.nextLedgerPreExecution, selectedBatch: batch.selectedBatch,
        results: [{ ...results[0], parserReceipt: { ...results[0].parserReceipt, ...patch } }, results[1]]
      })).toThrow('AST_BATCH_PARSER_IDENTITY_MISMATCH');
    }
    const settled = settleAstCoverageBatchV1({
      ledger: batch.nextLedgerPreExecution, selectedBatch: batch.selectedBatch,
      results: [{ ...results[0], parserReceipt: { ...results[0].parserReceipt, readbackBytesVerified: false } }, results[1]]
    });
    expect(settled.statusBySourceId['id:a']).toBe('FAILED_RETRYABLE');
    expect(settled.lastOutcomeBySourceId?.['id:a'].reason).toBe('SEALED_SOURCE_READBACK_UNVERIFIED');
  });

  it('delegates ordering to the existing Graphify selector without changing source identity', () => {
    const { params } = resumeFixture();
    const reference = selectRoundRobinSourcesWithCursor(params.sources.map((source) => ({
      ...source, sourceId: source.canonicalSourceId
    })), { limit: params.batchSize, workspaceRevision, snapshotManifestDigest: snapshotManifestSha256 });
    const actual = selectNextRoundRobinAstBatchV1(params);
    expect(actual.selectedBatch.map((source) => source.canonicalSourceId))
      .toEqual(reference.selected.map((source: { sourceId: string }) => source.sourceId));
    expect(actual.selectedBatch[0]).toBe(params.sources[0]);
  });

  it('rejects duplicate IDs and invalid source paths instead of skipping coverage silently', () => {
    const { params } = resumeFixture();
    expect(() => selectNextRoundRobinAstBatchV1({
      ...params, sources: [params.sources[0], params.sources[0]]
    })).toThrow('AST_SOURCE_ID_INVALID_OR_DUPLICATE');
    for (const relativePath of ['', '..', '../outside.ts', '/outside.ts', 'C:/outside.ts', 'src/\u0000.ts']) {
      expect(() => selectNextRoundRobinAstBatchV1({
        ...params, sources: [{ ...params.sources[0], relativePath }]
      })).toThrow('AST_SOURCE_INVALID_RELATIVE_PATH');
    }
  });

  it('replays a JSON-restored ledger deterministically without marking selection completed', () => {
    const { params, ledger } = resumeFixture();
    const expected = selectNextRoundRobinAstBatchV1({ ...params, previousLedger: ledger });
    const restored = JSON.parse(JSON.stringify(ledger)) as AstCoverageLedgerV1;
    expect(selectNextRoundRobinAstBatchV1({ ...params, previousLedger: restored })).toEqual(expected);
    expect(Object.values(restored.statusBySourceId)).toEqual(['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    expect(ledger.batchSequenceNumber).toBe(1);
  });

  it('refuses a changed completion status with an unrecomputed checksum', () => {
    const { params, ledger } = resumeFixture();
    const modified: AstCoverageLedgerV1 = {
      ...ledger, statusBySourceId: { ...ledger.statusBySourceId, 'id:a': 'COMPLETED' }
    };
    expect(() => selectNextRoundRobinAstBatchV1({ ...params, previousLedger: modified }))
      .toThrow('AST_CURSOR_LEDGER_CHECKSUM_MISMATCH');
  });

  it('refuses cross-workspace and changed-extractor resumes', () => {
    const { params, ledger } = resumeFixture();
    expect(() => selectNextRoundRobinAstBatchV1({
      ...params, workspaceId: 'different-workspace', previousLedger: ledger
    })).toThrow('AST_CURSOR_WORKSPACE_ID_MISMATCH');
    expect(() => selectNextRoundRobinAstBatchV1({
      ...params, extractorVersion: 'different-extractor', previousLedger: ledger
    })).toThrow('AST_CURSOR_EXTRACTOR_VERSION_MISMATCH');
  });

  it('rejects malformed persisted state even when its checksum was recomputed', () => {
    const { params, ledger } = resumeFixture();
    for (const invalid of [
      { ...ledger, batchSequenceNumber: -1 },
      { ...ledger, attemptsBySourceId: { ...ledger.attemptsBySourceId, 'id:a': -1 } },
      { ...ledger, statusBySourceId: { ...ledger.statusBySourceId, unknown: 'COMPLETED' } },
      { ...ledger, attemptsBySourceId: { ...ledger.attemptsBySourceId, unknown: 1 } }
    ]) {
      expect(() => selectNextRoundRobinAstBatchV1({
        ...params, previousLedger: sealAstCoverageLedgerV1(invalid as AstCoverageLedgerV1)
      })).toThrow('AST_CURSOR_LEDGER_STATE_INVALID');
    }
  });

  it('keeps retries and quarantines distinct from completed sources after serialization', () => {
    const { params, ledger } = resumeFixture();
    const settled = sealAstCoverageLedgerV1({
      ...ledger,
      statusBySourceId: {
        'id:a': 'COMPLETED', 'id:b': 'FAILED_RETRYABLE',
        'id:c': 'FAILED_RETRYABLE', 'id:d': 'QUARANTINED_PARSE_INCOMPLETE'
      },
      attemptsBySourceId: { 'id:a': 1, 'id:b': 1, 'id:c': 2, 'id:d': 1 }
    });
    const resumed = selectNextRoundRobinAstBatchV1({
      ...params, maxRetries: 2, previousLedger: JSON.parse(JSON.stringify(settled))
    });
    expect(resumed.selectedBatch.map((source) => source.canonicalSourceId)).toEqual(['id:b']);
    expect(resumed.nextLedgerPreExecution.statusBySourceId).toEqual(settled.statusBySourceId);
    expect(resumed.nextLedgerPreExecution.attemptsBySourceId).toEqual(settled.attemptsBySourceId);
  });

  it('rejects unbounded or invalid batch and retry limits', () => {
    const { params } = resumeFixture();
    for (const invalid of [0, -1, 0.5, Infinity, NaN]) {
      expect(() => selectNextRoundRobinAstBatchV1({ ...params, batchSize: invalid }))
        .toThrow('AST_CURSOR_INVALID_BATCH_OR_RETRY_LIMIT');
      expect(() => selectNextRoundRobinAstBatchV1({ ...params, maxRetries: invalid }))
        .toThrow('AST_CURSOR_INVALID_BATCH_OR_RETRY_LIMIT');
    }
  });

  it('refuses malformed parser counts instead of treating them as complete syntax', () => {
    const receipt: AstParserCompletenessReceiptV1 = {
      canonicalSourceId: 'id:a', sourceSha256Hex: '1'.repeat(64),
      readbackBytesVerified: true, extractorVersion, utf8ByteLength: 10,
      rootNodeHasError: false, errorNodeCount: 0, missingNodeCount: 0, chunkCount: 1, edgeCount: 0
    };
    for (const invalid of [-1, 0.5, NaN, Infinity]) {
      expect(verifyParserCompletenessV1({ ...receipt, missingNodeCount: invalid }, receipt.sourceSha256Hex, 10))
        .toEqual({ complete: false, reason: 'PARSER_RECEIPT_INVALID' });
    }
  });

  it('selects 3 successive 50-file batches over an imbalanced 165-file fixture with zero duplicates', () => {
    // 165 files total: dir-a (120), dir-b (30), dir-b-extra (10), dir-c (5)
    const sources: SealedSourceEntryV1[] = [];

    const makeSources = (dir: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const rel = `${dir}/file_${String(i).padStart(3, '0')}.ts`;
        sources.push({
          canonicalSourceId: `id:${rel}`,
          repoId: 'main-repo',
          relativePath: rel,
          sha256Hex: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          byteLength: 100,
          isSymlink: false
        });
      }
    };

    makeSources('dir-a', 120);
    makeSources('dir-b', 30);
    makeSources('dir-b-extra', 10);
    makeSources('dir-c', 5);

    expect(sources.length).toBe(165);

    // Batch 1: 50 files
    const res1 = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 50
    });
    expect(res1.selectedBatch.length).toBe(50);

    const completedLedger1: AstCoverageLedgerV1 = JSON.parse(JSON.stringify(settleAstCoverageBatchV1({
      ledger: res1.nextLedgerPreExecution,
      selectedBatch: res1.selectedBatch,
      results: res1.selectedBatch.map((source) => ({
        canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
      }))
    })));

    // Batch 2: 50 files
    const res2 = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 50,
      previousLedger: completedLedger1
    });
    expect(res2.selectedBatch.length).toBe(50);

    const completedLedger2: AstCoverageLedgerV1 = JSON.parse(JSON.stringify(settleAstCoverageBatchV1({
      ledger: res2.nextLedgerPreExecution,
      selectedBatch: res2.selectedBatch,
      results: res2.selectedBatch.map((source) => ({
        canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
      }))
    })));

    // Batch 3: 50 files
    const res3 = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 50,
      previousLedger: completedLedger2
    });
    expect(res3.selectedBatch.length).toBe(50);

    const completedLedger3: AstCoverageLedgerV1 = JSON.parse(JSON.stringify(settleAstCoverageBatchV1({
      ledger: res3.nextLedgerPreExecution,
      selectedBatch: res3.selectedBatch,
      results: res3.selectedBatch.map((source) => ({
        canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
      }))
    })));

    // Batch 4: remaining 15 files
    const res4 = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 50,
      previousLedger: completedLedger3
    });
    expect(res4.selectedBatch.length).toBe(15);
    const completedLedger4 = settleAstCoverageBatchV1({
      ledger: res4.nextLedgerPreExecution,
      selectedBatch: res4.selectedBatch,
      results: res4.selectedBatch.map((source) => ({
        canonicalSourceId: source.canonicalSourceId, parserReceipt: receiptFor(source)
      }))
    });
    expect(Object.values(completedLedger4.statusBySourceId).filter((status) => status === 'COMPLETED')).toHaveLength(165);
    expect(Object.values(completedLedger4.attemptsBySourceId).every((attempts) => attempts === 1)).toBe(true);
    const exhausted = selectNextRoundRobinAstBatchV1({
      sources, allowedRepoIds, workspaceId, workspaceRevision, snapshotManifestSha256,
      extractorVersion, batchSize: 50, previousLedger: JSON.parse(JSON.stringify(completedLedger4))
    });
    expect(exhausted.selectedBatch).toHaveLength(0);

    // Total reconciliation: 50 + 50 + 50 + 15 = 165
    const allSelectedIds = [
      ...res1.selectedBatch.map(s => s.canonicalSourceId),
      ...res2.selectedBatch.map(s => s.canonicalSourceId),
      ...res3.selectedBatch.map(s => s.canonicalSourceId),
      ...res4.selectedBatch.map(s => s.canonicalSourceId)
    ];
    expect(allSelectedIds.length).toBe(165);
    const uniqueIds = new Set(allSelectedIds);
    expect(uniqueIds.size).toBe(165); // Zero duplicates!
  });

  it('isolates directory prefix collisions (src/lib/ vs src/lib-extra/)', () => {
    const sources: SealedSourceEntryV1[] = [
      {
        canonicalSourceId: 'id:src/lib/a.ts',
        repoId: 'main-repo',
        relativePath: 'src/lib/a.ts',
        sha256Hex: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        byteLength: 50,
        isSymlink: false
      },
      {
        canonicalSourceId: 'id:src/lib-extra/b.ts',
        repoId: 'main-repo',
        relativePath: 'src/lib-extra/b.ts',
        sha256Hex: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        byteLength: 60,
        isSymlink: false
      }
    ];

    const res = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 10
    });

    expect(res.selectedBatch.length).toBe(2);
  });

  it('retries FAILED_RETRYABLE files and handles parser completeness verification', () => {
    const receiptValid: AstParserCompletenessReceiptV1 = {
      canonicalSourceId: 'id:valid.ts',
      sourceSha256Hex: 'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      readbackBytesVerified: true,
      extractorVersion: 'tree-sitter-4.0.0',
      utf8ByteLength: 120,
      rootNodeHasError: false,
      errorNodeCount: 0,
      missingNodeCount: 0,
      chunkCount: 2,
      edgeCount: 4
    };

    const validCheck = verifyParserCompletenessV1(
      receiptValid,
      'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      120
    );
    expect(validCheck.complete).toBe(true);

    // Negative case 1: Tree-sitter explicit ERROR node
    const receiptError: AstParserCompletenessReceiptV1 = {
      ...receiptValid,
      rootNodeHasError: true,
      errorNodeCount: 1
    };
    const errorCheck = verifyParserCompletenessV1(
      receiptError,
      'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      120
    );
    expect(errorCheck.complete).toBe(false);
    expect(errorCheck.reason).toContain('PARSER_INCOMPLETE_SYNTAX');

    // Negative case 2: Tree-sitter zero-width recovery MISSING token
    const receiptMissing: AstParserCompletenessReceiptV1 = {
      ...receiptValid,
      rootNodeHasError: false,
      errorNodeCount: 0,
      missingNodeCount: 1
    };
    const missingCheck = verifyParserCompletenessV1(
      receiptMissing,
      'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      120
    );
    expect(missingCheck.complete).toBe(false);
    expect(missingCheck.reason).toContain('missingNodes=1');

    // Negative case 3: Unverified readback
    const receiptUnverified: AstParserCompletenessReceiptV1 = {
      ...receiptValid,
      readbackBytesVerified: false
    };
    const unverifiedCheck = verifyParserCompletenessV1(
      receiptUnverified,
      'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      120
    );
    expect(unverifiedCheck.complete).toBe(false);
    expect(unverifiedCheck.reason).toBe('SEALED_SOURCE_READBACK_UNVERIFIED');
  });

  it('rejects ledger carrying a mismatched workspaceRevision or snapshotManifestSha256', () => {
    const sources: SealedSourceEntryV1[] = [
      {
        canonicalSourceId: 'id:a.ts',
        repoId: 'main-repo',
        relativePath: 'src/a.ts',
        sha256Hex: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        byteLength: 50,
        isSymlink: false
      }
    ];

    const res = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 10
    });

    expect(() => {
      selectNextRoundRobinAstBatchV1({
        sources,
        allowedRepoIds,
        workspaceId,
        workspaceRevision: 'sha256:mismatched_workspace_revision_9999999999999999999999999999999',
        snapshotManifestSha256,
        extractorVersion,
        batchSize: 10,
        previousLedger: res.nextLedgerPreExecution
      });
    }).toThrow('AST_CURSOR_WORKSPACE_REVISION_MISMATCH');

    expect(() => {
      selectNextRoundRobinAstBatchV1({
        sources,
        allowedRepoIds,
        workspaceId,
        workspaceRevision,
        snapshotManifestSha256: 'sha256:mismatched_snapshot_digest_888888888888888888888888888888888',
        extractorVersion,
        batchSize: 10,
        previousLedger: res.nextLedgerPreExecution
      });
    }).toThrow('AST_CURSOR_SNAPSHOT_DIGEST_MISMATCH');
  });

  it('skips symlinks and unregistered nested sub-repositories', () => {
    const sources: SealedSourceEntryV1[] = [
      {
        canonicalSourceId: 'id:symlink.ts',
        repoId: 'main-repo',
        relativePath: 'src/symlink.ts',
        sha256Hex: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        byteLength: 50,
        isSymlink: true
      },
      {
        canonicalSourceId: 'id:nested/file.ts',
        repoId: 'unregistered-subrepo',
        relativePath: 'nested/file.ts',
        sha256Hex: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        byteLength: 50,
        isSymlink: false,
        nestedRepoRoot: 'nested'
      },
      {
        canonicalSourceId: 'id:valid.ts',
        repoId: 'main-repo',
        relativePath: 'src/valid.ts',
        sha256Hex: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
        byteLength: 50,
        isSymlink: false
      }
    ];

    const res = selectNextRoundRobinAstBatchV1({
      sources,
      allowedRepoIds,
      workspaceId,
      workspaceRevision,
      snapshotManifestSha256,
      extractorVersion,
      batchSize: 10
    });

    expect(res.selectedBatch.length).toBe(1);
    expect(res.selectedBatch[0].canonicalSourceId).toBe('id:valid.ts');
    expect(res.skippedSymlinks).toContain('id:symlink.ts');
    expect(res.skippedUnregisteredNestedRepos).toContain('id:nested/file.ts');
  });
});
