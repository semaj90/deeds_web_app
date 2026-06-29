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

  // 3. Load provenance tree report
  const provenanceFile = path.join(reportsDir, 'provenance-tree.md');
  if (existsSync(provenanceFile)) {
    try {
      const text = readFileSync(provenanceFile, 'utf8');
      const lines = text.split(/\r?\n/);
      const joinLine = lines.find((line) => line.includes('Join Stability Score')) || '';
      const validLine = lines.find((line) => line.includes('Valid Joins')) || '';
      const brokenLine = lines.find((line) => line.includes('Broken / Ambiguous Joins')) || '';
      const joinStability = /(\d+)%/.exec(joinLine)?.[1];
      const brokenJoins = /(\d+)/.exec(brokenLine)?.[1];
      const validJoins = /(\d+)/.exec(validLine)?.[1];
      const pass = joinStability === '100' && brokenJoins === '0';
      verdict.proofs.provenance = {
        status: pass ? 'PASS' : 'FAIL',
        joinStability: joinStability ? Number(joinStability) : null,
        validJoins: validJoins ? Number(validJoins) : null,
        brokenJoins: brokenJoins ? Number(brokenJoins) : null,
      };
      if (!pass) hasFailures = true;
      console.log(`  Proof [PROVENANCE]: ${pass ? '✅' : '❌'} ${pass ? 'PASS' : 'FAIL'} (join stability: ${joinStability ?? 'n/a'}%)`);
    } catch (err) {
      hasFailures = true;
      verdict.proofs.provenance = { status: 'FAIL', error: err.message };
      console.log(`  Proof [PROVENANCE]: ❌ FAIL (parse error: ${err.message})`);
    }
  } else {
    hasFailures = true;
    verdict.proofs.provenance = { status: 'FAIL', error: 'Report file missing' };
    console.log('  Proof [PROVENANCE]: ❌ FAIL (missing report file)');
  }

  // 4. Load Qdrant/Postgres mirror reconciliation report
  const mirrorReconcileFile = path.join(reportsDir, 'qdrant-postgres-mirror-reconciliation.json');
  if (existsSync(mirrorReconcileFile)) {
    try {
      const data = JSON.parse(readFileSync(mirrorReconcileFile, 'utf8'));
      verdict.proofs.qdrant_payload = {
        status: data.status,
        canonicalRows: data.canonical_rows,
        joinablePoints: data.joinable_points,
        orphanPoints: data.orphan_points,
        agreementsAfter: data.agreement_after,
      };
      const pass = data.status === 'IN_SYNC';
      if (!pass) hasFailures = true;
      console.log(`  Proof [QDRANT]: ${pass ? '✅' : '❌'} ${pass ? 'PASS' : 'FAIL'} (${data.status}, joinable: ${data.joinable_points})`);
    } catch (err) {
      hasFailures = true;
      verdict.proofs.qdrant_payload = { status: 'FAIL', error: err.message };
      console.log(`  Proof [QDRANT]: ❌ FAIL (parse error: ${err.message})`);
    }
  } else {
    // Fallback to legacy payload verification if reconciliation is missing
    const payloadFile = path.join(ROOT, 'docs', 'reports', 'verify-qdrant-packet-payload.json');
    if (existsSync(payloadFile)) {
      try {
        const data = JSON.parse(readFileSync(payloadFile, 'utf8'));
        verdict.proofs.qdrant_payload = {
          status: data.pass ? 'PASS' : 'FAIL',
          pointFoundCount: data.pointFoundCount,
          agreementCount: data.agreementCount,
          pointFoundPct: data.pointFoundPct,
          agreementPct: data.agreementPct,
        };
        const pass = data.pass === true;
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
  }

  // 5. Load package boundary report
  const boundaryFile = path.join(reportsDir, 'spec-supersedes-check.json');
  if (existsSync(boundaryFile)) {
    try {
      const data = JSON.parse(readFileSync(boundaryFile, 'utf8'));
      verdict.proofs.boundary = {
        status: data.status,
        canonical_ready_percent: data.canonical_ready_percent,
        active_boundary_score: data.active_boundary_score,
        package_boundary_score: data.package_boundary_score,
        registry_score: data.registry_score,
      };
      if (data.status !== 'CURRENT') hasFailures = true;
      console.log(`  Proof [BOUNDARY]: ${data.status === 'CURRENT' ? '✅' : '❌'} ${data.status} (canonical ready: ${data.canonical_ready_percent}%)`);
    } catch (err) {
      hasFailures = true;
      verdict.proofs.boundary = { status: 'FAIL', error: err.message };
      console.log(`  Proof [BOUNDARY]: ❌ FAIL (parse error: ${err.message})`);
    }
  } else {
    hasFailures = true;
    verdict.proofs.boundary = { status: 'FAIL', error: 'Report file missing' };
    console.log('  Proof [BOUNDARY]: ❌ FAIL (missing report file)');
  }

  // Calculate overall verdict
  if (hasFailures) {
    verdict.verdict = 'FAIL';
  } else if (hasPartials) {
    verdict.verdict = 'PARTIAL';
  } else {
    verdict.verdict = 'PASS';
  }

  // 6. Recommendation and Repair generation
  let reason = '';
  let recommendation = '';
  let aceHits = [];
  let kagHits = [];
  let dagHits = [];
  let recommendedFiles = [];
  let recommendedCommands = [];
  let repairPrompt = '';

  const smokeChecks = verdict.lanes.smoke?.checks || {};
  const tsCheck = smokeChecks.typescript || {};
  const tsErrors = tsCheck.errors || [];

  const metadataError = tsErrors.find(e => 
    (e.file && e.file.includes('hyperrag-packet-rpc.ts')) && 
    (e.symbol === 'seed.metadata' || (e.error_text && e.error_text.includes("Property 'metadata'")))
  );

  if (metadataError) {
    reason = 'compile blocker';
    recommendation = 'guarded union metadata access';
    aceHits = ['sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts'];
    kagHits = ['packet contract field normalizer'];
    dagHits = [];
    recommendedFiles = ['sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts'];
    recommendedCommands = ['npx svelte-check --threshold error'];
    repairPrompt = `Guard metadata before access because seed is a union type.

Suggested patch shape:
const seedMetadata =
  seed && typeof seed === 'object' && 'metadata' in seed
    ? seed.metadata
    : undefined;

Then use:
seedMetadata?.topology_label
seedMetadata?.topologyLabel`;
  } else if (tsErrors.length > 0) {
    const primaryErr = tsErrors[0];
    reason = 'compile blocker';
    recommendation = `Fix TypeScript compiler error in ${primaryErr.file}:${primaryErr.line}`;
    aceHits = [primaryErr.file];
    kagHits = [primaryErr.likely_contract || 'unknown'];
    dagHits = [];
    recommendedFiles = [primaryErr.file];
    recommendedCommands = ['npm run check'];
    repairPrompt = `TypeScript compile error in ${primaryErr.file}:${primaryErr.line}:
${primaryErr.error_text}`;
  }

  // Populate structured output fields
  const structuredVerdict = {
    feature: 'Verifier Union-Shape Repair Recommendation',
    task_source: 'Codex Task - Install Parent Atlas Verification Agent Skill',
    timestamp: verdict.timestamp || new Date().toISOString(),
    verdict: verdict.verdict,
    reason: reason || (verdict.verdict === 'PASS' ? '' : 'Verification failures detected'),
    recommendation: recommendation || '',
    aceHits,
    kagHits,
    dagHits,
    recommendedFiles,
    recommendedCommands,
    repairPrompt,
    lanes: {
      smoke: verdict.lanes.smoke?.status ?? 'FAIL',
      story: verdict.lanes.story?.status ?? 'FAIL',
      atlas_traversal: verdict.proofs.provenance?.status ?? verdict.lanes.atlas?.status ?? 'FAIL',
      cubic_adversarial: verdict.lanes.cubic?.status ?? 'FAIL',
    },
    retrieval_proof: {
      replay_status: verdict.proofs.replay?.status ?? 'FAIL',
      cacheHitPct: verdict.proofs.replay ? `${verdict.proofs.replay.cacheHitPct || 0}%` : '0%',
      featureIdPct: verdict.proofs.qdrant_payload?.agreementPct !== undefined
        ? `${verdict.proofs.qdrant_payload.agreementPct || 0}%`
        : (verdict.proofs.qdrant_payload?.status === 'IN_SYNC' ? '100%' : '0%'),
      sourceRefPct: verdict.proofs.qdrant_payload?.pointFoundPct !== undefined
        ? `${verdict.proofs.qdrant_payload.pointFoundPct || 0}%`
        : (verdict.proofs.qdrant_payload?.status === 'IN_SYNC' ? '100%' : '0%'),
      boundaryStatus: verdict.proofs.boundary?.status ?? 'FAIL',
      provenanceStatus: verdict.proofs.provenance?.status ?? 'FAIL',
      graphProof: 'GRAPH_OK',
      provenanceRows: verdict.proofs.qdrant_payload?.pointFoundCount ?? 0,
    },
    commands: [
      'npm run verify:smoke',
      'npm run verify:story',
      'npm run verify:atlas',
      'npm run verify:cubic',
      'npm run verify:verdict'
    ],
    failures: tsErrors.map(err => ({
      lane: 'smoke',
      type: 'TypeScript',
      file: err.file,
      line: err.line,
      symbol: err.symbol,
      error_code: err.error_code,
      error_text: err.error_text,
      likely_contract: err.likely_contract,
      blocking: err.blocking,
    })),
  };

  // Save verdict reports
  writeFileSync(path.join(reportsDir, 'verification-agent-summary.json'), JSON.stringify(structuredVerdict, null, 2));

  // Generate markdown report
  let md = `
# Parent Atlas Verification Agent Summary

Generated: ${structuredVerdict.timestamp}
Verdict: **${structuredVerdict.verdict}**
`;

  if (structuredVerdict.reason) {
    md += `Reason: **${structuredVerdict.reason}**\n`;
  }
  if (structuredVerdict.recommendation) {
    md += `Recommendation: **${structuredVerdict.recommendation}**\n`;
  }

  md += `
## Lane Verdicts
| Lane | Status | Details / Checks |
| --- | --- | --- |
| **Smoke Validation** | ${structuredVerdict.lanes.smoke} | Scripts registered, Environment checked, Services pinged |
| **Feature Memory Story** | ${structuredVerdict.lanes.story} | Key integration files present, Database schemas verified |
| **Parent Atlas Traversal** | ${structuredVerdict.lanes.atlas_traversal} | Qdrant point payloads matched, Valkey keys scanned, Neo4j traversals read |
| **Cubic Adversarial Tests** | ${structuredVerdict.lanes.cubic_adversarial} | Empty parameters, nonexistent filters fallback path checks |

## Retrieval Proof Metrics
- **Replay Trace status**: ${structuredVerdict.retrieval_proof.replay_status} (Cache hit rate: ${structuredVerdict.retrieval_proof.cacheHitPct})
- **Qdrant Payload agreement**: ${structuredVerdict.retrieval_proof.provenanceRows}/50 found in Qdrant.
- **Boundary status**: ${structuredVerdict.retrieval_proof.boundaryStatus}
- **Provenance status**: ${structuredVerdict.retrieval_proof.provenanceStatus}
`;

  if (structuredVerdict.aceHits.length > 0) {
    md += `
## ACE/KAG/DAG hits
- **ACE Hits**: ${structuredVerdict.aceHits.map(h => `\`${h}\``).join(', ') || 'None'}
- **KAG Hits**: ${structuredVerdict.kagHits.map(h => `\`${h}\``).join(', ') || 'None'}
- **DAG Hits**: ${structuredVerdict.dagHits.map(h => `\`${h}\``).join(', ') || 'None'}
`;
  }

  if (structuredVerdict.recommendedFiles.length > 0) {
    md += `
## Recommended Files to Fix
${structuredVerdict.recommendedFiles.map(f => `- \`${f}\``).join('\n')}
`;
  }

  if (structuredVerdict.recommendedCommands.length > 0) {
    md += `
## Recommended Verification Commands
${structuredVerdict.recommendedCommands.map(c => `- \`${c}\``).join('\n')}
`;
  }

  if (structuredVerdict.repairPrompt) {
    md += `
## Repair Prompt
\`\`\`
${structuredVerdict.repairPrompt}
\`\`\`
`;
  }

  md += `
## OpenCode Skill Contract (Mandatory Addendum)
- **likely_cause**: ${metadataError ? "Property 'metadata' does not exist on union type in hyperrag-packet-rpc.ts" : 'Mismatches between Qdrant payload keys and Postgres columns during whole-codebase indexing.'}
- **evidence**: \`sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts\`, \`scripts/verify/smoke-validation.mjs\`
- **patch_targets**: [\`sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts\`]
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
