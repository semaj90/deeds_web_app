import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte'];

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function candidatePaths(base, specifier) {
  const extension = path.extname(specifier);
  const values = [base];
  if (!extension) {
    for (const suffix of SOURCE_EXTENSIONS) values.push(`${base}${suffix}`);
    for (const suffix of SOURCE_EXTENSIONS) values.push(path.join(base, `index${suffix}`));
  } else if (extension === '.js') {
    for (const suffix of ['.ts', '.tsx', '.mts', '.cts']) values.push(`${base.slice(0, -extension.length)}${suffix}`);
  } else if (extension === '.mjs') {
    for (const suffix of ['.mts', '.ts']) values.push(`${base.slice(0, -extension.length)}${suffix}`);
  } else if (extension === '.cjs') {
    for (const suffix of ['.cts', '.ts']) values.push(`${base.slice(0, -extension.length)}${suffix}`);
  }
  return [...new Set(values)];
}

/** Resolve only a local relative import, returning evidence rather than an admitted edge. */
export function resolveRepoImportTargetV1({ workspaceRoot, sourceRef, sourceRevision, workspaceRevision, specifier }) {
  const result = { schema: 'atlas.repo-import-target-resolution.v1', canonicalAuthority: false, writesPerformed: false };
  if (!SHA256.test(String(workspaceRevision ?? ''))) return { ...result, status: 'WORKSPACE_REVISION_REQUIRED' };
  if (!SHA256.test(String(sourceRevision ?? ''))) return { ...result, status: 'SOURCE_REVISION_REQUIRED', workspaceRevision };
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return { ...result, status: 'NOT_A_RELATIVE_IMPORT', workspaceRevision };

  let root;
  let source;
  try {
    root = realpathSync(workspaceRoot);
    source = realpathSync(path.resolve(root, sourceRef));
  } catch {
    return { ...result, status: 'SOURCE_FILE_NOT_FOUND', workspaceRevision, sourceRef };
  }
  if (!inside(root, source)) return { ...result, status: 'SOURCE_OUTSIDE_WORKSPACE', workspaceRevision, sourceRef };

  let sourceBytes;
  try {
    sourceBytes = readFileSync(source);
  } catch {
    return { ...result, status: 'SOURCE_FILE_NOT_READABLE', workspaceRevision, sourceRef };
  }
  const observedSourceRevision = sha256(sourceBytes);
  if (observedSourceRevision !== sourceRevision) {
    return { ...result, status: 'SOURCE_REVISION_MISMATCH', workspaceRevision, sourceRef, sourceRevision, observedSourceRevision };
  }

  const base = path.resolve(path.dirname(source), specifier);
  const targets = new Map();
  for (const candidate of candidatePaths(base, specifier)) {
    try {
      if (!existsSync(candidate)) continue;
      const actual = realpathSync(candidate);
      if (!inside(root, actual) || !statSync(actual).isFile()) continue;
      const key = process.platform === 'win32' ? actual.toLowerCase() : actual;
      targets.set(key, actual);
    } catch {
      // Missing, unreadable, or escaping candidates are not valid targets.
    }
  }

  if (targets.size === 0) return { ...result, status: 'REPO_TARGET_NOT_FOUND', workspaceRevision, sourceRef, sourceRevision, specifier };
  if (targets.size > 1) {
    return {
      ...result,
      status: 'AMBIGUOUS_REPO_TARGET',
      workspaceRevision,
      sourceRef,
      sourceRevision,
      specifier,
      candidateCount: targets.size,
    };
  }

  const target = targets.values().next().value;
  const targetBytes = readFileSync(target);
  return {
    ...result,
    status: 'UNIQUE_LOCAL_TARGET',
    authorityState: 'PROPOSAL_ONLY',
    workspaceRevision,
    sourceRef,
    sourceRevision,
    specifier,
    targetRef: path.relative(root, target).split(path.sep).join('/'),
    targetSourceRevision: sha256(targetBytes),
    sourceEvidence: 'SOURCE_FILE_HASH_READBACK',
    targetEvidence: 'TARGET_FILE_HASH_READBACK',
    workspaceRevisionBinding: 'SUPPLIED_BY_UPSTREAM_PLAN_NOT_REVERIFIED_HERE',
  };
}
