/** DOC-23 executable fixture proof: ast-grep match and rewrite preview, no workspace mutation. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-23-ast-grep-repair-planner-v1.json');
const doc24Path = path.resolve(root, 'docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json');
const astGrepPath = path.resolve(root, 'node_modules/@ast-grep/cli/ast-grep.exe');
const pattern = 'export const value = $A';
const replacement = 'export const value = "newValue";';
const source = Buffer.from('export const value = "oldValue";\n', 'utf8');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceRevision = digest(source);
const checks = [];
let tempDir;
let diffPreview = '';
let match = null;
let astGrepVersion = null;
let cleanedAfterRun = false;

function run(name, args, cwd) {
  const result = spawnSync(astGrepPath, args, { cwd, encoding: 'utf8', windowsHide: true });
  checks.push({
    name,
    argv: [astGrepPath, ...args],
    status: !result.error && result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    stdoutChecksum: digest(result.stdout ?? ''),
    stderrChecksum: digest(result.stderr ?? ''),
    ...(result.error ? { detail: result.error.message.slice(0, 300) } : {}),
  });
  return result;
}

const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
const repositoryRevision = git.status === 0 ? git.stdout.trim() : null;
const worktreeDirty = status.status === 0 ? status.stdout.trim().length > 0 : null;

try {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-doc23-astgrep-'));
  const sourcePath = path.join(tempDir, 'example.ts');
  await fs.writeFile(sourcePath, source);
  const version = spawnSync(astGrepPath, ['--version'], { cwd: tempDir, encoding: 'utf8', windowsHide: true });
  astGrepVersion = version.status === 0 ? version.stdout.trim() : null;

  const search = run('ast-grep-structural-search', [
    'run', '--pattern', pattern, '--lang', 'ts', '--json', sourcePath,
  ], tempDir);
  let matches = [];
  if (search.status === 0 && !search.error) {
    try { matches = JSON.parse(search.stdout); } catch { matches = []; }
  }
  const candidate = matches.length === 1 ? matches[0] : null;
  const metavariable = candidate?.metaVariables?.single?.A;
  const literalRange = metavariable?.range?.byteOffset;
  const exactMatch = candidate?.text === source.toString('utf8').trimEnd() &&
    metavariable?.text === '"oldValue"' &&
    Number.isSafeInteger(literalRange?.start) && Number.isSafeInteger(literalRange?.end) &&
    literalRange.start < literalRange.end &&
    source.subarray(literalRange.start, literalRange.end).toString('utf8') === metavariable.text;
  if (exactMatch) {
    match = {
      ruleId: 'replace-legacy-value',
      language: 'typescript',
      startByte: literalRange.start + 1,
      endByte: literalRange.end - 1,
      matchedText: 'oldValue',
      evidenceRef: `ast-grep:replace-legacy-value:${digest(Buffer.from(JSON.stringify(candidate.range.byteOffset), 'utf8')).slice(7, 23)}`,
      wholeNodeRange: candidate.range.byteOffset,
      metavariableRange: literalRange,
    };
  }
  checks.push({ name: 'exact-metavariable-byte-span', status: exactMatch ? 'PASS' : 'FAIL', exitCode: exactMatch ? 0 : 1, matchCount: matches.length });

  const preview = run('ast-grep-rewrite-diff-preview', [
    'run', '--pattern', pattern, '--rewrite', replacement, '--lang', 'ts', sourcePath,
  ], tempDir);
  diffPreview = preview.stdout ?? '';
  const previewValid = preview.status === 0 && !preview.error && diffPreview.includes('oldValue') && diffPreview.includes('newValue');
  checks.push({ name: 'diff-preview-contains-before-and-after', status: previewValid ? 'PASS' : 'FAIL', exitCode: previewValid ? 0 : 1, previewChecksum: digest(Buffer.from(diffPreview, 'utf8')) });
  const workspaceUntouched = digest(await fs.readFile(sourcePath)) === sourceRevision;
  checks.push({ name: 'ast-grep-did-not-write-fixture', status: workspaceUntouched ? 'PASS' : 'FAIL', exitCode: workspaceUntouched ? 0 : 1 });

  const doc24 = JSON.parse(await fs.readFile(doc24Path, 'utf8'));
  const proposedSource = Buffer.concat([
    source.subarray(0, match?.startByte ?? 0),
    Buffer.from(replacement.includes('newValue') ? 'newValue' : '', 'utf8'),
    source.subarray(match?.endByte ?? 0),
  ]);
  const doc24Aligned = Boolean(match) && doc24.status === 'DOC_24_PATCH_PROPOSAL_FIXTURE_PROVEN' &&
    doc24.proposal.baseSourceRevision === sourceRevision &&
    doc24.proposal.patchDigest === digest(proposedSource) &&
    doc24.proposal.hunks?.length === 1 &&
    doc24.proposal.hunks[0].startByte === match.startByte &&
    doc24.proposal.hunks[0].endByte === match.endByte &&
    doc24.proposal.hunks[0].before === match.matchedText;
  checks.push({ name: 'doc24-proposal-byte-and-digest-parity', status: doc24Aligned ? 'PASS' : 'FAIL', exitCode: doc24Aligned ? 0 : 1 });
} catch (error) {
  checks.push({ name: 'ast-grep-fixture-harness', status: 'FAIL', exitCode: 1, detail: String(error?.stack ?? error).slice(0, 500) });
} finally {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    cleanedAfterRun = true;
  }
}

const passed = checks.length >= 5 && checks.every((check) => check.status === 'PASS');
const proposal = {
  schema: 'atlas.patch-proposal.v1',
  sourceRef: 'src/example.ts',
  baseSourceRevision: sourceRevision,
  matches: match ? [match] : [],
  replacementText: replacement,
  evidenceRefs: match ? [match.evidenceRef] : [],
  canonicalAuthority: false,
  mutationAuthorized: false,
};
const report = {
  schema: 'atlas.doc-23-ast-grep-repair-planner-proof.v1',
  gate: 'DOC-23',
  status: passed ? 'DOC_23_AST_GREP_LIVE_FIXTURE_PREVIEW_PROVEN' : 'DOC_23_AST_GREP_LIVE_FIXTURE_PREVIEW_FAILED',
  proofMode: 'SYNTHETIC_FIXTURE_ONLY',
  repositoryRevision,
  worktreeDirty,
  astGrepVersion,
  structuralMatch: match,
  diffPreviewChecksum: digest(Buffer.from(diffPreview, 'utf8')),
  proposal,
  checks,
  isolatedWorkspace: { created: Boolean(tempDir), cleanedAfterRun, persistentSourceModified: false },
  writesPerformed: false,
  ephemeralWritesPerformed: Boolean(tempDir),
  persistentWritesPerformed: false,
  canonicalAuthority: false,
  mutationAuthorized: false,
  nextGate: 'DOC_24_TARGET_SOURCE_REVIEW_AND_EXPLICIT_MUTATION_AUTHORIZATION',
};
const reportTempPath = `${reportPath}.${process.pid}.tmp`;
try {
  await fs.writeFile(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(reportTempPath, reportPath);
} catch (error) {
  await fs.rm(reportTempPath, { force: true });
  throw error;
}
console.log(JSON.stringify({ reportPath, status: report.status, astGrepVersion, checks, persistentWritesPerformed: false }, null, 2));
if (!passed) process.exitCode = 1;
