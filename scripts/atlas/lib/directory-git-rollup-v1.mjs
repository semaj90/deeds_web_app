import { Int32, Table, Utf8, tableToIPC, vectorFromArray } from 'apache-arrow';

const SCOPE_LABELS = Object.freeze({
  1: 'TRACKED',
  2: 'UNTRACKED',
  3: 'IGNORED',
  4: 'CONFLICT',
  5: 'UNCLASSIFIED',
  8: 'REPOSITORY_METADATA',
  9: 'LINK_ONLY',
  10: 'NESTED_REPOSITORY_UNAVAILABLE',
});

const FIELDS = [
  ['directoryPath', 'utf8'],
  ['depth', 'int32'],
  ['directGitScopeCountsJson', 'utf8'],
  ['subtreeGitScopeCountsJson', 'utf8'],
  ['coverageStatus', 'utf8'],
];

function parentOf(relativePath) {
  if (relativePath === '.') return null;
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '.' : relativePath.slice(0, slash) || '.';
}

function stableJson(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
}

function toTable(rows) {
  const columns = Object.fromEntries(FIELDS.map(([name]) => [name, rows.map(row => row[name])]));
  return new Table(Object.fromEntries(FIELDS.map(([name, type]) => [
    name,
    type === 'int32' ? vectorFromArray(columns[name], new Int32()) : vectorFromArray(columns[name], new Utf8()),
  ])));
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) increment(target, key, value);
}

export function buildDirectoryGitRollupV1(pathTable, gitOverlayTable) {
  if (!pathTable || !gitOverlayTable || pathTable.numRows !== gitOverlayTable.numRows) {
    throw new TypeError('PATH_GIT_OVERLAY_ROW_COUNT_MISMATCH');
  }
  for (const field of ['ordinal', 'relativePath', 'entryKind']) {
    if (!pathTable.getChild(field)) throw new TypeError(`PATH_FIELD_MISSING:${field}`);
  }
  for (const field of ['ordinal', 'gitScopeCode']) {
    if (!gitOverlayTable.getChild(field)) throw new TypeError(`GIT_OVERLAY_FIELD_MISSING:${field}`);
  }

  const directories = new Map();
  const paths = pathTable.getChild('relativePath');
  const kinds = pathTable.getChild('entryKind');
  const pathOrdinals = pathTable.getChild('ordinal');
  const overlayOrdinals = gitOverlayTable.getChild('ordinal');
  const scopeCodes = gitOverlayTable.getChild('gitScopeCode');
  const unresolvedParents = [];
  let fileLikeRows = 0;

  for (let index = 0; index < pathTable.numRows; index += 1) {
    if (pathOrdinals.get(index) !== index || overlayOrdinals.get(index) !== index) {
      throw new Error(`ORDINAL_ALIGNMENT_MISMATCH:${index}`);
    }
    const relativePath = paths.get(index);
    if (typeof relativePath !== 'string') throw new Error(`PATH_INVALID:${index}`);
    if (kinds.get(index) !== 'DIRECTORY') continue;
    const depth = relativePath === '.' ? 0 : relativePath.split('/').length;
    if (directories.has(relativePath)) throw new Error(`DUPLICATE_DIRECTORY:${relativePath}`);
    directories.set(relativePath, {
      directoryPath: relativePath,
      parentPath: parentOf(relativePath),
      depth,
      direct: Object.create(null),
      subtree: Object.create(null),
    });
  }
  if (!directories.has('.')) throw new Error('ROOT_DIRECTORY_MISSING');

  for (let index = 0; index < pathTable.numRows; index += 1) {
    if (kinds.get(index) === 'DIRECTORY') continue;
    const relativePath = paths.get(index);
    const scopeLabel = SCOPE_LABELS[scopeCodes.get(index)];
    if (!scopeLabel) throw new Error(`GIT_SCOPE_CODE_INVALID:${index}`);
    fileLikeRows += 1;
    const parent = directories.get(parentOf(relativePath));
    if (!parent) {
      unresolvedParents.push(relativePath);
      continue;
    }
    increment(parent.direct, scopeLabel);
    increment(parent.subtree, scopeLabel);
  }

  const deepestFirst = [...directories.values()].sort((left, right) => right.depth - left.depth
    || (left.directoryPath < right.directoryPath ? 1 : left.directoryPath > right.directoryPath ? -1 : 0));
  for (const directory of deepestFirst) {
    if (directory.directoryPath === '.') continue;
    const parent = directories.get(directory.parentPath);
    if (!parent) {
      unresolvedParents.push(directory.directoryPath);
      continue;
    }
    mergeCounts(parent.subtree, directory.subtree);
  }

  const rows = [...directories.values()].sort((left, right) => left.directoryPath < right.directoryPath ? -1 : left.directoryPath > right.directoryPath ? 1 : 0)
    .map(directory => ({
      directoryPath: directory.directoryPath,
      depth: directory.depth,
      directGitScopeCountsJson: stableJson(directory.direct),
      subtreeGitScopeCountsJson: stableJson(directory.subtree),
      coverageStatus: unresolvedParents.length ? 'PARTIAL_UNRESOLVED_PARENT' : 'COMPLETE_PATH_DERIVED',
    }));
  const table = toTable(rows);
  return {
    bytes: tableToIPC(table, 'file'),
    directoryCount: table.numRows,
    fileLikeRows,
    unresolvedParentCount: unresolvedParents.length,
    unresolvedParentSamples: unresolvedParents.slice(0, 20),
    columns: table.numCols,
  };
}

export const DIRECTORY_GIT_ROLLUP_V1_SCHEMA = Object.freeze({ fields: FIELDS.map(([name]) => name) });
