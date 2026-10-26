import { Int32, Table, Utf8, vectorFromArray, tableToIPC } from 'apache-arrow';

const COLUMN_NAMES = [
  'ordinal', 'relativePath', 'entryKind', 'role', 'extension', 'extensionPresent',
  'sizeBytes', 'sizeBytesPresent', 'dotPath', 'editPolicy', 'indexingStatus',
  'mappedLanguageId', 'mappedLanguagePresent', 'parserEligibility', 'graphifyMembership',
];

export async function buildDirectoryPathArrowV1(rowsAsyncIterable, { maxRows = 2_000_000 } = {}) {
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 2_000_000) throw new RangeError('ARROW_MAX_ROWS_INVALID');
  const columns = Object.fromEntries(COLUMN_NAMES.map(name => [name, []]));
  let ordinal = 0;
  for await (const row of rowsAsyncIterable) {
    if (ordinal >= maxRows) throw new RangeError('ARROW_ROW_LIMIT_EXCEEDED');
    if (typeof row.relativePath !== 'string') throw new Error('PATH_MANIFEST_PATH_INVALID');
    columns.ordinal.push(ordinal++);
    columns.relativePath.push(row.relativePath);
    columns.entryKind.push(row.entryKind);
    columns.role.push(row.role);
    columns.extension.push(row.extension ?? '');
    columns.extensionPresent.push(row.extension !== null);
    columns.sizeBytes.push(row.sizeBytes === null ? '' : String(row.sizeBytes));
    columns.sizeBytesPresent.push(row.sizeBytes !== null);
    columns.dotPath.push(Boolean(row.dotPath));
    columns.editPolicy.push(row.editPolicy);
    columns.indexingStatus.push(row.indexingStatus);
    columns.mappedLanguageId.push(row.mappedLanguageId ?? '');
    columns.mappedLanguagePresent.push(row.mappedLanguageId !== null);
    columns.parserEligibility.push(row.parserEligibility);
    columns.graphifyMembership.push(row.graphifyMembership);
  }
  const vectors = Object.fromEntries(Object.entries(columns).map(([name, values]) => {
    const type = name === 'ordinal' ? new Int32() : [
      'extensionPresent', 'sizeBytesPresent', 'dotPath', 'mappedLanguagePresent',
    ].includes(name) ? undefined : new Utf8();
    return [name, type ? vectorFromArray(values, type) : vectorFromArray(values)];
  }));
  const table = new Table(vectors);
  return { bytes: tableToIPC(table, 'file'), rowCount: ordinal, columnCount: table.numCols, format: 'ARROW_IPC_FILE_V1' };
}
