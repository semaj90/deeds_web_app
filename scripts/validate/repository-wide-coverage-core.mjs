import path from 'node:path';

/** Pure accounting for the repository-wide coverage receipt. No I/O except the injected `lstat`. */

/** Extension routing proposal. Existing owner: agentic-file-compiler helper-registry-v1.ts (not yet reconciled). */
export const PARSER_BY_EXTENSION = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.svelte': 'svelte', '.md': 'markdown', '.mdx': 'markdown', '.json': 'json-structured', '.jsonl': 'json-structured',
  '.yaml': 'yaml-structured', '.yml': 'yaml-structured', '.sql': 'sql', '.py': 'python', '.css': 'css', '.html': 'html',
  '.go': 'go', '.rs': 'rust', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.h': 'cpp', '.cu': 'cuda', '.ps1': 'powershell', '.sh': 'shell',
};

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const emptyCounts = () => ({ selected: 0, processedBound: 0, legacyPacketObserved: 0, revisionQualified: 0, registryIdentityQualified: 0, missingOnDisk: 0, nestedUnmapped: 0 });

export function accountMemberships({ memberships, bound, legacyPacketRefs, registryPresent, workspaceRevision, rootScope, lstat }) {
  const seen = new Set();
  const caseFold = new Map();
  const perDir = new Map();
  const perScope = new Map();
  const parserCounts = {};
  const unsupported = {};
  const violations = { duplicatePaths: [], caseFoldCollisions: [], unsafePaths: [], symlinks: [] };
  const bump = (map, key, field) => {
    const row = map.get(key) ?? emptyCounts();
    row[field] += 1;
    map.set(key, row);
  };

  for (const m of memberships) {
    const rel = m.rel.replaceAll('\\', '/');
    const key = `${m.scope}\u0000${rel}`;
    if (seen.has(key)) violations.duplicatePaths.push(`${m.scope}:${rel}`);
    seen.add(key);
    const folded = `${m.scope}\u0000${rel.toLowerCase()}`;
    if (caseFold.has(folded) && caseFold.get(folded) !== rel) violations.caseFoldCollisions.push(`${m.scope}:${rel} ~ ${caseFold.get(folded)}`);
    caseFold.set(folded, rel);
    if (rel.startsWith('/') || rel.split('/').includes('..') || rel.includes('\u0000')) violations.unsafePaths.push(`${m.scope}:${rel}`);

    const dirKey = `${m.scope} :: ${path.posix.dirname(rel)}`;
    const ext = path.posix.extname(rel).toLowerCase() || '(none)';
    const parser = PARSER_BY_EXTENSION[ext] ?? null;
    if (parser) parserCounts[parser] = (parserCounts[parser] ?? 0) + 1;
    else unsupported[ext] = (unsupported[ext] ?? 0) + 1;

    const isRoot = m.scope === rootScope;
    const stat = isRoot ? lstat(rel) : undefined;
    for (const [map, k] of [[perDir, dirKey], [perScope, m.scope]]) {
      bump(map, k, 'selected');
      if (bound.has(m.sourceRef)) bump(map, k, 'processedBound');
      if (legacyPacketRefs.has(m.sourceRef)) bump(map, k, 'legacyPacketObserved');
      if (SHA256.test(m.srcRev ?? '') && m.wsRev === workspaceRevision) bump(map, k, 'revisionQualified');
      if (isRoot && registryPresent) bump(map, k, 'registryIdentityQualified');
      if (!isRoot) bump(map, k, 'nestedUnmapped');
      if (isRoot && !stat) bump(map, k, 'missingOnDisk');
    }
    if (isRoot && stat?.isSymbolicLink()) violations.symlinks.push(rel);
  }

  const sorted = (map, label) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, counts]) => ({ [label]: name, ...counts }));
  return { directories: sorted(perDir, 'directory'), scopes: sorted(perScope, 'scope'), parserCounts, unsupported, violations };
}
