import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_EXCERPT_BYTES = 360;
const STRUCTURAL_PATTERN = String.raw`(?:^\s*(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|type|interface)|(?:async\s+)?function\s+[A-Za-z_$]|class\s+[A-Za-z_$]|def\s+[A-Za-z_]\w*|CREATE\s+(?:TABLE|VIEW)|#\s+|//\s+)|"(?:schema|name|title|type|description|status)"\s*:)`;

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function safeFile(repoRoot, sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim() || /[\0\r\n]/.test(sourceRef)) return { status: 'SOURCE_REF_MISSING' };
  const root = fs.realpathSync(repoRoot);
  const normalizedRef = sourceRef.replace(/[\\/]+/g, path.sep);
  if (path.isAbsolute(normalizedRef) || normalizedRef.split(path.sep).includes('..')) return { status: 'SOURCE_PATH_OUTSIDE_REPO' };
  const candidates = [{ path: path.resolve(root, normalizedRef), resolvedVia: 'WORKSPACE_ROOT' }];
  // Some existing review rows are relative to the nested SvelteKit project. Resolve
  // that exact path only when the workspace-root path is absent; never fuzzy-match.
  if (!path.isAbsolute(normalizedRef) && !normalizedRef.split(path.sep).includes('..')) {
    candidates.push({ path: path.resolve(root, 'sveltekit-frontend', normalizedRef), resolvedVia: 'NESTED_SVELTEKIT_ROOT' });
  }
  let real = null;
  let resolvedVia = null;
  let lastError = null;
  for (const candidate of candidates) {
    const relative = path.relative(root, candidate.path);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) continue;
    try { real = fs.realpathSync(candidate.path); resolvedVia = candidate.resolvedVia; break; }
    catch (error) { lastError = error; if (error?.code !== 'ENOENT') break; }
  }
  if (!real) return { status: lastError?.code === 'ENOENT' || !lastError ? 'SOURCE_FILE_MISSING' : 'SOURCE_FILE_UNREADABLE' };
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) return { status: 'SOURCE_PATH_OUTSIDE_REPO' };
  const stat = fs.statSync(real);
  if (!stat.isFile()) return { status: 'SOURCE_NOT_FILE' };
  if (stat.size > MAX_SOURCE_BYTES) return { status: 'SOURCE_TOO_LARGE', byteLength: stat.size };
  return { status: 'SOURCE_FILE_READY', path: real, relativePath: realRelative.replaceAll(path.sep, '/'), resolvedVia, byteLength: stat.size };
}

function pathArguments(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const segments = normalized.split('/').filter(Boolean);
  const extension = path.posix.extname(normalized).toLowerCase() || '(none)';
  const knownMarkers = ['.venv', 'venv', 'node_modules', 'target', 'build', 'dist', 'scratch', 'memory/runs', 'logs', 'screenshots', 'fixtures', '.tmp', 'backup'];
  const marker = knownMarkers.find((value) => normalized.toLowerCase().includes(value));
  return [
    { kind: 'FILE_EXTENSION', value: extension, interpretation: 'format hint only' },
    ...(marker ? [{ kind: 'PATH_MARKER', value: marker, interpretation: 'possible dependency/generated/test artifact; reviewer confirms' }] : []),
  ];
}

function lineBounds(bytes, lineNumber) {
  let line = 1;
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (line === lineNumber) {
      let end = bytes.indexOf(0x0a, i);
      if (end < 0) end = bytes.length;
      if (end > i && bytes[end - 1] === 0x0d) end--;
      return { start: i, end };
    }
    if (bytes[i] === 0x0a) { line++; start = i + 1; }
  }
  if (line === lineNumber && start <= bytes.length) return { start, end: bytes.length };
  return null;
}

function utf8Excerpt(bytes, lineNumber, submatch) {
  const bounds = lineBounds(bytes, lineNumber);
  if (!bounds) return null;
  let start = bounds.start + Math.max(0, submatch?.start ?? 0);
  let end = bounds.start + Math.max(submatch?.end ?? 0, (submatch?.start ?? 0) + 1);
  start = Math.min(start, bounds.end);
  end = Math.min(end, bounds.end);
  const available = end - start;
  if (available < MAX_EXCERPT_BYTES) {
    const pad = MAX_EXCERPT_BYTES - available;
    start = Math.max(bounds.start, start - Math.floor(pad / 2));
    end = Math.min(bounds.end, end + Math.ceil(pad / 2));
  }
  while (start < end && (bytes[start] & 0xc0) === 0x80) start--;
  while (end < bounds.end && (bytes[end] & 0xc0) === 0x80) end++;
  if (end - start > MAX_EXCERPT_BYTES) end = start + MAX_EXCERPT_BYTES;
  while (end < bounds.end && (bytes[end] & 0xc0) === 0x80) end++;
  try {
    return { startByte: start, endByte: end, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end)) };
  } catch {
    return null;
  }
}

function rgLine(pathname, pattern) {
  const result = spawnSync('rg', ['--json', '--max-count', '1', '--max-columns', '4096', '-e', pattern, '--', pathname], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) return { status: 'RG_UNAVAILABLE', errorCode: result.error.code ?? 'RG_EXEC_FAILED' };
  if (result.status !== 0 && result.status !== 1) return { status: 'RG_FAILED', errorCode: `RG_EXIT_${result.status}` };
  for (const line of (result.stdout ?? '').split(/\r?\n/)) {
    if (!line) continue;
    try {
      const item = JSON.parse(line);
      if (item.type === 'match') return { status: 'RG_MATCH', lineNumber: item.data.line_number, submatch: item.data.submatches?.[0] ?? null };
    } catch { /* ignore malformed diagnostic line; no evidence is inferred from it */ }
  }
  return { status: 'RG_NO_MATCH' };
}

export function buildDomainReviewSourceEvidenceV1({ repoRoot, row }) {
  const sourceRef = row?.canonicalSourceRef || row?.sourceRef;
  const file = safeFile(repoRoot, sourceRef);
  const base = {
    schema: 'atlas.domain-review-source-evidence.v1',
    sourceRef: typeof sourceRef === 'string' ? sourceRef : null,
    sourcePathResolution: file.resolvedVia ?? null,
    evidenceStatus: file.status,
    evidenceScore: 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  if (file.status !== 'SOURCE_FILE_READY') return { ...base, byteLength: file.byteLength ?? null };
  const bytes = fs.readFileSync(file.path);
  const currentSourceSha256 = sha256(bytes);
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { ...base, evidenceStatus: 'SOURCE_BINARY_OR_INVALID_UTF8', sourcePath: file.relativePath, byteLength: bytes.length, currentSourceSha256, evidenceScore: 20, scoreComponents: { safePathAndFile: 20, utf8Text: 0, sourceBinding: 0, rgMatch: 0, spanChecksum: 0 }, supportingArguments: pathArguments(file.relativePath) }; }
  const expected = typeof row?.sourceRevision === 'string' ? row.sourceRevision : null;
  const expectedDigest = typeof row?.bindingContentDigest === 'string' ? row.bindingContentDigest : null;
  const normalizedDigest = (value) => typeof value === 'string' ? value.replace(/^sha256:/, '').toLowerCase() : null;
  const digestHex = currentSourceSha256.slice('sha256:'.length);
  let revisionStatus = !expected ? 'SOURCE_REVISION_UNRESOLVED'
    : expected !== currentSourceSha256 ? 'SOURCE_REVISION_MISMATCH'
      : !expectedDigest ? 'BINDING_CONTENT_DIGEST_MISSING'
        : normalizedDigest(expectedDigest) !== digestHex ? 'BINDING_CONTENT_DIGEST_MISMATCH'
          : !row?.workspaceRevision ? 'WORKSPACE_REVISION_MISSING'
            : 'SOURCE_BINDINGS_MATCH_WORKTREE';
  const firstPass = rgLine(file.path, STRUCTURAL_PATTERN);
  const match = firstPass.status === 'RG_MATCH' ? firstPass : rgLine(file.path, String.raw`\S`);
  if (match.status !== 'RG_MATCH') {
    const score = 20 + (revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE' ? 25 : 0);
    return { ...base, evidenceStatus: decoded.length ? 'TEXT_NO_RG_EXCERPT' : 'EMPTY_TEXT_FILE', sourcePath: file.relativePath, byteLength: bytes.length, currentSourceSha256, expectedSourceRevision: expected, expectedBindingContentDigest: expectedDigest, workspaceRevision: row?.workspaceRevision ?? null, workspaceRevisionCheck: row?.workspaceRevision ? 'RECORDED_NOT_REVALIDATED' : 'MISSING', revisionStatus, rgStatus: match.status, excerptText: '', lineNumber: null, startByte: null, endByte: null, excerptSha256: null, evidenceScore: score, scoreComponents: { safePathAndFile: 20, utf8Text: 20, sourceBinding: revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE' ? 25 : 0, rgMatch: 0, spanChecksum: 0 }, supportingArguments: pathArguments(file.relativePath) };
  }
  const excerpt = utf8Excerpt(bytes, match.lineNumber, match.submatch);
  if (!excerpt || !decoded) return { ...base, evidenceStatus: 'RG_SPAN_NOT_UTF8_VERIFIABLE', sourcePath: file.relativePath, byteLength: bytes.length, currentSourceSha256, expectedSourceRevision: expected, revisionStatus, rgStatus: match.status, evidenceScore: 40, scoreComponents: { safePathAndFile: 20, utf8Text: 20, sourceBinding: 0, rgMatch: 0, spanChecksum: 0 }, supportingArguments: pathArguments(file.relativePath) };
  const exactSpan = bytes.subarray(excerpt.startByte, excerpt.endByte);
  const excerptSha256 = sha256(exactSpan);
  const matchKind = firstPass.status === 'RG_MATCH' ? 'STRUCTURAL_OR_METADATA_LINE' : 'FIRST_NONEMPTY_LINE';
  const evidenceScore = 20 + 20 + (revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE' ? 25 : 0) + (firstPass.status === 'RG_MATCH' ? 20 : 10) + 15;
  return {
    ...base,
    evidenceStatus: revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE' ? 'SOURCE_EXCERPT_BINDINGS_MATCHED' : 'SOURCE_EXCERPT_BINDINGS_UNQUALIFIED',
    sourcePath: file.relativePath,
    byteLength: bytes.length,
    currentSourceSha256,
    expectedSourceRevision: expected,
    expectedBindingContentDigest: expectedDigest,
    workspaceRevision: row?.workspaceRevision ?? null,
    workspaceRevisionCheck: row?.workspaceRevision ? 'RECORDED_NOT_REVALIDATED' : 'MISSING',
    revisionStatus,
    rgStatus: match.status,
    matchKind: firstPass.status === 'RG_MATCH' ? 'STRUCTURAL_OR_METADATA_LINE' : 'FIRST_NONEMPTY_LINE',
    lineNumber: match.lineNumber,
    startByte: excerpt.startByte,
    endByte: excerpt.endByte,
    excerptSha256,
    excerptText: excerpt.text,
    evidenceScore,
    scoreComponents: { safePathAndFile: 20, utf8Text: 20, sourceBinding: revisionStatus === 'SOURCE_BINDINGS_MATCH_WORKTREE' ? 25 : 0, rgMatch: firstPass.status === 'RG_MATCH' ? 20 : 10, spanChecksum: 15 },
    supportingArguments: [
      ...pathArguments(file.relativePath),
      { kind: 'SOURCE_BINDING', value: revisionStatus, interpretation: 'provenance status; not a domain label' },
      { kind: 'RIPGREP_MATCH', value: matchKind, lineNumber: match.lineNumber, interpretation: 'verbatim source excerpt; reviewer determines relevance' },
    ],
  };
}
