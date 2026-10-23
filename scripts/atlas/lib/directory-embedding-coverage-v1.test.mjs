import assert from 'node:assert/strict';
import test from 'node:test';
import { tableFromArrays, tableFromIPC } from 'apache-arrow';
import { buildDirectoryEmbeddingCoverageV1 } from './directory-embedding-coverage-v1.mjs';

function paths() {
  return tableFromArrays({
    ordinal: [0, 1, 2, 3, 4, 5],
    relativePath: ['.', 'src', 'src/lib', 'src/lib/a.ts', 'src/b.ts', 'README.md'],
    entryKind: ['DIRECTORY', 'DIRECTORY', 'DIRECTORY', 'FILE', 'FILE', 'FILE'],
    role: ['DIRECTORY', 'DIRECTORY', 'DIRECTORY', 'WORKTREE_FILE', 'WORKTREE_FILE', 'DOCUMENTATION'],
    mappedLanguageId: ['', '', '', 'typescript', 'typescript', 'markdown'],
    mappedLanguagePresent: [false, false, false, true, true, true],
  });
}

const dbRows = [
  { relativePath: 'src/lib/a.ts', chunkCount: 3, contentEmbeddingChunkCount: 1, embedding768ChunkCount: 3,
    sourceRevisionChunkCount: 0, workspaceRevisionChunkCount: 0, exactProvenContentEmbeddingChunks: 0,
    exactProvenEmbedding768Chunks: 0, provenLineageIdentityEmbedding768Chunks: 0, lineageSourceRefMatchEmbedding768Chunks: 0,
    uniqueBindingSnapshotEmbedding768Chunks: 0, multipleWorkspaceBindingEmbedding768Chunks: 0,
    missingBindingEmbedding768Chunks: 0, conflictingLineageEmbedding768Chunks: 0,
    modelRecipes: [{ embeddingModel: 'model-a', embeddingVersion: 'recipe-a', embedding768ChunkCount: 3 }] },
  { relativePath: 'deleted.ts', chunkCount: 2, contentEmbeddingChunkCount: 0, embedding768ChunkCount: 2,
    sourceRevisionChunkCount: 0, workspaceRevisionChunkCount: 0, exactProvenContentEmbeddingChunks: 0,
    exactProvenEmbedding768Chunks: 0, provenLineageIdentityEmbedding768Chunks: 1, lineageSourceRefMatchEmbedding768Chunks: 1,
    uniqueBindingSnapshotEmbedding768Chunks: 0, multipleWorkspaceBindingEmbedding768Chunks: 1,
    missingBindingEmbedding768Chunks: 0, conflictingLineageEmbedding768Chunks: 0,
    modelRecipes: [{ embeddingModel: 'model-b', embeddingVersion: null, embedding768ChunkCount: 2 }] },
];

test('embedding coverage separates physical paths, chunks, and exact lineage', () => {
  const result = buildDirectoryEmbeddingCoverageV1(paths(), dbRows);
  const fileRows = tableFromIPC(result.fileArtifact.bytes);
  const dirRows = tableFromIPC(result.directoryArtifact.bytes);
  const rootIndex = dirRows.getChild('directoryPath').indexOf('.');
  const srcIndex = dirRows.getChild('directoryPath').indexOf('src');
  assert.equal(fileRows.numRows, 2);
  assert.equal(dirRows.numRows, 3);
  assert.equal(result.matchedDatabasePathCount, 1);
  assert.equal(result.unmatchedDatabasePathCount, 1);
  assert.equal(dirRows.getChild('physicalFileCount').get(rootIndex), 3);
  assert.equal(dirRows.getChild('embedding768PathCount').get(rootIndex), 1);
  assert.equal(dirRows.getChild('embedding768ChunkCount').get(rootIndex), 3);
  assert.equal(dirRows.getChild('databasePathMatchedCount').get(srcIndex), 1);
  assert.equal(dirRows.getChild('exactProvenEmbedding768Chunks').get(rootIndex), 0);
  const joined = [...Array(fileRows.numRows)].map((_, index) => fileRows.get(index)).find(row => row.relativePath === 'src/lib/a.ts');
  assert.equal(joined.joinStatus, 'MATCHED_PHYSICAL_FILE');
  assert.equal(joined.revisionStatus, 'NO_ROW_OWNED_SOURCE_OR_WORKSPACE_REVISION');
  const deleted = result.fileRows.find(row => row.relativePath === 'deleted.ts');
  assert.equal(deleted.revisionStatus, 'EXTERNAL_LINEAGE_PRESENT_BINDING_OR_IDENTITY_INCOMPLETE');
  assert.equal(deleted.multipleWorkspaceBindingEmbedding768Chunks, 1);
});

test('embedding coverage withholds duplicate normalized database paths and rejects source ordinal gaps', () => {
  const collision = buildDirectoryEmbeddingCoverageV1(paths(), [
    { ...dbRows[0], relativePath: 'src/lib/A.ts' },
    { ...dbRows[0], relativePath: 'src/lib/a.ts' },
  ]);
  assert.equal(collision.ambiguousDatabasePathCount, 2);
  assert.equal(collision.matchedDatabasePathCount, 0);
  assert.ok(collision.fileRows.every(row => row.joinStatus === 'AMBIGUOUS_NORMALIZED_DATABASE_PATH'));
  const invalid = paths();
  invalid.getChild('ordinal').set(2, 99);
  assert.throws(() => buildDirectoryEmbeddingCoverageV1(invalid, []), /PATH_ORDINAL_INVALID/);
});

test('embedding coverage marks non-file paths and unknown paths separately', () => {
  const rows = [
    { ...dbRows[0], relativePath: 'src', chunkCount: 1, embedding768ChunkCount: 1, contentEmbeddingChunkCount: 0,
      provenLineageIdentityEmbedding768Chunks: 0, lineageSourceRefMatchEmbedding768Chunks: 0,
      uniqueBindingSnapshotEmbedding768Chunks: 0, multipleWorkspaceBindingEmbedding768Chunks: 0,
      missingBindingEmbedding768Chunks: 0, conflictingLineageEmbedding768Chunks: 0, modelRecipes: [] },
    { ...dbRows[0], relativePath: 'not-here.ts', chunkCount: 1, embedding768ChunkCount: 1, contentEmbeddingChunkCount: 0,
      provenLineageIdentityEmbedding768Chunks: 0, lineageSourceRefMatchEmbedding768Chunks: 0,
      uniqueBindingSnapshotEmbedding768Chunks: 0, multipleWorkspaceBindingEmbedding768Chunks: 0,
      missingBindingEmbedding768Chunks: 0, conflictingLineageEmbedding768Chunks: 0, modelRecipes: [] },
  ];
  const result = buildDirectoryEmbeddingCoverageV1(paths(), rows);
  assert.equal(result.nonFileDatabasePathCount, 1);
  assert.equal(result.unmatchedDatabasePathCount, 1);
  assert.equal(result.fileRows.find(row => row.relativePath === 'src').joinStatus, 'MATCHED_NON_FILE_PATH');
  assert.equal(result.fileRows.find(row => row.relativePath === 'not-here.ts').joinStatus, 'UNMATCHED_PHYSICAL_PATH');
});
