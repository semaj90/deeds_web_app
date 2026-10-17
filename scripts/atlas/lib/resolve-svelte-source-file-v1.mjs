import { resolveExactIndexFileTargetV1 } from './exact-index-file-target-v1.mjs';

const SVELTE_SOURCE_PATH = /^[A-Za-z0-9_.\-/()[\]+@]+\.svelte$/;

export function resolveSvelteSourceFileV1(workspaceRoot, relativePath) {
  if (typeof relativePath !== 'string') {
    throw new Error('SVELTE_SOURCE_PATH_SYNTAX_REJECTED');
  }
  const normalizedPath = relativePath.replaceAll('\\', '/');
  if (!SVELTE_SOURCE_PATH.test(normalizedPath)) throw new Error('SVELTE_SOURCE_PATH_SYNTAX_REJECTED');
  return resolveExactIndexFileTargetV1({
    workspaceRoot,
    relativePath: normalizedPath,
    indexableExtensions: new Set(['.svelte']),
  });
}
