#!/usr/bin/env node
/**
 * audit-backup-superseded-inventory-v1.mjs
 *
 * Read-only P0 inventory of backup / legacy / deprecated / superseded files.
 * Text-search results are review leads only; this script never authorizes
 * archival/deletion and never modifies source files.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const OUT_RELATIVE_PATH = path.join('.tmp', 'review', 'backup-superseded-inventory-v2.json');
const OUT_PATH = path.join(REPO_ROOT, OUT_RELATIVE_PATH);
const ROOTS = ['services', 'python', 'sveltekit-frontend/src', 'scripts'];
const NAME_RE = /(backup|legacy|deprecated|superseded|\.bak$|\.old$)/i;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

import { createHash } from 'node:crypto';

const ls = spawnSync('git', ['ls-files', ...ROOTS], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (ls.status !== 0) {
  console.error(ls.stderr);
  process.exit(1);
}

const candidates = ls.stdout
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && NAME_RE.test(s));

// Search all tracked text files in one Git scan, then map exact matched terms
// by reading each returned file once. This avoids one full-repository scan per
// candidate while retaining the exact term-to-file relationship.
const patterns = [...new Set(candidates.flatMap((relPath) => [
  path.basename(relPath).replace(/\.[^.]+$/, ''),
  path.basename(relPath),
  relPath,
]))].filter(Boolean);
const grepArgs = ['grep', '-I', '-l', '-F'];
for (const pattern of patterns) grepArgs.push('-e', pattern);
grepArgs.push('--');
const trackedTextSearch = spawnSync('git', grepArgs, {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 64 * 1024 * 1024,
});
const referencePaths = new Map(candidates.map((relPath) => [relPath, new Set()]));
if (trackedTextSearch.status === 0) {
  for (const matchedPath of trackedTextSearch.stdout.split(/\r?\n/).filter(Boolean)) {
    const normalizedMatchedPath = matchedPath.replace(/\\/g, '/');
    let content;
    try { content = fs.readFileSync(path.join(REPO_ROOT, matchedPath), 'utf8'); }
    catch { continue; }
    for (const relPath of candidates) {
      if (normalizedMatchedPath === relPath.replace(/\\/g, '/')) continue;
      const candidatePatterns = [
        path.basename(relPath).replace(/\.[^.]+$/, ''),
        path.basename(relPath),
        relPath,
      ];
      if (candidatePatterns.some((pattern) => pattern && content.includes(pattern))) {
        referencePaths.get(relPath).add(normalizedMatchedPath);
      }
    }
  }
}
const referenceSearchAvailable = trackedTextSearch.status === 0 || trackedTextSearch.status === 1;

const inventory = [];
for (const relPath of candidates) {
  const stem = path.basename(relPath).replace(/\.[^.]+$/, '');
  const refs = [...referencePaths.get(relPath)];
  const absolutePath = path.join(REPO_ROOT, relPath);
  let fileEvidence;
  try {
    const stat = fs.statSync(absolutePath);
    const bytes = fs.readFileSync(absolutePath);
    fileEvidence = { presentInCheckout: true, byteLength: stat.size, sha256: sha256(bytes) };
  } catch {
    fileEvidence = { presentInCheckout: false, byteLength: null, sha256: null };
  }

  inventory.push({
    path: relPath,
    stem,
    ...fileEvidence,
    trackedTextReferenceCount: refs.length,
    sampleRefs: refs.slice(0, 5),
    disposition: !referenceSearchAvailable
      ? 'REFERENCE_SEARCH_FAILED_REVIEW_REQUIRED'
      : !fileEvidence.presentInCheckout
      ? 'MISSING_FROM_CHECKOUT_REVIEW_REQUIRED'
      : refs.length > 0
        ? 'TEXT_REFERENCES_FOUND_RETAIN_PENDING_REVIEW'
        : 'NO_TRACKED_TEXT_REFERENCE_FOUND_REVIEW_REQUIRED',
  });
}

const report = {
  schema: 'atlas.backup-superseded-inventory.v2',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  reportArtifactWritten: true,
  sourceMutationPerformed: false,
  scanScope: { trackedFiles: true, textSearch: 'single git grep -I -l -F pass, exact terms remapped by reading each hit once', candidateRoots: ROOTS },
  limitation: 'A missing filename-stem text reference does not prove the file is unused. Imports, dynamic loading, Docker mounts, model registries, generated manifests, OpenSpec evidence, external callers, and rollback dependencies require separate review. No item is authorized for archival or deletion.',
  totalCandidatesFound: candidates.length,
  auditedCount: inventory.length,
  textReferencesFound: inventory.filter((x) => x.disposition === 'TEXT_REFERENCES_FOUND_RETAIN_PENDING_REVIEW').length,
  noTrackedTextReferenceFound: inventory.filter((x) => x.disposition === 'NO_TRACKED_TEXT_REFERENCE_FOUND_REVIEW_REQUIRED').length,
  unresolvedReviewCount: inventory.length,
  items: inventory,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      totalCandidatesFound: report.totalCandidatesFound,
      auditedCount: report.auditedCount,
      textReferencesFound: report.textReferencesFound,
      noTrackedTextReferenceFound: report.noTrackedTextReferenceFound,
      unresolvedReviewCount: report.unresolvedReviewCount,
      reportPath: OUT_RELATIVE_PATH.replace(/\\/g, '/'),
    },
    null,
    2
  )
);
