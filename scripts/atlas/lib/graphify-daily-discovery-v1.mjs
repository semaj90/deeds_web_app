import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { shouldSkipDirectory } from './repo-scan-roots.mjs';

export const DISCOVERY_ROOTS = Object.freeze([
  'sveltekit-frontend/src', 'packages', 'python', 'simd-bridge', 'scripts/atlas',
]);
export const OWNERSHIP_REGISTRY = 'docs/architecture/runtime-ownership-registry.json';
export const DISCOVERY_GUIDES = Object.freeze([
  'docs/architecture/_topology_classifier_index.md',
  'docs/architecture/_cuda_rtx_toc.md',
]);
export const GRAPH_ARTIFACTS = Object.freeze([
  'sveltekit-frontend/docs/graph/codebase-graph.json',
  'docs/graph/codebase-graph.json',
  'graphify/frozen-graph-snapshot-v2.json',
]);
const SOURCE_EXCLUSIONS = [
  '!**/node_modules/**', '!**/.git/**', '!**/.venv*/**', '!**/.python*/**',
  '!**/.tmp/**', '!**/.cache/**', '!**/.svelte-kit/**', '!**/__pycache__/**',
  '!**/dist/**', '!**/build*/**', '!**/target/**', '!**/vendor/**',
  '!**/archive*/**', '!**/docs/**', '!**/reports/**', '!**/.env*',
];
const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.mts', '*.cjs', '*.cts',
  '*.svelte', '*.py', '*.cc', '*.cpp', '*.c', '*.h', '*.hpp', '*.proto', '*.sql'];
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const ordered = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function isDiscoveryCandidate(relativePath) {
  return DISCOVERY_ROOTS.some((prefix) => relativePath.startsWith(`${prefix}/`))
    && !shouldSkipDirectory(relativePath)
    && !relativePath.split('/').some((part) => /^(docs|reports|vendor|_?archive.*|build.*)$/.test(part))
    && SOURCE_GLOBS.includes(`*${path.extname(relativePath)}`);
}

export function resolveDiscoveryPath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')
    || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error('WORKSPACE_RELATIVE_PATH_REQUIRED');
  }
  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) throw new Error('INVALID_PATH_SEGMENT');
  const resolvedRoot = realpathSync(root);
  const target = path.resolve(resolvedRoot, ...segments);
  const actual = realpathSync(target);
  const relative = path.relative(resolvedRoot, actual);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('PATH_OUTSIDE_WORKSPACE');
  }
  return target;
}

function optionalPath(root, relativePath) {
  try { return resolveDiscoveryPath(root, relativePath); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
}

export function readTrackedInventory(root, { measureSizes = false } = {}) {
  const raw = git(root, ['ls-files', '--stage', '-z']);
  const directories = new Map(readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => [entry.name, {
      path: entry.name, trackedFiles: 0, trackedBytes: measureSizes ? 0 : null, discoveryCandidateFiles: 0,
    }]));
  const trackedPaths = new Set();
  const trackedDirectories = new Set();
  const gitlinks = [];
  let missingFiles = 0;
  let trackedBytes = 0;
  for (const record of raw.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    if (separator < 0) throw new Error('INVALID_GIT_INVENTORY');
    const relativePath = record.slice(separator + 1);
    if (trackedPaths.has(relativePath)) continue;
    trackedPaths.add(relativePath);
    if (record.startsWith('160000 ')) { gitlinks.push(relativePath); continue; }
    const parts = relativePath.split('/');
    for (let depth = 1; depth < parts.length; depth++) trackedDirectories.add(parts.slice(0, depth).join('/'));
    const directory = parts.length > 1 ? directories.get(parts[0]) : null;
    if (directory) directory.trackedFiles++;
    if (directory && isDiscoveryCandidate(relativePath)) directory.discoveryCandidateFiles++;
    if (!measureSizes) continue;
    let bytes = 0;
    try {
      const target = optionalPath(root, relativePath);
      if (!target) { missingFiles++; continue; }
      const stat = lstatSync(target);
      if (!stat.isFile()) continue;
      bytes = stat.size;
    } catch (error) {
      if (error.code === 'ENOENT') { missingFiles++; continue; }
      if (error.message === 'PATH_OUTSIDE_WORKSPACE') continue;
      throw error;
    }
    trackedBytes += bytes;
    if (directory) {
      directory.trackedBytes += bytes;
    }
  }
  return {
    trackedPaths,
    summary: {
      physicalRootDirectoryCount: directories.size,
      trackedPathCount: trackedPaths.size,
      trackedDirectoryCount: trackedDirectories.size,
      trackedBytes: measureSizes ? trackedBytes : null,
      missingFiles: measureSizes ? missingFiles : null, gitlinks,
      membershipChecksum: sha256([...trackedPaths].sort(ordered).join('\0')),
      measurement: measureSizes ? 'TRACKED_WORKTREE_FILE_METADATA' : 'TRACKED_PATH_NAMES_ONLY',
      candidateNote: 'Path/extension candidates only; rg applies current ignore rules and per-file limits',
      directories: [...directories.values()].sort((left, right) => ordered(left.path, right.path)),
    },
  };
}

export function readOwnershipIndex(root, query = '', limit = 20) {
  const target = resolveDiscoveryPath(root, OWNERSHIP_REGISTRY);
  if (lstatSync(target).size > 2 * 1024 * 1024) throw new Error('OWNERSHIP_REGISTRY_TOO_LARGE');
  const raw = readFileSync(target);
  const registry = JSON.parse(raw.toString('utf8'));
  const terms = [...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean))].slice(0, 16);
  const records = [];
  function visit(value, pointer) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.path === 'string') {
      const searchable = `${pointer} ${JSON.stringify(value)}`.toLowerCase();
      const matchedTerms = terms.filter((term) => searchable.includes(term));
      if (!terms.length || matchedTerms.length) records.push({
        registryPointer: pointer, declaredPath: value.path, matchedTerms,
        declaredStatus: value.status ?? null, classification: value.classification ?? null,
        declaredUnproven: value.unproven ?? null, evidence: value.evidence ?? null,
        verification: 'REGISTRY_DECLARATION_ONLY',
      });
    }
    for (const [key, child] of Object.entries(value)) {
      const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
      visit(child, `${pointer}/${escaped}`);
    }
  }
  visit(registry, '');
  records.sort((left, right) => right.matchedTerms.length - left.matchedTerms.length
    || ordered(left.registryPointer, right.registryPointer));
  return {
    path: OWNERSHIP_REGISTRY, checksum: sha256(raw), declaredGeneratedAt: registry.generated ?? null,
    totalMatchingRecords: records.length, records: records.slice(0, limit),
    truncated: records.length > limit, promotionAuthorized: false,
  };
}

export async function inspectGraphArtifacts(root, trackedPaths, {
  hashGraphs = false, maxHashBytes = 64 * 1024 * 1024, maxAgeHours = 24, now = Date.now(),
} = {}) {
  const artifacts = [];
  for (const relativePath of GRAPH_ARTIFACTS) {
    const target = optionalPath(root, relativePath);
    if (!target) { artifacts.push({ path: relativePath, status: 'MISSING' }); continue; }
    const stat = lstatSync(target);
    if (!stat.isFile()) throw new Error('GRAPH_ARTIFACT_MUST_BE_REGULAR_FILE');
    const ageHours = (now - stat.mtimeMs) / 3600000;
    let ignoreRule = null;
    try { ignoreRule = git(root, ['check-ignore', '-v', '--', relativePath]).trim() || null; }
    catch (error) { if (error.status !== 1) throw error; }
    let digest = null;
    let digestStatus = hashGraphs ? 'SKIPPED_SIZE_LIMIT' : 'NOT_REQUESTED';
    if (hashGraphs && stat.size <= maxHashBytes) {
      const hash = createHash('sha256');
      let bytesRead = 0;
      for await (const chunk of createReadStream(target)) {
        bytesRead += chunk.length;
        if (bytesRead > maxHashBytes) throw new Error('GRAPH_ARTIFACT_GREW_PAST_HASH_LIMIT');
        hash.update(chunk);
      }
      const after = lstatSync(target);
      if (bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
        throw new Error('GRAPH_ARTIFACT_CHANGED_DURING_HASH');
      }
      digest = `sha256:${hash.digest('hex')}`;
      digestStatus = 'HASHED_CONTENT_ONLY';
    }
    artifacts.push({
      path: relativePath, bytes: stat.size, modifiedAt: stat.mtime.toISOString(),
      ageHours: Math.round(ageHours * 100) / 100,
      status: ageHours < 0 ? 'FUTURE_MTIME' : ageHours > maxAgeHours ? 'STALE_BY_MTIME' : 'RECENT_MTIME_ONLY',
      tracked: trackedPaths.has(relativePath), ignoreRule, digest, digestStatus,
      sourceLineageVerified: false,
    });
  }
  const [appGraph, rootGraph] = artifacts;
  return {
    artifacts,
    compatibilityCopiesEqual: appGraph.digest && rootGraph.digest ? appGraph.digest === rootGraph.digest : null,
    maxHashBytes, maxAgeHours,
    producer: 'sveltekit-frontend/scripts/index-codebase-fast.mjs', producerRevision: null,
    consumer: 'sveltekit-frontend/src/lib/server/graph/graph-intel.ts',
    lineageGate: 'NOT_EVALUATED; matching content or recent mtime cannot qualify graph lineage',
  };
}

function searchPaths(root, paths, query, limit, exclusions, timeoutMs = 10000) {
  if (!paths.length) return Promise.resolve({ status: 'NO_MATCHES', matches: [], truncated: false });
  const args = ['--no-config', '--json', '--fixed-strings', '--ignore-case', '--sort', 'path',
    '--max-count', '5', '--max-filesize', '2M', ...exclusions.flatMap((glob) => ['--glob', glob]),
    '-e', query, '--', ...paths];
  return new Promise((resolve) => {
    const child = spawn('rg', args, { cwd: root, shell: false, windowsHide: true });
    const matches = [];
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let stderr = '';
    let error = null;
    let bytes = 0;
    let truncated = false;
    const timer = setTimeout(() => { error = 'RG_TIMEOUT'; child.kill(); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (error || truncated) return;
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) { error = 'RG_OUTPUT_BUDGET_EXCEEDED'; child.kill(); return; }
      pending += decoder.write(chunk);
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type !== 'match') continue;
          if (typeof event.data.path.text !== 'string') throw new Error('RG_NON_UTF8_PATH');
          matches.push({
            path: event.data.path.text.replaceAll('\\', '/'), line: event.data.line_number,
            excerpt: (event.data.lines.text ?? '').trimEnd().slice(0, 320),
            admission: 'LEXICAL_DISCOVERY_ONLY',
          });
          if (matches.length >= limit) { truncated = true; child.kill(); break; }
        } catch { error = 'INVALID_RG_JSON_EVENT'; child.kill(); break; }
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(0, 500); });
    child.on('error', (cause) => { error = cause.code ?? cause.message; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (error || (!truncated && code !== 0 && code !== 1)) {
        resolve({ status: 'SEARCH_FAILED', matches, truncated: true, error: error ?? (stderr || `RG_EXIT_${code}`) });
      } else resolve({ status: matches.length ? 'BOUNDED_MATCHES' : 'NO_MATCHES', matches, truncated });
    });
  });
}

function discoveryCandidates(root, roots, query, includeUntracked) {
  if (!roots.length) return [];
  const paths = new Set();
  const staged = git(root, ['ls-files', '--stage', '-z', '--', ...roots]);
  for (const record of staged.split('\0').filter(Boolean)) {
    if (!/^(100644|100755) /.test(record)) continue;
    const separator = record.indexOf('\t');
    if (separator < 0) throw new Error('INVALID_GIT_INVENTORY');
    const relativePath = record.slice(separator + 1);
    if (isDiscoveryCandidate(relativePath)) paths.add(relativePath);
  }
  if (includeUntracked) {
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...roots]);
    for (const relativePath of untracked.split('\0').filter(Boolean)) {
      if (isDiscoveryCandidate(relativePath)) paths.add(relativePath);
    }
  }
  const terms = query.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 3);
  const score = (relativePath) => terms.filter((term) => relativePath.toLowerCase().includes(term)).length;
  return [...paths].sort((left, right) => score(right) - score(left) || ordered(left, right));
}

async function searchSourceBatches(root, candidates, query, limit) {
  const deadline = Date.now() + 10000;
  const matches = [];
  const parentPaths = new Map();
  const canonicalRoot = realpathSync(root);
  let offset = 0;
  let unavailableFiles = 0;
  let oversizedFiles = 0;
  while (offset < candidates.length) {
    if (Date.now() >= deadline) return { status: 'SEARCH_FAILED', matches, truncated: true, error: 'RG_TIMEOUT', unavailableFiles };
    const batch = [];
    let argumentBytes = 0;
    while (offset < candidates.length && argumentBytes < 40000) {
      const relativePath = candidates[offset++];
      const target = path.join(canonicalRoot, relativePath);
      try {
        const stat = lstatSync(target);
        if (!stat.isFile()) { unavailableFiles++; continue; }
        if (stat.size > 2 * 1024 * 1024) { oversizedFiles++; continue; }
        const parent = path.dirname(target);
        if (!parentPaths.has(parent)) {
          const actualParent = realpathSync(parent);
          const relative = path.relative(canonicalRoot, actualParent);
          parentPaths.set(parent, relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        }
        if (!parentPaths.get(parent)) { unavailableFiles++; continue; }
      } catch (error) {
        if (error.code === 'ENOENT') { unavailableFiles++; continue; }
        throw error;
      }
      batch.push(relativePath);
      argumentBytes += relativePath.length * 2 + 6;
    }
    const result = await searchPaths(root, batch, query, limit - matches.length, [], Math.max(1, deadline - Date.now()));
    matches.push(...result.matches);
    if (result.status === 'SEARCH_FAILED') return { ...result, matches, unavailableFiles, oversizedFiles };
    if (matches.length >= limit) return { status: 'BOUNDED_MATCHES', matches, truncated: true, unavailableFiles, oversizedFiles };
  }
  return { status: matches.length ? 'BOUNDED_MATCHES' : 'NO_MATCHES', matches, truncated: false, unavailableFiles, oversizedFiles };
}

export async function searchDailySources(root, { query, limit = 20, owner, receipt, includeUntracked = false } = {}) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 256 || query.includes('\0')) {
    throw new Error('QUERY_MUST_BE_2_TO_256_CHARACTERS');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('LIMIT_MUST_BE_1_TO_100');
  const selected = [];
  if (owner) {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(owner)) throw new Error('INVALID_OPENSPEC_OWNER');
    const ledger = `openspec/changes/${owner}/tasks.md`;
    resolveDiscoveryPath(root, ledger);
    selected.push(ledger);
  }
  if (receipt) {
    if (!/^docs\/reports\/.+\.(json|jsonl|md|txt)$/.test(receipt)) throw new Error('RECEIPT_MUST_BE_EXACT_REPORT_PATH');
    const target = resolveDiscoveryPath(root, receipt);
    if (!lstatSync(target).isFile()) throw new Error('RECEIPT_MUST_BE_FILE');
    selected.push(receipt);
  }
  selected.push(...DISCOVERY_GUIDES.filter((candidate) => optionalPath(root, candidate)));
  for (const relativePath of selected) {
    const stat = lstatSync(path.join(root, relativePath));
    if (!stat.isFile()) throw new Error('SELECTED_EVIDENCE_MUST_BE_REGULAR_FILE');
    if (stat.size > 2 * 1024 * 1024) {
      throw new Error(`SELECTED_EVIDENCE_EXCEEDS_2_MIB: ${relativePath}`);
    }
  }
  const roots = DISCOVERY_ROOTS.filter((candidate) => optionalPath(root, candidate));
  const evidence = await searchPaths(root, selected, query, limit, []);
  if (evidence.status === 'SEARCH_FAILED') return {
    ...evidence, query, limit, scope: { roots, selected, maxFileBytes: 2 * 1024 * 1024, maxMatchesPerFile: 5 },
    failureStage: 'SELECTED_EVIDENCE_SEARCH', scopeIsExhaustive: false,
  };
  const candidates = evidence.matches.length < limit ? discoveryCandidates(root, roots, query, includeUntracked) : [];
  const candidateBudget = 250;
  const sources = evidence.matches.length < limit
    ? await searchSourceBatches(root, candidates.slice(0, candidateBudget), query, limit - evidence.matches.length)
    : { status: 'BOUNDED_MATCHES', matches: [], truncated: true };
  return {
    status: sources.status === 'SEARCH_FAILED' ? 'SEARCH_FAILED'
      : evidence.matches.length + sources.matches.length ? 'BOUNDED_MATCHES' : 'NO_MATCHES',
    query, limit, matches: [...evidence.matches, ...sources.matches],
    truncated: evidence.truncated || sources.truncated || candidates.length > candidateBudget,
    error: sources.error ?? null,
    scope: { roots, selected, maxFileBytes: 2 * 1024 * 1024, maxMatchesPerFile: 5,
      sourceCandidateCount: evidence.matches.length < limit ? candidates.length : null, maxSourceFiles: candidateBudget,
      unavailableSourceFiles: sources.unavailableFiles ?? null,
      oversizedSourceFiles: sources.oversizedFiles ?? null,
      discoveryBasis: includeUntracked ? 'GIT_TRACKED_AND_NONIGNORED_UNTRACKED_SOURCE_FILES' : 'GIT_TRACKED_SOURCE_FILES',
      resultOrder: 'EXPLICIT_EVIDENCE_THEN_FILENAME_HINT_BATCHES_THEN_PATH_LINE', exclusions: SOURCE_EXCLUSIONS },
    scopeIsExhaustive: false, rankingOwner: 'SearchRuntime; lexical discovery creates no retrieval vote',
  };
}
