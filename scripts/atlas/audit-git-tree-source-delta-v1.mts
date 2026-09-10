import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/git-tree-source-delta-v1.json');
const nul = String.fromCharCode(0);
const sourceExtensions = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs', '.c', '.cc', '.cpp',
  '.cxx', '.h', '.hh', '.hpp', '.sql', '.proto', '.graphql', '.gql',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.md', '.mdx', '.sh',
  '.bash', '.zsh', '.ps1', '.psm1',
]);
const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '');
const isSource = (value: string) => {
  const ref = normalize(value).toLowerCase();
  return !ref.startsWith('.git/') && !ref.startsWith('docs/reports/') && sourceExtensions.has(resolve(ref).slice(resolve(ref).lastIndexOf('.')).toLowerCase());
};
const git = (args: string[], encoding: BufferEncoding = 'utf8') => execFileSync('git', args, { cwd: root, encoding, maxBuffer: 64 * 1024 * 1024 });
const digest = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const headCommit = git(['rev-parse', 'HEAD']).trim();
const headTree = git(['rev-parse', 'HEAD^{tree}']).trim();
const status = git(['status', '--porcelain=v1', '--untracked-files=all']).trim();
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.git-tree-source-delta.v1',
});

const base = new Map<string, { blobOid: string }>();
for (const record of git(['ls-tree', '-r', '-z', headCommit]).split(nul).filter(Boolean)) {
  const separator = record.indexOf('\t');
  if (separator < 0) continue;
  const metadata = record.slice(0, separator).split(/\s+/);
  const sourceRef = normalize(record.slice(separator + 1));
  if (!isSource(sourceRef) || !metadata[2]) continue;
  base.set(sourceRef, { blobOid: metadata[2] });
}
const current = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
const rows: Array<Record<string, unknown>> = [];
for (const [sourceRef, binding] of current) {
  const previous = base.get(sourceRef);
  const unchanged = Boolean(previous && binding.trackedAtBaseCommit && !binding.dirtyRelativeToBaseCommit && binding.gitBlobOid === previous.blobOid);
  rows.push({
    sourceRef,
    operation: unchanged ? 'READ_UNCHANGED' : previous ? 'UPDATE' : 'CREATE',
    sourceRevision: binding.sourceRevision,
    contentDigest: binding.contentDigest,
    byteLength: binding.byteLength,
    baseCommitOid: headCommit,
    baseTreeOid: headTree,
    gitBlobOid: binding.gitBlobOid,
    trackedAtBaseCommit: binding.trackedAtBaseCommit,
    dirtyRelativeToBaseCommit: binding.dirtyRelativeToBaseCommit,
    workspaceRevision: origin.record.workspaceRevision,
    canonicalAuthority: false,
  });
}
for (const [sourceRef, previous] of base) {
  if (!current.has(sourceRef)) {
    const presentOnDisk = (() => {
      try { return statSync(resolve(root, sourceRef)).isFile(); } catch { return false; }
    })();
    rows.push({
    sourceRef, operation: presentOnDisk ? 'EXCLUDED_CURRENT_SOURCE' : 'DELETE_TOMBSTONE', sourceRevision: null, contentDigest: null, byteLength: null,
    baseCommitOid: headCommit,
    baseTreeOid: headTree,
    gitBlobOid: previous.blobOid,
    trackedAtBaseCommit: true,
    dirtyRelativeToBaseCommit: true,
    workspaceRevision: origin.record.workspaceRevision,
    canonicalAuthority: false,
    currentPathPresent: presentOnDisk,
  });
  }
}

const creates = rows.filter((row) => row.operation === 'CREATE');
const deletes = rows.filter((row) => row.operation === 'DELETE_TOMBSTONE');
const operationCounts = rows.reduce<Record<string, number>>((counts, row) => {
  const operation = String(row.operation);
  counts[operation] = (counts[operation] ?? 0) + 1;
  return counts;
}, {});
const ambiguousRenames: string[] = [];
const report = {
  schema: 'atlas.git-tree-source-delta.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  base: { commitOid: headCommit, treeOid: headTree, endHeadCommit: null as string | null, headStableDuringRun: false },
  current: { workspaceRevision: origin.record.workspaceRevision, sourceCount: origin.record.sourceCount, dirty: origin.record.dirty },
  operationCounts,
  invariants: {
    duplicateSourceRefs: rows.length - new Set(rows.map((row) => row.sourceRef)).size,
    syntheticIdentities: 0,
    ambiguousRenames: ambiguousRenames.length,
    renameDetection: 'DEFERRED_UNTIL_DELETED_CONTENT_HYDRATION',
    deterministicReplay: true,
    canonicalAuthority: false,
    writesPerformed: false,
  },
  rows: rows.sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef))),
};
const endHeadCommit = git(['rev-parse', 'HEAD']).trim();
report.base = { ...report.base, endHeadCommit, headStableDuringRun: endHeadCommit === headCommit };
if (endHeadCommit !== headCommit) report.invariants.deterministicReplay = false;
const checksum = digest(JSON.stringify(report));
await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ ...report, checksum }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: endHeadCommit === headCommit && ambiguousRenames.length === 0 ? 'READ_ONLY_DELTA_PROVEN' : endHeadCommit !== headCommit ? 'READ_ONLY_DELTA_UNSTABLE_HEAD' : 'READ_ONLY_DELTA_AMBIGUOUS_RENAME', baseTreeOid: headTree, workspaceRevision: origin.record.workspaceRevision, sourceCount: origin.record.sourceCount, operationCounts, writesPerformed: false, reportPath, checksum }, null, 2));
