import { createHash } from 'node:crypto';
import { Float64, Int32, Table, Utf8, tableToIPC, vectorFromArray } from 'apache-arrow';
import { normalizeGitPathV1 } from './directory-git-scope-v1.mjs';

const FILE_FIELDS = [
  ['relativePath', 'utf8'], ['joinStatus', 'utf8'], ['revisionStatus', 'utf8'],
  ['chunkCount', 'int32'], ['contentEmbeddingChunkCount', 'int32'], ['embedding768ChunkCount', 'int32'],
  ['sourceRevisionChunkCount', 'int32'], ['workspaceRevisionChunkCount', 'int32'],
  ['exactProvenContentEmbeddingChunks', 'int32'], ['exactProvenEmbedding768Chunks', 'int32'],
  ['provenLineageIdentityEmbedding768Chunks', 'int32'], ['lineageSourceRefMatchEmbedding768Chunks', 'int32'],
  ['uniqueBindingSnapshotEmbedding768Chunks', 'int32'], ['multipleWorkspaceBindingEmbedding768Chunks', 'int32'],
  ['missingBindingEmbedding768Chunks', 'int32'], ['conflictingLineageEmbedding768Chunks', 'int32'],
  ['modelRecipesJson', 'utf8'],
];

const DIRECTORY_FIELDS = [
  ['directoryPath', 'utf8'], ['depth', 'int32'], ['physicalFileCount', 'int32'],
  ['physicalRoleCountsJson', 'utf8'], ['physicalLanguageCountsJson', 'utf8'],
  ['databasePathCount', 'int32'], ['databasePathMatchedCount', 'int32'],
  ['databasePathUnmatchedCount', 'int32'], ['databaseChunkCount', 'int32'],
  ['contentEmbeddingPathCount', 'int32'], ['contentEmbeddingChunkCount', 'int32'],
  ['embedding768PathCount', 'int32'], ['embedding768ChunkCount', 'int32'],
  ['pathMatchCoveragePercent', 'float64'], ['embedding768PathCoveragePercent', 'float64'],
  ['exactProvenContentEmbeddingChunks', 'int32'], ['exactProvenEmbedding768Chunks', 'int32'],
  ['sourceRevisionChunkCount', 'int32'], ['workspaceRevisionChunkCount', 'int32'],
  ['provenLineageIdentityEmbedding768Chunks', 'int32'], ['lineageSourceRefMatchEmbedding768Chunks', 'int32'],
  ['uniqueBindingSnapshotEmbedding768Chunks', 'int32'], ['multipleWorkspaceBindingEmbedding768Chunks', 'int32'],
  ['missingBindingEmbedding768Chunks', 'int32'], ['conflictingLineageEmbedding768Chunks', 'int32'],
  ['modelRecipesJson', 'utf8'], ['coverageStatus', 'utf8'],
];

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const stableJson = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right))));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function parentOf(relativePath) {
  if (relativePath === '.') return null;
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '.' : relativePath.slice(0, slash) || '.';
}

function emptyDirectory(relativePath) {
  return {
    directoryPath: relativePath,
    parentPath: parentOf(relativePath),
    depth: relativePath === '.' ? 0 : relativePath.split('/').length,
    physicalFileCount: 0,
    physicalRoles: Object.create(null),
    physicalLanguages: Object.create(null),
    databasePathCount: 0,
    databasePathMatchedCount: 0,
    databasePathUnmatchedCount: 0,
    databaseChunkCount: 0,
    contentEmbeddingPathCount: 0,
    contentEmbeddingChunkCount: 0,
    embedding768PathCount: 0,
    embedding768ChunkCount: 0,
    exactProvenContentEmbeddingChunks: 0,
    exactProvenEmbedding768Chunks: 0,
    provenLineageIdentityEmbedding768Chunks: 0,
    lineageSourceRefMatchEmbedding768Chunks: 0,
    uniqueBindingSnapshotEmbedding768Chunks: 0,
    multipleWorkspaceBindingEmbedding768Chunks: 0,
    missingBindingEmbedding768Chunks: 0,
    conflictingLineageEmbedding768Chunks: 0,
    sourceRevisionChunkCount: 0,
    workspaceRevisionChunkCount: 0,
    modelRecipes: Object.create(null),
  };
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function addDatabaseStats(target, row) {
  target.databasePathCount += 1;
  target.databasePathMatchedCount += Number(row.joinStatus === 'MATCHED_PHYSICAL_FILE');
  target.databasePathUnmatchedCount += Number(row.joinStatus !== 'MATCHED_PHYSICAL_FILE');
  target.databaseChunkCount += row.chunkCount;
  target.contentEmbeddingChunkCount += row.contentEmbeddingChunkCount;
  target.embedding768ChunkCount += row.embedding768ChunkCount;
  target.contentEmbeddingPathCount += Number(row.contentEmbeddingChunkCount > 0);
  target.embedding768PathCount += Number(row.embedding768ChunkCount > 0);
  target.exactProvenContentEmbeddingChunks += row.exactProvenContentEmbeddingChunks;
  target.exactProvenEmbedding768Chunks += row.exactProvenEmbedding768Chunks;
  target.provenLineageIdentityEmbedding768Chunks += row.provenLineageIdentityEmbedding768Chunks;
  target.lineageSourceRefMatchEmbedding768Chunks += row.lineageSourceRefMatchEmbedding768Chunks;
  target.uniqueBindingSnapshotEmbedding768Chunks += row.uniqueBindingSnapshotEmbedding768Chunks;
  target.multipleWorkspaceBindingEmbedding768Chunks += row.multipleWorkspaceBindingEmbedding768Chunks;
  target.missingBindingEmbedding768Chunks += row.missingBindingEmbedding768Chunks;
  target.conflictingLineageEmbedding768Chunks += row.conflictingLineageEmbedding768Chunks;
  target.sourceRevisionChunkCount += row.sourceRevisionChunkCount;
  target.workspaceRevisionChunkCount += row.workspaceRevisionChunkCount;
  for (const recipe of row.modelRecipes) {
    const key = JSON.stringify([recipe.embeddingModel ?? null, recipe.embeddingVersion ?? null]);
    target.modelRecipes[key] = (target.modelRecipes[key] ?? 0) + recipe.embedding768ChunkCount;
  }
}

function arrowBytes(fields, rows) {
  const columns = Object.fromEntries(fields.map(([name]) => [name, rows.map(row => row[name])]));
  const table = new Table(Object.fromEntries(fields.map(([name, type]) => [
    name,
    type === 'int32' ? vectorFromArray(columns[name], new Int32())
      : type === 'float64' ? vectorFromArray(columns[name], new Float64())
        : vectorFromArray(columns[name], new Utf8()),
  ])));
  return { bytes: tableToIPC(table, 'file'), rows: table.numRows, columns: table.numCols };
}

export function buildDirectoryEmbeddingCoverageV1(pathTable, databasePathRows) {
  if (!pathTable || !Array.isArray(databasePathRows)) throw new TypeError('EMBEDDING_COVERAGE_INPUT_INVALID');
  for (const field of ['ordinal', 'relativePath', 'entryKind', 'role', 'mappedLanguageId']) {
    if (!pathTable.getChild(field)) throw new TypeError(`PATH_FIELD_MISSING:${field}`);
  }

  const paths = pathTable.getChild('relativePath');
  const ordinals = pathTable.getChild('ordinal');
  const kinds = pathTable.getChild('entryKind');
  const roles = pathTable.getChild('role');
  const languages = pathTable.getChild('mappedLanguageId');
  const hasLanguage = pathTable.getChild('mappedLanguagePresent');
  const directories = new Map();
  const physicalFiles = new Map();
  const normalizedPaths = new Map();
  const normalizedCollisions = new Set();

  for (let index = 0; index < pathTable.numRows; index += 1) {
    if (ordinals.get(index) !== index) throw new Error(`PATH_ORDINAL_INVALID:${index}`);
    const relativePath = paths.get(index);
    if (typeof relativePath !== 'string') throw new Error(`PATH_VALUE_INVALID:${index}`);
    const key = normalizeGitPathV1(relativePath);
    if (normalizedPaths.has(key) && normalizedPaths.get(key) !== relativePath) normalizedCollisions.add(key);
    else normalizedPaths.set(key, relativePath);
    if (kinds.get(index) === 'DIRECTORY') {
      if (directories.has(relativePath)) throw new Error(`DUPLICATE_DIRECTORY:${relativePath}`);
      directories.set(relativePath, emptyDirectory(relativePath));
    } else if (kinds.get(index) === 'FILE') {
      if (physicalFiles.has(key)) throw new Error(`DUPLICATE_NORMALIZED_FILE_PATH:${relativePath}`);
      const parentPath = parentOf(relativePath);
      if (!directories.has(parentPath)) throw new Error(`PHYSICAL_FILE_PARENT_MISSING:${relativePath}`);
      physicalFiles.set(key, { relativePath, parentPath, role: roles.get(index), language: hasLanguage?.get(index) ? languages.get(index) : 'UNMAPPED' });
      const directory = directories.get(parentPath);
      directory.physicalFileCount += 1;
      increment(directory.physicalRoles, roles.get(index));
      increment(directory.physicalLanguages, hasLanguage?.get(index) ? languages.get(index) : 'UNMAPPED');
    }
  }
  if (!directories.has('.')) throw new Error('ROOT_DIRECTORY_MISSING');

  const fileRows = [];
  const unmatchedSamples = [];
  let matchedDatabasePathCount = 0;
  let ambiguousDatabasePathCount = 0;
  let nonFileDatabasePathCount = 0;
  const normalizedDatabasePathCounts = new Map();
  for (const sourceRow of databasePathRows) {
    if (!sourceRow || typeof sourceRow.relativePath !== 'string' || !sourceRow.relativePath) throw new Error('DATABASE_PATH_ROW_INVALID');
    const key = normalizeGitPathV1(sourceRow.relativePath);
    normalizedDatabasePathCounts.set(key, (normalizedDatabasePathCounts.get(key) ?? 0) + 1);
  }

  for (const sourceRow of databasePathRows) {
    if (!sourceRow || typeof sourceRow.relativePath !== 'string' || !sourceRow.relativePath) throw new Error('DATABASE_PATH_ROW_INVALID');
    const key = normalizeGitPathV1(sourceRow.relativePath);
    const counts = ['chunkCount', 'contentEmbeddingChunkCount', 'embedding768ChunkCount', 'sourceRevisionChunkCount',
      'workspaceRevisionChunkCount', 'exactProvenContentEmbeddingChunks', 'exactProvenEmbedding768Chunks',
      'provenLineageIdentityEmbedding768Chunks', 'lineageSourceRefMatchEmbedding768Chunks',
      'uniqueBindingSnapshotEmbedding768Chunks', 'multipleWorkspaceBindingEmbedding768Chunks',
      'missingBindingEmbedding768Chunks', 'conflictingLineageEmbedding768Chunks'];
    for (const field of counts) if (!Number.isSafeInteger(sourceRow[field]) || sourceRow[field] < 0) throw new Error(`DATABASE_COUNT_INVALID:${field}`);
    if (!Array.isArray(sourceRow.modelRecipes)) throw new Error('DATABASE_MODEL_RECIPES_INVALID');
    const databaseCollision = normalizedDatabasePathCounts.get(key) > 1;
    const physical = normalizedCollisions.has(key) || databaseCollision ? null : physicalFiles.get(key);
    const pathEntry = normalizedPaths.has(key) ? normalizedPaths.get(key) : null;
    let joinStatus = 'UNMATCHED_PHYSICAL_PATH';
    if (databaseCollision) {
      joinStatus = 'AMBIGUOUS_NORMALIZED_DATABASE_PATH';
      ambiguousDatabasePathCount += 1;
    } else if (normalizedCollisions.has(key)) {
      joinStatus = 'AMBIGUOUS_NORMALIZED_PATH';
      ambiguousDatabasePathCount += 1;
    } else if (physical) {
      joinStatus = 'MATCHED_PHYSICAL_FILE';
      matchedDatabasePathCount += 1;
    } else if (pathEntry !== null) {
      joinStatus = 'MATCHED_NON_FILE_PATH';
      nonFileDatabasePathCount += 1;
    } else if (unmatchedSamples.length < 25) unmatchedSamples.push(sourceRow.relativePath);
    const hasAnyLineage = sourceRow.sourceRevisionChunkCount > 0 || sourceRow.workspaceRevisionChunkCount > 0;
    const row = {
      relativePath: sourceRow.relativePath,
      joinStatus,
      revisionStatus: sourceRow.exactProvenContentEmbeddingChunks > 0 || sourceRow.exactProvenEmbedding768Chunks > 0
        ? 'ROW_OWNED_EXACT_PROVEN_LINEAGE_JOIN_PRESENT'
        : sourceRow.uniqueBindingSnapshotEmbedding768Chunks > 0
          ? 'EXTERNAL_LINEAGE_BINDING_PRESENT_WORKSPACE_UNSELECTED'
          : sourceRow.provenLineageIdentityEmbedding768Chunks > 0
            ? 'EXTERNAL_LINEAGE_PRESENT_BINDING_OR_IDENTITY_INCOMPLETE'
            : hasAnyLineage ? 'REVISION_FIELDS_PRESENT_BUT_EXACT_JOIN_UNPROVEN' : 'NO_ROW_OWNED_SOURCE_OR_WORKSPACE_REVISION',
      chunkCount: sourceRow.chunkCount,
      contentEmbeddingChunkCount: sourceRow.contentEmbeddingChunkCount,
      embedding768ChunkCount: sourceRow.embedding768ChunkCount,
      sourceRevisionChunkCount: sourceRow.sourceRevisionChunkCount,
      workspaceRevisionChunkCount: sourceRow.workspaceRevisionChunkCount,
      exactProvenContentEmbeddingChunks: sourceRow.exactProvenContentEmbeddingChunks,
      exactProvenEmbedding768Chunks: sourceRow.exactProvenEmbedding768Chunks,
      provenLineageIdentityEmbedding768Chunks: sourceRow.provenLineageIdentityEmbedding768Chunks,
      lineageSourceRefMatchEmbedding768Chunks: sourceRow.lineageSourceRefMatchEmbedding768Chunks,
      uniqueBindingSnapshotEmbedding768Chunks: sourceRow.uniqueBindingSnapshotEmbedding768Chunks,
      multipleWorkspaceBindingEmbedding768Chunks: sourceRow.multipleWorkspaceBindingEmbedding768Chunks,
      missingBindingEmbedding768Chunks: sourceRow.missingBindingEmbedding768Chunks,
      conflictingLineageEmbedding768Chunks: sourceRow.conflictingLineageEmbedding768Chunks,
      modelRecipesJson: JSON.stringify(sourceRow.modelRecipes),
    };
    fileRows.push(row);
    if (physical) {
      addDatabaseStats(directories.get(physical.parentPath), { ...sourceRow, joinStatus });
    }
  }

  const subtreeByPath = new Map([...directories].map(([relativePath, directory]) => [relativePath, {
    physicalFileCount: directory.physicalFileCount,
    physicalRoles: { ...directory.physicalRoles },
    physicalLanguages: { ...directory.physicalLanguages },
    ...Object.fromEntries(['databasePathCount', 'databasePathMatchedCount', 'databasePathUnmatchedCount', 'databaseChunkCount',
      'contentEmbeddingPathCount', 'contentEmbeddingChunkCount', 'embedding768PathCount', 'embedding768ChunkCount',
      'exactProvenContentEmbeddingChunks', 'exactProvenEmbedding768Chunks', 'sourceRevisionChunkCount', 'workspaceRevisionChunkCount',
      'provenLineageIdentityEmbedding768Chunks', 'lineageSourceRefMatchEmbedding768Chunks',
      'uniqueBindingSnapshotEmbedding768Chunks', 'multipleWorkspaceBindingEmbedding768Chunks',
      'missingBindingEmbedding768Chunks', 'conflictingLineageEmbedding768Chunks']
      .map(field => [field, directory[field]])),
    modelRecipes: { ...directory.modelRecipes },
  }]));
  const numericFields = ['physicalFileCount', 'databasePathCount', 'databasePathMatchedCount', 'databasePathUnmatchedCount',
    'databaseChunkCount', 'contentEmbeddingPathCount', 'contentEmbeddingChunkCount', 'embedding768PathCount', 'embedding768ChunkCount',
    'exactProvenContentEmbeddingChunks', 'exactProvenEmbedding768Chunks', 'sourceRevisionChunkCount', 'workspaceRevisionChunkCount',
    'provenLineageIdentityEmbedding768Chunks', 'lineageSourceRefMatchEmbedding768Chunks',
    'uniqueBindingSnapshotEmbedding768Chunks', 'multipleWorkspaceBindingEmbedding768Chunks',
    'missingBindingEmbedding768Chunks', 'conflictingLineageEmbedding768Chunks'];
  const deepestFirst = [...directories.values()].sort((left, right) => right.depth - left.depth || compareText(right.directoryPath, left.directoryPath));
  for (const directory of deepestFirst) {
    if (directory.parentPath === null) continue;
    const parent = subtreeByPath.get(directory.parentPath);
    const child = subtreeByPath.get(directory.directoryPath);
    if (!parent) throw new Error(`DIRECTORY_PARENT_MISSING:${directory.directoryPath}`);
    for (const field of numericFields) parent[field] += child[field];
    for (const [key, value] of Object.entries(child.physicalRoles)) increment(parent.physicalRoles, key, value);
    for (const [key, value] of Object.entries(child.physicalLanguages)) increment(parent.physicalLanguages, key, value);
    for (const [key, value] of Object.entries(child.modelRecipes)) increment(parent.modelRecipes, key, value);
  }

  fileRows.sort((left, right) => compareText(left.relativePath, right.relativePath));
  const directoryRows = [...directories.values()].sort((left, right) => compareText(left.directoryPath, right.directoryPath)).map(directory => {
    const subtree = subtreeByPath.get(directory.directoryPath);
    const matchedPathCoverage = subtree.physicalFileCount
      ? (subtree.databasePathMatchedCount / subtree.physicalFileCount) * 100 : 0;
    const embedding768PathCoverage = subtree.physicalFileCount
      ? (subtree.embedding768PathCount / subtree.physicalFileCount) * 100 : 0;
    return {
      directoryPath: directory.directoryPath,
      depth: directory.depth,
      physicalFileCount: subtree.physicalFileCount,
      physicalRoleCountsJson: stableJson(subtree.physicalRoles),
      physicalLanguageCountsJson: stableJson(subtree.physicalLanguages),
      databasePathCount: subtree.databasePathCount,
      databasePathMatchedCount: subtree.databasePathMatchedCount,
      databasePathUnmatchedCount: subtree.databasePathUnmatchedCount,
      databaseChunkCount: subtree.databaseChunkCount,
      contentEmbeddingPathCount: subtree.contentEmbeddingPathCount,
      contentEmbeddingChunkCount: subtree.contentEmbeddingChunkCount,
      embedding768PathCount: subtree.embedding768PathCount,
      embedding768ChunkCount: subtree.embedding768ChunkCount,
      pathMatchCoveragePercent: matchedPathCoverage,
      embedding768PathCoveragePercent: embedding768PathCoverage,
      exactProvenContentEmbeddingChunks: subtree.exactProvenContentEmbeddingChunks,
      exactProvenEmbedding768Chunks: subtree.exactProvenEmbedding768Chunks,
      provenLineageIdentityEmbedding768Chunks: subtree.provenLineageIdentityEmbedding768Chunks,
      lineageSourceRefMatchEmbedding768Chunks: subtree.lineageSourceRefMatchEmbedding768Chunks,
      uniqueBindingSnapshotEmbedding768Chunks: subtree.uniqueBindingSnapshotEmbedding768Chunks,
      multipleWorkspaceBindingEmbedding768Chunks: subtree.multipleWorkspaceBindingEmbedding768Chunks,
      missingBindingEmbedding768Chunks: subtree.missingBindingEmbedding768Chunks,
      conflictingLineageEmbedding768Chunks: subtree.conflictingLineageEmbedding768Chunks,
      sourceRevisionChunkCount: subtree.sourceRevisionChunkCount,
      workspaceRevisionChunkCount: subtree.workspaceRevisionChunkCount,
      modelRecipesJson: stableJson(subtree.modelRecipes),
      coverageStatus: 'PATH_JOIN_ONLY_NO_REPOSITORY_REVISION_AUTHORITY',
      pathMatchCoveragePercent: matchedPathCoverage,
      embedding768PathCoveragePercent: embedding768PathCoverage,
    };
  });

  const fileArtifact = arrowBytes(FILE_FIELDS, fileRows);
  const directoryArtifact = arrowBytes(DIRECTORY_FIELDS, directoryRows);
  const root = directoryRows.find(row => row.directoryPath === '.');
  return {
    fileRows,
    directoryRows,
    fileArtifact,
    directoryArtifact,
    matchedDatabasePathCount,
    unmatchedDatabasePathCount: databasePathRows.length - matchedDatabasePathCount - ambiguousDatabasePathCount - nonFileDatabasePathCount,
    ambiguousDatabasePathCount,
    nonFileDatabasePathCount,
    unmatchedSamples,
    root,
    physicalFileCount: physicalFiles.size,
    directoryCount: directories.size,
    sourceFileRowCount: pathTable.numRows,
    fileRowsSha256: sha256(Buffer.from(fileRows.map(row => JSON.stringify(row)).join('\n') + (fileRows.length ? '\n' : ''))),
  };
}

export const DIRECTORY_EMBEDDING_COVERAGE_V1_SCHEMA = Object.freeze({
  fileFields: FILE_FIELDS.map(([name]) => name),
  directoryFields: DIRECTORY_FIELDS.map(([name]) => name),
});
