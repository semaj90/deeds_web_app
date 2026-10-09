import path from 'node:path';

export function resolveOkfDevIndexRootV1({ repoRoot, requestedRoot }) {
  const defaultRoot = path.resolve(repoRoot, 'docs/.okf/dev');
  if (!requestedRoot) return defaultRoot;

  const resolvedRoot = path.resolve(repoRoot, requestedRoot);
  const scratchRoot = path.resolve(repoRoot, '.tmp/atlas');
  const relativeToScratch = path.relative(scratchRoot, resolvedRoot);
  const isScratchRoot = relativeToScratch === ''
    || (!relativeToScratch.startsWith('..') && !path.isAbsolute(relativeToScratch));

  if (resolvedRoot !== defaultRoot && !isScratchRoot) {
    throw new Error('CORPUS_ROOT_MUST_BE_DEFAULT_OKF_OR_TMP_ATLAS');
  }

  return resolvedRoot;
}
