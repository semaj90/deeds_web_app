export const DEFAULT_MAX_INDEX_FILE_BYTES = 5 * 1024 * 1024;

export function parseMaxIndexFileBytes(value) {
  if (value == null || value === '') return DEFAULT_MAX_INDEX_FILE_BYTES;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('INDEX_MAX_FILE_BYTES_INVALID');
  }
  return parsed;
}

export function exceedsIndexFileSizeLimit(fileSize, maxBytes) {
  return !Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > maxBytes;
}
