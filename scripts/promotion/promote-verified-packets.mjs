#!/usr/bin/env node
/**
 * promote-verified-packets.mjs
 *
 * Promotion boundary — Phase 101 Block 2.
 *
 * Reads the cold-archive manifest and superseded-score candidates, finds
 * items that have been git-tagged (cold_copy_verified=true) and therefore
 * satisfy the promotion gate. Updates the promotion-queue manifest to
 * record their new tier.
 *
 * Does NOT delete files. Does NOT write to Postgres directly (that is a
 * future sidecar step once the sveltekit server is running).
 *
 * Gate rules:
 *   - cold_copy_verified = true  (git tag exists in cold-archive manifest)
 *   - superseded_score >= PROMOTE_THRESHOLD  OR  candidate_class = generated_artifact
 *   - not in hardConstraints.deleteAllowed=false  (still kept, just logged)
 *
 * Usage:
 *   node scripts/promotion/promote-verified-packets.mjs           # dry-run
 *   node scripts/promotion/promote-verified-packets.mjs --commit  # writes manifest
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const DRY_RUN         = !process.argv.includes('--commit');
const PROMOTE_THRESHOLD = parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] ?? '40', 10);
const TODAY           = new Date().toISOString().slice(0, 10);

const CANDIDATES_JSON  = resolve(ROOT, '.tmp/superseded-score-candidates.json');
const MANIFEST_GLOB    = resolve(ROOT, `docs/reports/cold-archive-manifest-${TODAY}.json`);
const PROMOTION_MANIFEST = resolve(__dirname, 'promotion-queue.manifest.json');
const TMP_DIR          = resolve(ROOT, '.tmp');
const OUT_JSON         = resolve(TMP_DIR, 'promote-verified-packets.json');
const OUT_MD           = resolve(TMP_DIR, 'promote-verified-packets.md');

function readJson(p, fallback = null) {
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

async function main() {
  console.log(`\n[promote-verified-packets] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Threshold: score >= ${PROMOTE_THRESHOLD}\n`);

  const candidates = readJson(CANDIDATES_JSON);
  if (!candidates) {
    console.error(`  Candidates not found: ${CANDIDATES_JSON}`);
    console.error('  Run: npm run atlas:archive:superseded-score first.');
    process.exit(1);
  }

  // Load cold-archive manifest (may not exist if cold archive hasn't run yet)
  const coldManifest = readJson(MANIFEST_GLOB, { entries: [] });
  const taggedPaths  = new Set(coldManifest.entries.map(e => e.path));
  console.log(`  Cold-tagged paths: ${taggedPaths.size}`);

  // Load existing promotion manifest
  const promoManifest = readJson(PROMOTION_MANIFEST, {
    schemaVersion: '1.0',
    updatedAt: null,
    promotedItems: [],
    pendingItems: [],
    blockedItems: [],
  });

  const allCandidates = candidates.candidates ?? [];
  const promoted = [];
  const pending  = [];
  const blocked  = [];

  for (const c of allCandidates) {
    const isTagged    = taggedPaths.has(c.original_path);
    const meetsScore  = c.superseded_score >= PROMOTE_THRESHOLD;
    const isGenerated = c.candidate_class === 'generated_artifact';
    const hardBlocked = candidates.hardConstraints?.deleteAllowed === false;

    if (isTagged && (meetsScore || isGenerated)) {
      promoted.push({
        path: c.original_path,
        sourceRef: c.sourceRef,
        score: c.superseded_score,
        bucket: c.bucket,
        candidate_class: c.candidate_class,
        cold_copy_verified: true,
        tier: 'warm',
        promoted_at: new Date().toISOString(),
        delete_allowed: !hardBlocked,
        git_tag: coldManifest.entries.find(e => e.path === c.original_path)?.git_tag ?? null,
      });
    } else if (isTagged && !meetsScore) {
      pending.push({ path: c.original_path, score: c.superseded_score, reason: 'score_below_threshold', cold_copy_verified: true });
    } else if (!isTagged && (meetsScore || isGenerated)) {
      pending.push({ path: c.original_path, score: c.superseded_score, reason: 'cold_copy_not_yet_tagged', cold_copy_verified: false });
    } else {
      // Only record items with some signal to keep output manageable
      if (c.superseded_score > 0 || isGenerated) {
        blocked.push({ path: c.original_path, score: c.superseded_score, reasons: c.blockers ?? [] });
      }
    }
  }

  console.log(`  Promoted (gate passed):  ${promoted.length}`);
  console.log(`  Pending  (partial gate): ${pending.length}`);
  console.log(`  Blocked  (score>0):      ${blocked.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    threshold: PROMOTE_THRESHOLD,
    totalCandidates: allCandidates.length,
    coldTaggedPaths: taggedPaths.size,
    promoted,
    pending: pending.slice(0, 100),
    blocked: blocked.slice(0, 50),
    hardConstraints: candidates.hardConstraints,
  };

  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const md = [
    `# Promote Verified Packets — ${TODAY}`,
    ``,
    `**Mode:** ${DRY_RUN ? 'Dry run' : 'Committed'}  `,
    `**Threshold:** score >= ${PROMOTE_THRESHOLD}  `,
    `**Generated:** ${report.generatedAt}`,
    ``,
    `## Summary`,
    `| Bucket | Count |`,
    `|---|---|`,
    `| Promoted (gate passed) | ${promoted.length} |`,
    `| Pending (partial gate) | ${pending.length} |`,
    `| Blocked (score > 0)    | ${blocked.length} |`,
    `| Total candidates       | allCandidates.length |`,
    ``,
    `## Hard Constraints`,
    `\`\`\`json`,
    JSON.stringify(candidates.hardConstraints, null, 2),
    `\`\`\``,
    ``,
    promoted.length > 0 ? [
      `## Promoted Items (${promoted.length})`,
      ...promoted.slice(0, 20).map(p => `- \`${p.path}\`  score=${p.score}  tag=\`${p.git_tag ?? 'none'}\``),
      promoted.length > 20 ? `\n_...and ${promoted.length - 20} more. See ${OUT_JSON}_` : '',
    ].join('\n') : '## Promoted Items\n_None — run `npm run atlas:archive:cold` first to create cold-copy tags._',
  ].join('\n');

  writeFileSync(OUT_MD, md);

  if (!DRY_RUN && !candidates.hardConstraints?.archiveFinal) {
    // Update promotion manifest with promoted items
    promoManifest.updatedAt = new Date().toISOString();
    promoManifest.promotedItems = [
      ...(promoManifest.promotedItems ?? []).filter(e => !promoted.some(p => p.path === e.path)),
      ...promoted,
    ];
    writeFileSync(PROMOTION_MANIFEST, JSON.stringify(promoManifest, null, 2));
    console.log(`\n  Updated: ${PROMOTION_MANIFEST}`);
  }

  console.log(`  Report:  ${OUT_JSON}`);
  console.log(`  Report:  ${OUT_MD}`);
  if (DRY_RUN) console.log('\n  Re-run with --commit to write promotion manifest.');
}

main().catch(e => { console.error(e); process.exit(1); });
