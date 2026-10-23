import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyRow,
  emptyClassTotals,
  matchRules,
  reconcileBytes,
  SOURCE_CLASSES,
  type InventoryRow,
  type OwnershipContext,
} from './source-class-split-v1.mts';

function ctx(overrides: Partial<OwnershipContext> = {}): OwnershipContext {
  return {
    nestedRepoRoots: ['claude-mem', 'tools/agentic-research/src/firecrawl'],
    trackedByOwner: new Map([
      ['ROOT', new Set(['src/app.ts', 'openspec/changes/x/tasks.md', 'ignored-but-tracked.log.json'])],
      ['claude-mem', new Set(['src/a.ts'])],
    ]),
    ignoredByOwner: new Map([
      ['ROOT', new Set(['src/app.ts', 'scratch/notes.ts', 'ignored-but-tracked.log.json'])],
      ['claude-mem', new Set()],
    ]),
    censusByPath: new Map([['src/app.ts', { embedding768ChunkCount: 2, contentEmbeddingChunkCount: 1 }]]),
    ...overrides,
  };
}

function file(relativePath: string, extension: string | null, role = 'WORKTREE_FILE', sizeBytes = 10): InventoryRow {
  return { relativePath, entryKind: 'FILE', extension, role, sizeBytes };
}

test('dotted extensions as stored by the inventory classify the same as bare extensions', () => {
  const dotted = classifyRow(file('src/app.ts', '.ts'), ctx());
  const bare = classifyRow(file('src/app.ts', 'ts'), ctx());
  assert.equal(dotted.sourceClass, 'FIRST_PARTY_SOURCE');
  assert.deepEqual(dotted, bare);
  assert.equal(classifyRow(file('models/m.gguf', '.gguf'), ctx()).sourceClass, 'MODEL_ARTIFACT');
  assert.equal(classifyRow(file('assets/logo.png', '.png'), ctx()).sourceClass, 'BINARY_ASSET');
  assert.equal(classifyRow(file('src/old.any-backup', '.any-backup'), ctx()).sourceClass, 'UNKNOWN');
});

test('deterministic: the same row and context always produce the same result', () => {
  const row = file('src/app.ts', 'ts');
  const first = classifyRow(row, ctx());
  const second = classifyRow(row, ctx());
  assert.deepEqual(first, second);
  assert.equal(first.sourceClass, 'FIRST_PARTY_SOURCE');
  assert.equal(first.embeddingPolicy, 'PRIORITY_CANDIDATE_REVISION_PENDING');
  assert.equal(first.embedding768Status, 'HAS_UNQUALIFIED_768_VECTORS');
  assert.equal(first.admissionState, 'NOT_ADMITTED_NO_WORKSPACE_REVISION');
});

test('conflicting rules: the highest-precedence class wins and the loser is recorded', () => {
  // A model extension inside node_modules is a dependency first; the model match is kept as a conflict.
  const row = file('node_modules/pkg/model.onnx', 'onnx', 'DEPENDENCY_TREE');
  const result = classifyRow(row, ctx());
  assert.equal(result.sourceClass, 'EXTERNAL_DEPENDENCY');
  assert.ok(result.conflictRules.some((rule) => rule.endsWith('->MODEL_ARTIFACT')));
  assert.equal(result.embeddingPolicy, 'SELECTED_API_SURFACE_ONLY');
});

test('telemetry extension under a reports directory is structured extraction, not embedding', () => {
  const result = classifyRow(file('docs/reports/run.json', 'json'), ctx());
  assert.equal(result.sourceClass, 'TELEMETRY_REPORT');
  assert.equal(result.embeddingPolicy, 'STRUCTURED_EXTRACTION_ONLY');
});

test('git-ignored untracked files are excluded, but tracked files survive an ignore match', () => {
  const ignored = classifyRow(file('scratch/notes.ts', 'ts'), ctx());
  assert.equal(ignored.gitIgnored, true);
  assert.equal(ignored.embeddingPolicy, 'EXCLUDED_GITIGNORED');

  const trackedAndIgnored = classifyRow(file('ignored-but-tracked.log.json', 'json'), ctx());
  assert.equal(trackedAndIgnored.gitIgnored, false);
  assert.notEqual(trackedAndIgnored.embeddingPolicy, 'EXCLUDED_GITIGNORED');
});

test('nested repositories are owned by their nearest root and tracked only by that owner', () => {
  const nested = classifyRow(file('claude-mem/src/a.ts', 'ts'), ctx());
  assert.equal(nested.owner, 'claude-mem');
  assert.equal(nested.gitTracked, true);
  assert.equal(nested.embeddingPolicy, 'PRIORITY_CANDIDATE_REVISION_PENDING');

  // Same relative path under the root repo is not the nested owner's tracked file.
  const rootLookalike = classifyRow(file('claude-mem/src/b.ts', 'ts'), ctx());
  assert.equal(rootLookalike.owner, 'claude-mem');
  assert.equal(rootLookalike.gitTracked, false);
  assert.equal(rootLookalike.embeddingPolicy, 'SECONDARY_CANDIDATE_UNTRACKED_REVISION_PENDING');
});

test('symlinks and junctions keep their derived class but are never followed or embedded', () => {
  const link: InventoryRow = { relativePath: 'src/link.ts', entryKind: 'SYMLINK_OR_JUNCTION', extension: 'ts', role: 'WORKTREE_FILE', sizeBytes: null };
  const result = classifyRow(link, ctx());
  assert.equal(result.sourceClass, 'FIRST_PARTY_SOURCE');
  assert.equal(result.embeddingPolicy, 'EXCLUDED_SYMLINK_NOT_FOLLOWED');
});

test('unknown extensions and extensionless names are UNKNOWN and reported as unclassified', () => {
  const backup = classifyRow(file('src/old.any-backup', 'any-backup'), ctx());
  assert.equal(backup.sourceClass, 'UNKNOWN');
  assert.equal(backup.embeddingPolicy, 'EXCLUDED_UNCLASSIFIED');

  const noExt = classifyRow(file('notes', null), ctx());
  assert.equal(noExt.sourceClass, 'UNKNOWN');

  const dockerfile = classifyRow(file('services/Dockerfile', null), ctx());
  assert.equal(dockerfile.sourceClass, 'FIRST_PARTY_SOURCE');
});

test('directories are not content and do not receive a class', () => {
  const dir: InventoryRow = { relativePath: 'src', entryKind: 'DIRECTORY', extension: null, role: 'DIRECTORY', sizeBytes: null };
  const result = classifyRow(dir, ctx());
  assert.equal(result.sourceClass, null);
  assert.equal(result.embeddingPolicy, 'EXCLUDED_NOT_CONTENT');
});

test('scratch .tmp source is classified by content but excluded as duplicate or scratch', () => {
  const result = classifyRow(file('.tmp/merge-validation-20260912/src/x.ts', 'ts', 'CACHE_OR_TEMP'), ctx());
  assert.equal(result.sourceClass, 'FIRST_PARTY_SOURCE');
  assert.equal(result.embeddingPolicy, 'EXCLUDED_DUPLICATE_OR_SCRATCH');
});

test('matchRules exposes every matched rule so precedence is auditable', () => {
  const hits = matchRules(file('node_modules/x/y.pt', 'pt', 'DEPENDENCY_TREE'), 'EXTERNAL_DEPENDENCY');
  assert.deepEqual(hits.map((hit) => hit.id), ['EXTERNAL_DEPENDENCY_TREE', 'MODEL_EXTENSION']);
});

test('byte reconciliation: class totals equal the independent file-byte sum', () => {
  const totals = emptyClassTotals();
  const rows = [
    { cls: 'FIRST_PARTY_SOURCE', bytes: 100 },
    { cls: 'MODEL_ARTIFACT', bytes: 2_000 },
    { cls: 'UNKNOWN', bytes: 7 },
  ] as const;
  for (const row of rows) {
    totals[row.cls].files += 1;
    totals[row.cls].bytes += row.bytes;
  }
  const ok = reconcileBytes(totals, 2_107, 3);
  assert.equal(ok.bytesReconcile, true);
  assert.equal(ok.filesReconcile, true);

  const drift = reconcileBytes(totals, 2_108, 3);
  assert.equal(drift.bytesReconcile, false);
  assert.equal(SOURCE_CLASSES.length, 9);
});
