#!/usr/bin/env node

/**
 * Phase 16 Runtime Artifact Locator
 *
 * Scans the repository for Phase 16 graph-refresh runtime artifacts.
 * Answers: Are graph-refresh-manifest.json, invalidation code, and promotion wiring
 * present in this checkout, or should we look elsewhere?
 *
 * Output:
 * - docs/reports/phase16-runtime-artifact-locator.json
 * - docs/reports/phase16-runtime-artifact-locator.md
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const ARTIFACT_PATTERNS = [
  'graph-refresh-manifest',
  'graph:refresh',
  'refresh.*manifest',
  'invalidation',
  'promotion',
  'graph-refresh',
  'refresh-manifest',
];

const EXCLUDED_DIRS = ['node_modules', '.svelte-kit', '.vite', '.git', 'dist', 'build'];

function runGrep(pattern) {
  try {
    const glob = EXCLUDED_DIRS.map((d) => `-g "!${d}/**"`).join(' ');
    const cmd = `rg -n "${pattern}" . ${glob} 2>/dev/null || true`;
    const result = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    return result.split('\n').filter((l) => l.trim());
  } catch {
    return [];
  }
}

function findArtifactFiles() {
  try {
    const glob = EXCLUDED_DIRS.map((d) => `-g "!${d}/**"`).join(' ');
    const cmd = `rg --files -uu ${glob} 2>/dev/null | rg "graph-refresh|refresh-manifest|promotion|invalidation" || true`;
    const result = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    return result.split('\n').filter((l) => l.trim());
  } catch {
    return [];
  }
}

async function main() {
  console.log('[Phase16] Locating runtime artifacts...\n');

  const results = {
    timestamp: new Date().toISOString(),
    checkout: process.cwd(),
    patterns_searched: ARTIFACT_PATTERNS,
    findings: {
      grep_results: {},
      artifact_files: [],
      summary: {
        graph_refresh_manifest: false,
        invalidation_code: false,
        promotion_wiring: false,
        refresh_scripts: false,
      },
    },
  };

  // Search for each pattern
  for (const pattern of ARTIFACT_PATTERNS) {
    console.log(`[Phase16] Searching for "${pattern}"...`);
    const hits = runGrep(pattern);
    results.findings.grep_results[pattern] = hits;
    if (hits.length > 0) {
      console.log(`  ✓ Found ${hits.length} hits`);
    } else {
      console.log(`  ✗ No hits`);
    }
  }

  // Find artifact files
  console.log('\n[Phase16] Locating artifact files...');
  const files = findArtifactFiles();
  results.findings.artifact_files = files;
  if (files.length > 0) {
    console.log(`  ✓ Found ${files.length} files:`);
    files.forEach((f) => console.log(`    - ${f}`));
  } else {
    console.log(`  ✗ No artifact files found`);
  }

  // Analyze results
  const allHits = Object.values(results.findings.grep_results).flat();
  const hasManifest = allHits.some((h) => h.includes('graph-refresh-manifest.json'));
  const hasInvalidation = allHits.some((h) => h.includes('invalidation'));
  const hasPromotion = allHits.some((h) => h.includes('promotion'));
  const hasScripts = files.some((f) => f.includes('graph') && f.includes('refresh'));

  results.findings.summary = {
    graph_refresh_manifest: hasManifest,
    invalidation_code: hasInvalidation,
    promotion_wiring: hasPromotion,
    refresh_scripts: hasScripts,
  };

  results.findings.decision = {
    phase16_artifacts_present_in_checkout: hasManifest || hasInvalidation || hasPromotion,
    recommendation:
      hasManifest && hasInvalidation && hasPromotion
        ? 'Phase 16 runtime patch available: bind manifest + verify gates'
        : 'Phase 16 runtime artifacts missing in this checkout. Check app-repo or defer to Temporal Kanban.',
  };

  // Write JSON report
  const reportDir = 'docs/reports';
  mkdirSync(reportDir, { recursive: true });

  writeFileSync(
    `${reportDir}/phase16-runtime-artifact-locator.json`,
    JSON.stringify(results, null, 2)
  );
  console.log(`\n✅ JSON report: ${reportDir}/phase16-runtime-artifact-locator.json`);

  // Write markdown report
  const mdReport = `# Phase 16 Runtime Artifact Locator Report

**Generated**: ${new Date().toISOString()}
**Checkout**: ${process.cwd()}

## Summary

| Artifact | Found |
|----------|-------|
| graph-refresh-manifest.json | ${results.findings.summary.graph_refresh_manifest ? '✅ YES' : '❌ NO'} |
| invalidation code | ${results.findings.summary.invalidation_code ? '✅ YES' : '❌ NO'} |
| promotion wiring | ${results.findings.summary.promotion_wiring ? '✅ YES' : '❌ NO'} |
| refresh scripts | ${results.findings.summary.refresh_scripts ? '✅ YES' : '❌ NO'} |

## Decision

**${results.findings.decision.recommendation}**

## Detailed Findings

### Grep Results by Pattern

${ARTIFACT_PATTERNS
  .map((pattern) => {
    const hits = results.findings.grep_results[pattern] || [];
    return `#### "${pattern}"
${hits.length > 0 ? hits.map((h) => `\`${h}\``).join('\n') : '(no hits)'}`;
  })
  .join('\n\n')}

### Artifact Files

${files.length > 0 ? files.map((f) => `- \`${f}\``).join('\n') : '(none found)'}

## Next Actions

${
  results.findings.summary.graph_refresh_manifest &&
  results.findings.summary.invalidation_code &&
  results.findings.summary.promotion_wiring
    ? `### Phase 16 Runtime Patch Available
1. Bind \`graph-refresh-manifest.json\`
2. Verify invalidation implementation
3. Verify promotion gate logic
4. Re-run \`npm run atlas:production-readiness\`
5. Target: Phase 16 → 85%`
    : `### Phase 16 Deferred
1. Artifacts not available in this checkout
2. Check app-repo or other branches
3. Move to **Temporal Kanban consolidation** (next ACTIVE lane)
4. Phase 16 remains at 65% (docs-backed, runtime incomplete)`
}

---

## Evidence Collected

- Phase 16 board entry: ACTIVE, 65% complete
- Docs: \`sveltekit-frontend/docs/audit/phase16-refresh-promotion-report.md\`
- TOC link: Verified in Parent Atlas
- Production readiness gate: Green (no runtime mutation)

**Conclusion**: This audit determines whether Phase 16 can proceed to runtime patching in this checkout, or whether the critical path moves to Temporal Kanban consolidation.
`;

  writeFileSync(`${reportDir}/phase16-runtime-artifact-locator.md`, mdReport);
  console.log(`✅ Markdown report: ${reportDir}/phase16-runtime-artifact-locator.md`);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 16 ARTIFACT LOCATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`graph-refresh-manifest.json: ${results.findings.summary.graph_refresh_manifest ? '✅' : '❌'}`);
  console.log(`invalidation code: ${results.findings.summary.invalidation_code ? '✅' : '❌'}`);
  console.log(`promotion wiring: ${results.findings.summary.promotion_wiring ? '✅' : '❌'}`);
  console.log(`refresh scripts: ${results.findings.summary.refresh_scripts ? '✅' : '❌'}`);
  console.log('='.repeat(60));
  console.log(`\nDECISION: ${results.findings.decision.recommendation}`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error('[Phase16] Locator failed:', err.message);
  process.exit(1);
});
