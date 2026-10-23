import { Int32, Table, Utf8, vectorFromArray, tableToIPC } from 'apache-arrow';

const DIRECTORY_FIELDS = [
  ['directoryPath', 'utf8'], ['parentPath', 'utf8'], ['parentPathPresent', 'bool'], ['depth', 'int32'],
  ['directChildCount', 'int32'], ['directFileCount', 'int32'], ['directDirectoryCount', 'int32'], ['directLinkCount', 'int32'],
  ['directFileBytes', 'utf8'], ['directFilesWithSize', 'int32'], ['directFilesWithoutSize', 'int32'],
  ['subtreeFileCount', 'int32'], ['subtreeDirectoryCount', 'int32'], ['subtreeLinkCount', 'int32'],
  ['subtreeFileBytes', 'utf8'], ['subtreeFilesWithSize', 'int32'], ['subtreeFilesWithoutSize', 'int32'],
  ['dominantProfileLanguageId', 'utf8'], ['dominantProfileLanguageCount', 'int32'],
  ['profileLanguageCountsJson', 'utf8'], ['roleCountsJson', 'utf8'], ['indexingStatusCountsJson', 'utf8'],
  ['featureDistributionStatus', 'utf8'],
];

const EDGE_FIELDS = [
  ['parentDirectory', 'utf8'], ['childPath', 'utf8'], ['childKind', 'utf8'],
  ['edgeType', 'utf8'], ['identityStatus', 'utf8'],
];

function makeStats(relativePath) {
  return {
    relativePath,
    parentPath: parentOf(relativePath),
    depth: relativePath === '.' ? 0 : relativePath.split('/').length,
    directChildCount: 0,
    directFileCount: 0,
    directDirectoryCount: 0,
    directLinkCount: 0,
    directFileBytes: 0n,
    directFilesWithSize: 0,
    directFilesWithoutSize: 0,
    subtreeFileCount: 0,
    subtreeDirectoryCount: 0,
    subtreeLinkCount: 0,
    subtreeFileBytes: 0n,
    subtreeFilesWithSize: 0,
    subtreeFilesWithoutSize: 0,
    directLanguages: Object.create(null),
    subtreeLanguages: Object.create(null),
    directRoles: Object.create(null),
    subtreeRoles: Object.create(null),
    directIndexing: Object.create(null),
    subtreeIndexing: Object.create(null),
  };
}

function parentOf(relativePath) {
  if (relativePath === '.') return null;
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '.' : relativePath.slice(0, slash) || '.';
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) increment(target, key, value);
}

function stableJson(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right))));
}

function toTable(fields, rows) {
  const columns = Object.fromEntries(fields.map(([name]) => [name, []]));
  for (const row of rows) for (const [name] of fields) columns[name].push(row[name]);
  const vectors = Object.fromEntries(fields.map(([name, type]) => [
    name,
    type === 'int32' ? vectorFromArray(columns[name], new Int32())
      : type === 'bool' ? vectorFromArray(columns[name])
        : vectorFromArray(columns[name], new Utf8()),
  ]));
  return new Table(vectors);
}

export function buildDirectoryRollupV1(pathTable) {
  if (!pathTable || typeof pathTable.numRows !== 'number' || !pathTable.getChild('relativePath')) {
    throw new TypeError('PATH_METADATA_TABLE_INVALID');
  }
  const required = ['entryKind', 'role', 'sizeBytes', 'sizeBytesPresent', 'mappedLanguageId', 'mappedLanguagePresent', 'indexingStatus'];
  for (const field of required) if (!pathTable.getChild(field)) throw new TypeError(`PATH_METADATA_FIELD_MISSING:${field}`);

  const paths = pathTable.getChild('relativePath');
  const kinds = pathTable.getChild('entryKind');
  const directoryStats = new Map();
  for (let index = 0; index < pathTable.numRows; index += 1) {
    if (kinds.get(index) === 'DIRECTORY') {
      const relativePath = paths.get(index);
      if (typeof relativePath !== 'string' || directoryStats.has(relativePath)) throw new Error('DIRECTORY_PATH_INVALID_OR_DUPLICATE');
      directoryStats.set(relativePath, makeStats(relativePath));
    }
  }
  if (!directoryStats.has('.')) throw new Error('ROOT_DIRECTORY_MISSING');

  const edges = [];
  let unresolvedParentCount = 0;
  let rootRecordCount = 0;
  const roles = pathTable.getChild('role');
  const sizes = pathTable.getChild('sizeBytes');
  const hasSize = pathTable.getChild('sizeBytesPresent');
  const languages = pathTable.getChild('mappedLanguageId');
  const hasLanguage = pathTable.getChild('mappedLanguagePresent');
  const indexing = pathTable.getChild('indexingStatus');

  for (let index = 0; index < pathTable.numRows; index += 1) {
    const relativePath = paths.get(index);
    const kind = kinds.get(index);
    if (relativePath === '.') {
      rootRecordCount += 1;
      continue;
    }
    const parentPath = parentOf(relativePath);
    const parent = directoryStats.get(parentPath);
    if (!parent) {
      unresolvedParentCount += 1;
      continue;
    }
    parent.directChildCount += 1;
    edges.push({
      parentDirectory: parentPath,
      childPath: relativePath,
      childKind: kind,
      edgeType: 'CONTAINS',
      identityStatus: 'PATH_DERIVED_NOT_CANONICAL_IDENTITY',
    });
    if (kind === 'DIRECTORY') {
      parent.directDirectoryCount += 1;
      parent.subtreeDirectoryCount += 1;
      continue;
    }
    if (kind === 'SYMLINK_OR_JUNCTION') {
      parent.directLinkCount += 1;
      parent.subtreeLinkCount += 1;
      continue;
    }
    if (kind !== 'FILE') throw new Error(`PATH_ENTRY_KIND_UNKNOWN:${String(kind)}`);

    parent.directFileCount += 1;
    parent.subtreeFileCount += 1;
    if (hasSize.get(index)) {
      const size = BigInt(sizes.get(index));
      parent.directFileBytes += size;
      parent.subtreeFileBytes += size;
      parent.directFilesWithSize += 1;
      parent.subtreeFilesWithSize += 1;
    } else {
      parent.directFilesWithoutSize += 1;
      parent.subtreeFilesWithoutSize += 1;
    }
    const languageId = hasLanguage.get(index) ? languages.get(index) : 'UNMAPPED';
    increment(parent.directLanguages, languageId);
    increment(parent.subtreeLanguages, languageId);
    increment(parent.directRoles, roles.get(index));
    increment(parent.subtreeRoles, roles.get(index));
    increment(parent.directIndexing, indexing.get(index));
    increment(parent.subtreeIndexing, indexing.get(index));
  }

  const deepestFirst = [...directoryStats.values()].sort((left, right) => right.depth - left.depth
    || compareText(right.relativePath, left.relativePath));
  for (const directory of deepestFirst) {
    if (directory.relativePath === '.') continue;
    const parent = directoryStats.get(directory.parentPath);
    if (!parent) continue;
    parent.subtreeFileCount += directory.subtreeFileCount;
    parent.subtreeDirectoryCount += directory.subtreeDirectoryCount;
    parent.subtreeLinkCount += directory.subtreeLinkCount;
    parent.subtreeFileBytes += directory.subtreeFileBytes;
    parent.subtreeFilesWithSize += directory.subtreeFilesWithSize;
    parent.subtreeFilesWithoutSize += directory.subtreeFilesWithoutSize;
    addCounts(parent.subtreeLanguages, directory.subtreeLanguages);
    addCounts(parent.subtreeRoles, directory.subtreeRoles);
    addCounts(parent.subtreeIndexing, directory.subtreeIndexing);
  }

  if (rootRecordCount !== 1) throw new Error('ROOT_RECORD_COUNT_INVALID');
  const directories = [...directoryStats.values()].sort((left, right) => compareText(left.relativePath, right.relativePath));
  const summaryRows = directories.map(directory => {
    const rankedLanguages = Object.entries(directory.subtreeLanguages)
      .filter(([language]) => language !== 'UNMAPPED')
      .sort(([leftLanguage, leftCount], [rightLanguage, rightCount]) => rightCount - leftCount || compareText(leftLanguage, rightLanguage));
    return {
      directoryPath: directory.relativePath,
      parentPath: directory.parentPath ?? '',
      parentPathPresent: directory.parentPath !== null,
      depth: directory.depth,
      directChildCount: directory.directChildCount,
      directFileCount: directory.directFileCount,
      directDirectoryCount: directory.directDirectoryCount,
      directLinkCount: directory.directLinkCount,
      directFileBytes: directory.directFileBytes.toString(),
      directFilesWithSize: directory.directFilesWithSize,
      directFilesWithoutSize: directory.directFilesWithoutSize,
      subtreeFileCount: directory.subtreeFileCount,
      subtreeDirectoryCount: directory.subtreeDirectoryCount,
      subtreeLinkCount: directory.subtreeLinkCount,
      subtreeFileBytes: directory.subtreeFileBytes.toString(),
      subtreeFilesWithSize: directory.subtreeFilesWithSize,
      subtreeFilesWithoutSize: directory.subtreeFilesWithoutSize,
      dominantProfileLanguageId: rankedLanguages[0]?.[0] ?? '',
      dominantProfileLanguageCount: rankedLanguages[0]?.[1] ?? 0,
      profileLanguageCountsJson: stableJson(directory.subtreeLanguages),
      roleCountsJson: stableJson(directory.subtreeRoles),
      indexingStatusCountsJson: stableJson(directory.subtreeIndexing),
      featureDistributionStatus: 'NOT_AVAILABLE_NO_QUALIFIED_FEATURE_INPUT',
    };
  });

  const directoryTable = toTable(DIRECTORY_FIELDS, summaryRows);
  const edgeTable = toTable(EDGE_FIELDS, edges);
  return {
    directoryBytes: tableToIPC(directoryTable, 'file'),
    edgeBytes: tableToIPC(edgeTable, 'file'),
    directoryCount: directoryTable.numRows,
    edgeCount: edgeTable.numRows,
    pathCount: pathTable.numRows,
    unresolvedParentCount,
    rootRecordCount,
    directoryColumns: directoryTable.numCols,
    edgeColumns: edgeTable.numCols,
  };
}

export const DIRECTORY_INTELLIGENCE_ROLLUP_V1_SCHEMA = Object.freeze({
  directoryFields: DIRECTORY_FIELDS.map(([name]) => name),
  edgeFields: EDGE_FIELDS.map(([name]) => name),
});
