import fs from 'node:fs';
import path from 'node:path';

export function resolveExactIndexFileTargetV1({ workspaceRoot, relativePath, indexableExtensions, skipPath }) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) {
    throw new Error('INDEX_FILE_TARGET_REQUIRED');
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error('INDEX_FILE_TARGET_MUST_BE_WORKSPACE_RELATIVE');
  }

  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('INDEX_FILE_TARGET_PATH_INVALID');
  }
  const normalizedPath = segments.join('/');
  if (skipPath?.(normalizedPath)) throw new Error('INDEX_FILE_TARGET_EXCLUDED');

  const root = fs.realpathSync(workspaceRoot);
  const absolutePath = path.resolve(root, ...segments);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error('INDEX_FILE_TARGET_SYMLINK_REJECTED');
  if (!stat.isFile()) throw new Error('INDEX_FILE_TARGET_NOT_FILE');

  const realPath = fs.realpathSync(absolutePath);
  const relativeRealPath = path.relative(root, realPath);
  if (!relativeRealPath || relativeRealPath === '..' || relativeRealPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRealPath)) {
    throw new Error('INDEX_FILE_TARGET_OUTSIDE_WORKSPACE');
  }
  const extension = path.extname(realPath).toLowerCase();
  if (!(indexableExtensions instanceof Set) || !indexableExtensions.has(extension)) {
    throw new Error('INDEX_FILE_TARGET_EXTENSION_UNSUPPORTED');
  }
  return { absolutePath: realPath, relativePath: relativeRealPath.split(path.sep).join('/') };
}
