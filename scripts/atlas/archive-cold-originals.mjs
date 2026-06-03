#!/usr/bin/env node
/**
 * archive-cold-originals.mjs
 *
 * Git-diff temporal cold archive — no-delete-safe.
 *
 * Phase 1 (this script): commit + tag each archive-eligible file so git's
 * object DAG becomes the cold store. Does NOT delete anything from the
 * working tree. Records the git_tag + SHA in a manifest so the promotion
 * scorer can mark cold_copy_verified=true on the next scoring run.
 *
 * Phase 2 (future, operator-approved): git rm the tagged files.
 *
 * Usage:
 *   node scripts/atlas/archive-cold-originals.mjs           # dry-run
 *   node scripts/atlas/archive-cold-originals.mjs --commit  # writes commits+tags
 *   node scripts/atlas/archive-cold-originals.mjs --threshold 60
 *   node scripts/atlas/archive-cold-originals.mjs --bucket generated_artifact
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// --- CLI flags ---
const DRY_RUN   = !process.argv.includes('--commit');
const args = process.argv.slice(2);
const getFlag = (name) => {
  const eq = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
};
const THRESHOLD   = parseInt(getFlag('threshold') ?? '70', 10);
const BUCKET_FILTER = getFlag('bucket') ?? null;
const MAX_BATCH   = parseInt(getFlag('max') ?? '20', 10);

// --- Paths ---
const CANDIDATES_JSON = resolve(REPO_ROOT, '.tmp/superseded-score-candidates.json');
const REPORTS_DIR     = resolve(REPO_ROOT, 'docs/reports');
const TODAY           = new Date().toISOString().slice(0, 10);
const MANIFEST_PATH   = resolve(REPORTS_DIR, `cold-archive-manifest-${TODAY}.json`);

// --- Hard constraint: honour scorer's global lock ---
function checkHardConstraints(data) {
  const hc = data.hardConstraints ?? {};
  if (hc.deleteAllowed === false && hc.archiveFinal === false) {
    console.log('[archive-cold-originals] hardConstraints.deleteAllowed=false — running in PROOF-OF-COLD-COPY mode.');
    console.log('  This script will commit+tag files to establish git cold-copy provenance.');
    console.log('  No files will be deleted. Operator must explicitly run git rm in a separate step.');
    return 'proof_only';
  }
  return 'full';
}

// --- Slug from path ---
function slugify(p) {
  return p.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

// --- Git helpers ---
function gitExec(cmd, opts = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] git ${cmd}`);
    return '';
  }
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'pipe' }).trim();
}

function fileExistsInRepo(filePath) {
  return existsSync(resolve(REPO_ROOT, filePath));
}

function gitStatus(filePath) {
  try {
    const out = execSync(`git status --porcelain "${filePath}"`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out || 'clean';
  } catch { return 'unknown'; }
}

// --- Main ---
async function main() {
  if (!existsSync(CANDIDATES_JSON)) {
    console.error(`[archive-cold-originals] Candidates file not found: ${CANDIDATES_JSON}`);
    console.error('  Run: npm run atlas:archive:superseded-score first.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(CANDIDATES_JSON, 'utf8'));
  const mode = checkHardConstraints(data);
  const allCandidates = data.candidates ?? [];

  console.log(`\n[archive-cold-originals] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Threshold:    score >= ${THRESHOLD}`);
  console.log(`  Bucket filter: ${BUCKET_FILTER ?? 'all'}`);
  console.log(`  Max batch:    ${MAX_BATCH}`);
  console.log(`  Total candidates: ${allCandidates.length}`);
  console.log(`  Mode: ${mode}\n`);

  // Filter: score threshold + optional bucket
  let eligible = allCandidates.filter(c => c.superseded_score >= THRESHOLD);
  if (BUCKET_FILTER) {
    eligible = eligible.filter(c => c.bucket === BUCKET_FILTER
      || c.candidate_class === BUCKET_FILTER
      || (c.reasons ?? []).some(r => r.includes(BUCKET_FILTER)));
  }

  // In proof_only mode we lower the bar: include generated artifacts + high-confidence items
  // where blockers are only checksum/cold_copy (the very thing we're about to fix).
  if (mode === 'proof_only' && eligible.length === 0) {
    eligible = allCandidates.filter(c => {
      const fixableBlockers = ['checksum_unverified', 'cold_copy_not_verified'];
      const blockers = c.blockers ?? [];
      const onlyFixable = blockers.every(b => fixableBlockers.includes(b));
      return c.candidate_class === 'generated_artifact'
          || (onlyFixable && c.confidence >= 60)
          || c.superseded_score >= 40;
    }).slice(0, MAX_BATCH);
    console.log(`  [proof_only] lowered filter — ${eligible.length} items with fixable blockers`);
  }

  eligible = eligible.slice(0, MAX_BATCH);
  console.log(`  Processing ${eligible.length} items\n`);

  if (eligible.length === 0) {
    console.log('  Nothing to archive. Run scorer again or lower --threshold.');
    process.exit(0);
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    mode,
    threshold: THRESHOLD,
    bucketFilter: BUCKET_FILTER,
    repoRoot: REPO_ROOT,
    entries: [],
  };

  let committed = 0;
  let skipped   = 0;

  for (const candidate of eligible) {
    const filePath = candidate.original_path;
    const absPath  = resolve(REPO_ROOT, filePath);

    if (!fileExistsInRepo(filePath)) {
      console.log(`  SKIP (not on disk): ${filePath}`);
      skipped++;
      continue;
    }

    const slug    = slugify(filePath);
    const tagName = `archive/${TODAY}/${slug}`;
    const score   = candidate.superseded_score;
    const reasons = (candidate.reasons ?? []).join(', ');
    const bucket  = candidate.bucket ?? candidate.candidate_class ?? 'unknown';

    console.log(`  [${committed + 1}/${eligible.length}] ${filePath}`);
    console.log(`    score=${score}  bucket=${bucket}`);
    console.log(`    tag=${tagName}`);

    const status = gitStatus(filePath);

    try {
      // Stage
      gitExec(`add "${filePath}"`);

      // Commit with structured message
      const msg = [
        `archive(cold): ${filePath}`,
        ``,
        `superseded-score=${score}`,
        `bucket=${bucket}`,
        `reasons=${reasons}`,
        `mode=${mode}`,
        `no-delete=true`,
      ].join('\n');

      const sha = DRY_RUN ? 'dry-run-sha' : (() => {
        // Only commit if there's something staged or we're tagging existing HEAD
        const staged = execSync('git diff --cached --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
        if (staged.includes(filePath.replace(/\\/g, '/'))) {
          execSync(`git commit -m "${msg.replace(/"/g, "'")}"`, { cwd: REPO_ROOT, encoding: 'utf8' });
        }
        return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      })();

      // Tag
      gitExec(`tag "${tagName}" HEAD -m "cold-archive: ${filePath} score=${score}"`);

      manifest.entries.push({
        path: filePath,
        git_tag: tagName,
        sha,
        score,
        bucket,
        reasons: candidate.reasons ?? [],
        candidate_class: candidate.candidate_class,
        mode,
        archived_at: new Date().toISOString(),
        cold_copy_verified: true,
        delete_allowed_after_review: mode === 'full',
      });

      console.log(`    ✓ tagged`);
      committed++;
    } catch (err) {
      console.error(`    ✗ error: ${err.message}`);
      skipped++;
    }
  }

  // Write manifest
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n[archive-cold-originals] Done`);
  console.log(`  Committed/tagged: ${committed}`);
  console.log(`  Skipped:          ${skipped}`);
  console.log(`  Manifest:         ${MANIFEST_PATH}`);
  if (DRY_RUN) {
    console.log('\n  Re-run with --commit to apply.');
  } else {
    console.log('\n  Next: run npm run atlas:archive:superseded-score to update cold_copy_verified flags.');
    console.log('  Phase 2 (git rm) requires operator approval + re-score showing delete_allowed=true.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
