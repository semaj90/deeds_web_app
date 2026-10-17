import fs from 'node:fs';
import path from 'node:path';

function containedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveSourceRefPathV1(sourceRoot, sourceRef, index = new Map()) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim() || sourceRef.includes('\0')) return null;
  const normalized = sourceRef.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized.split('/').some((segment) => segment === '..')) return null;

  const root = path.resolve(sourceRoot);
  const candidates = [
    path.resolve(root, 'sveltekit-frontend', normalized),
    path.resolve(root, normalized),
    index.get(normalized),
  ].filter((candidate) => typeof candidate === 'string' && containedPath(root, candidate));
  const suffixMatches = [...index.entries()]
    .filter(([relative]) => relative.endsWith(`/${normalized}`))
    .map(([, candidate]) => candidate)
    .filter((candidate) => typeof candidate === 'string' && containedPath(root, candidate));
  if (suffixMatches.length === 1) candidates.push(suffixMatches[0]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
