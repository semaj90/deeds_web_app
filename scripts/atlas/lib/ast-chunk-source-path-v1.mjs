import path from 'node:path';

const SOURCE_PATH = /^[A-Za-z0-9_.+\-/()[\]]+\.(ts|tsx|js|jsx|mjs|mts|cjs|cts|py|pyi|rs|go|java|svelte|cc|cpp|hpp)$/;

export function isValidAstChunkSourcePathV1(value) {
  return typeof value === 'string' && SOURCE_PATH.test(value) && !value.includes('..') && !path.isAbsolute(value);
}
