#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

async function main() {
  console.log('\n=== Aggregating Verification Verdict ===\n');

  const tmpDir = path.join(ROOT, '.tmp');
  const reportsDir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const verdict = {
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    lanes: {},
    proofs: {},
  };

  // 1. Load Lane reports
  const laneFiles = {
    smoke: path.join(tmpDir, 'verify-smoke.json'),
    story: path.join(tmpDir, 'verify-story.json'),
    atlas: path.join(tmpDir, 'verify-atlas.json'),
    cubic: path.join(tmpDir, 'verify-cubic.json'),
  };

  let hasFailures = false;
  let hasPartials = false;

  for (const [lane, file] of Object.entries(laneFiles)) {
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        verdict.lanes[lane] = { status: data.status, timestamp: data.timestamp, checks: data.checks };
        if (data.status === 'FAIL') hasFailures = true;
        if (data.status === 'PARTIAL') hasPartials = true;
        console.log(`  Lane [${lane.toUpperCase()}]: ${data.status === 'PASS' ? '✅' : (data.status === 'PARTIAL' ? '⚠️' : '❌')} ${data.status}`);
      } catch (err) {
        hasFailures = true;
        verdict.lanes[lane] = { status: 'FAIL', error: `Failed to parse: ${err.message}` };
        console.log(`  Lane [${lane.toUpperCase()}]: ❌ FAIL (parse error: ${err.message})`);
      }
    } else {
      hasFailures = true;
      verdict.lanes[lane] = { status: 'FAIL', error: 'Report file missing' };
      console.log(`  Lane [${lane.toUpperCase()}]: ❌ FAIL (missing report file)`);
    }
  }

  // 2. Load Replay Trace report
  const replayFile = path.join(reportsDir, 'replay-trace-summary.json');
  if (existsSync(replayFile)) {
    try {
      const data = JSON.parse(readFileSync(replayFile, 'utf8'));
      verdict.proofs.replay = {
        status: data.status,
        queryCount: data.queryCount,
        cacheHitPct: data.cacheHitPct,
        pointFoundPct: data.qdrantHitPct,
      };
      if (data.status !== 'PASS') hasFailures = true;
      console.log(`  Proof [REPLAY]: ${data.status === 'PASS' ? '✅' : '❌'} ${data.status} (cacheHitPct: ${data.cacheHitPct}%)`);
    } catch (err) {
      hasFailures = true;
      verdict.proofs.replay = { status: 'FAIL', error: err.message };
      console.log(`  Proof [REPLAY]: ❌ FAIL (parse error: ${err.message})`);
    }
  } else {
    // If not found, look inside sveltekit-frontend
    const altReplayFile = path.join(ROOT, 'sveltekit-frontend', 'docs', 'reports', 'replay-trace-summary.json');
    if (existsSync(altReplayFile)) {
      try {
        const data = JSON.parse(readFileSync(altReplayFile, 'utf8'));
        verdict.proofs.replay = {
          status: data.status,
          queryCount: data.queryCount,
          cacheHitPct: data.cacheHitPct,
          pointFoundPct: data.qdrantHitPct,
        };
        if (data.status !== 'PASS') hasFailures = true;
        console.log(`  Proof [REPLAY]: ${data.status === 'PASS' ? '✅' : '❌'} ${data.status} (cacheHitPct: ${data.cacheHitPct}%)`);
      } catch (err) {
        hasFailures = true;
        verdict.proofs.replay = { status: 'FAIL', error: err.message };
        console.log(`  Proof [REPLAY]: ❌ FAIL (parse error: ${err.message})`);
      }
    } else {
      hasFailures = true;
      verdict.proofs.replay = { status: 'FAIL', error: 'Report file missing' };
      console.log('  Proof [REPLAY]: ❌ FAIL (missing report file)');
    }
  }

  // 3. Load Qdrant Payload verification report
  const payloadFile = path.join(ROOT, 'sveltekit-frontend', 'docs', 'reports', 'qdrant-packet-payload-verify.json');
  if (existsSync(payloadFile)) {
    try {
      const data = JSON.parse(readFileSync(payloadFile, 'utf8'));
      verdict.proofs.qdrant_payload = {
        pointFoundCount: data.pointFoundCount,
        agreementCount: data.agreementCount,
        pointFoundPct: data.pointFoundPct,
        agreementPct: data.agreementPct,
      };
      const pass = data.pointFoundCount > 23 && data.agreementCount > 0;
      if (!pass) hasFailures = true;
      console.log(`  Proof [QDRANT]: ${pass ? '✅' : '❌'} ${pass ? 'PASS' : 'FAIL'} (found: ${data.pointFoundCount}/50, agreement: ${data.agreementCount})`);
    } catch (err) {
      hasFailures = true;
      verdict.proofs.qdrant_payload = { status: 'FAIL', error: err.message };
      console.log(`  Proof [QDRANT]: ❌ FAIL (parse error: ${err.message})`);
    }
  } else {
    hasFailures = true;
    verdict.proofs.qdrant_payload = { status: 'FAIL', error: 'Report file missing' };
    console.log('  Proof [QDRANT]: ❌ FAIL (missing report file)');
  }

  // Calculate overall verdict
  if (hasFailures) {
    verdict.verdict = 'FAIL';
  } else if (hasPartials) {
    verdict.verdict = 'PARTIAL';
  } else {
    verdict.verdict = 'PASS';
  }

  // Save verdict reports
  writeFileSync(path.join(reportsDir, 'verification-agent-summary.json'), JSON.stringify(verdict, null, 2));

  // Generate markdown report
  const md = `
# Parent Atlas Verification Agent Summary

Generated: ${verdict.timestamp}
Verdict: **${verdict.verdict}**

## Lane Verdicts
| Lane | Status | Details / Checks |
| --- | --- | --- |
| **Smoke Validation** | ${verdict.lanes.smoke?.status ?? 'FAIL'} | Scripts registered, Environment checked, Services pinged |
| **Feature Memory Story** | ${verdict.lanes.story?.status ?? 'FAIL'} | Key integration files present, Database schemas verified |
| **Parent Atlas Traversal** | ${verdict.lanes.atlas?.status ?? 'FAIL'} | Qdrant point payloads matched, Valkey keys scanned, Neo4j traversals read |
| **Cubic Adversarial Tests** | ${verdict.lanes.cubic?.status ?? 'FAIL'} | Empty parameters, nonexistent filters fallback path checks |

## Retrieval Proof Metrics
- **Replay Trace status**: ${verdict.proofs.replay?.status ?? 'FAIL'} (Queries: ${verdict.proofs.replay?.queryCount ?? 0}, Cache hit rate: ${verdict.proofs.replay?.cacheHitPct ?? 0}%)
- **Qdrant Payload agreement**: ${verdict.proofs.qdrant_payload?.pointFoundCount ?? 0}/50 found in Qdrant, ${verdict.proofs.qdrant_payload?.agreementCount ?? 0} points fully matching Postgres metadata.

## OpenCode Skill Contract (Mandatory Addendum)
- **likely_cause**: Mismatches between Qdrant payload keys and Postgres columns during whole-codebase indexing.
- **evidence**: \`scripts/atlas/verify-qdrant-packet-payload.mjs\`, \`upsert-qdrant-packet-payload.mjs\` and \`verify-qdrant-packet-payload.json\`.
- **patch_targets**: [\`scripts/atlas/verify-qdrant-packet-payload.mjs\`, \`sveltekit-frontend/scripts/atlas/verify-qdrant-packet-payload.mjs\`, \`scripts/atlas/upsert-qdrant-packet-payload.mjs\`, \`package.json\`]
- **safe_next_command**: "npm run verify:full"
- **smoke_command**: "npm run verify:full"
- **report_path**: "docs/reports/verification-agent-summary.json"
`;

  writeFileSync(path.join(reportsDir, 'verification-agent-summary.md'), md);
  console.log(`\nConsolidated verdict is: ${verdict.verdict}`);
  console.log('Summary reports saved to:');
  console.log('  - docs/reports/verification-agent-summary.json');
  console.log('  - docs/reports/verification-agent-summary.md');

  if (verdict.verdict === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
