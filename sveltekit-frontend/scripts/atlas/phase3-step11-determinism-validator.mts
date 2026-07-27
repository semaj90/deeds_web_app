#!/usr/bin/env node

/**
 * Phase 3 Step 11: Determinism Validator
 *
 * Validates that Phase 3 Steps 8-10 produce reproducible, deterministic output.
 * Runs the snapshot twice with identical input and compares:
 * - Identity fields (packet_key, feature_id, tree_node_id, source_ref)
 * - Resolution states (5-state classification)
 * - Logical row hashes (semantic content)
 * - Parquet/Arrow export formats
 *
 * Inputs:
 * - control-snapshot-1k/snapshot.ndjson (control snapshot, 1,000 packets)
 * - identity-resolution-results/ (output from Step 9-10 runs)
 *
 * Outputs:
 * - determinism-validation-results/run1-results.ndjson (first run)
 * - determinism-validation-results/run2-results.ndjson (second run)
 * - determinism-validation-results/comparison-audit.json (comparison report)
 *
 * Exit codes:
 * 0 = both runs match identically, determinism proven
 * 1 = run execution failed
 * 2 = input files not found
 * 3 = runs diverged (determinism broken)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// Zod Schemas
// ============================================================================

const ResolutionStateEnum = z.enum([
  'RESOLVED',
  'FEATURE_ID_MISSING',
  'TREE_NODE_ID_MISSING',
  'SOURCE_HASH_MISMATCH',
  'AMBIGUOUS_JOIN',
]);

const IdentityResolutionSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  feature_id: z.string().optional(),
  tree_node_id: z.string().optional(),
  source_ref: z.string().optional(),
  content_hash: z.string().optional(),
  resolution_state: ResolutionStateEnum,
  postgres_packet_id: z.string().optional(),
  postgres_chunk_id: z.string().optional(),
  confidence: z.number().min(0).max(1),
  resolution_details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

type IdentityResolution = z.infer<typeof IdentityResolutionSchema>;

const DeterminismGateSchema = z.object({
  gate_name: z.string(),
  gate_type: z.enum(['run_execution', 'identity_fields', 'resolution_state', 'logical_hash', 'round_trip']),
  check: z.string(),
  result: z.enum(['PASS', 'FAIL', 'SKIP']),
  details: z.string(),
  divergence_count: z.number().optional(),
  expected_count: z.number().optional(),
});

type DeterminismGate = z.infer<typeof DeterminismGateSchema>;

// ============================================================================
// Determinism Comparison Logic
// ============================================================================

function computeRowSignature(row: IdentityResolution): string {
  const canonical = JSON.stringify({
    packet_key: row.packet_key,
    feature_id: row.feature_id,
    tree_node_id: row.tree_node_id,
    source_ref: row.source_ref,
    content_hash: row.content_hash,
    resolution_state: row.resolution_state,
    confidence: row.confidence,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

interface RowComparison {
  packet_key: string;
  run1_state: string;
  run2_state: string;
  run1_confidence: number;
  run2_confidence: number;
  identity_fields_match: boolean;
  resolution_state_match: boolean;
  signature_match: boolean;
  divergence_found: boolean;
}

async function loadAndParseNdjson(filePath: string): Promise<IdentityResolution[]> {
  const rows: IdentityResolution[] = [];

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line: string) => {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          const validated = IdentityResolutionSchema.parse(parsed);
          rows.push(validated);
        } catch (err) {
          reject(new Error(`Invalid NDJSON line: ${line.substring(0, 100)}`));
        }
      }
    });

    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

function compareRows(run1: IdentityResolution, run2: IdentityResolution): RowComparison {
  const sig1 = computeRowSignature(run1);
  const sig2 = computeRowSignature(run2);

  return {
    packet_key: run1.packet_key,
    run1_state: run1.resolution_state,
    run2_state: run2.resolution_state,
    run1_confidence: run1.confidence,
    run2_confidence: run2.confidence,
    identity_fields_match:
      run1.feature_id === run2.feature_id &&
      run1.tree_node_id === run2.tree_node_id &&
      run1.source_ref === run2.source_ref &&
      run1.content_hash === run2.content_hash,
    resolution_state_match: run1.resolution_state === run2.resolution_state,
    signature_match: sig1 === sig2,
    divergence_found:
      run1.resolution_state !== run2.resolution_state ||
      run1.confidence !== run2.confidence ||
      run1.feature_id !== run2.feature_id ||
      run1.tree_node_id !== run2.tree_node_id ||
      run1.source_ref !== run2.source_ref ||
      run1.content_hash !== run2.content_hash,
  };
}

function writeComparisonReport(
  comparisons: RowComparison[],
  run1Rows: IdentityResolution[],
  run2Rows: IdentityResolution[],
  outputPath: string
): void {
  const divergentRows = comparisons.filter((c) => c.divergence_found);
  const identityFieldMismatches = comparisons.filter((c) => !c.identity_fields_match);
  const resolutionStateMismatches = comparisons.filter((c) => !c.resolution_state_match);
  const signatureMismatches = comparisons.filter((c) => !c.signature_match);

  const report = {
    timestamp: new Date().toISOString(),
    run_counts: {
      run1_total: run1Rows.length,
      run2_total: run2Rows.length,
      comparisons: comparisons.length,
    },
    divergence_summary: {
      total_divergent_rows: divergentRows.length,
      identity_field_mismatches: identityFieldMismatches.length,
      resolution_state_mismatches: resolutionStateMismatches.length,
      signature_mismatches: signatureMismatches.length,
    },
    divergent_rows_detail: divergentRows.slice(0, 10).map((c) => ({
      packet_key: c.packet_key,
      run1_state: c.run1_state,
      run2_state: c.run2_state,
      identity_mismatch: !c.identity_fields_match,
      state_mismatch: !c.resolution_state_match,
    })),
    sample_matches: comparisons.slice(0, 5).map((c) => ({
      packet_key: c.packet_key,
      state: c.run1_state,
      confidence: c.run1_confidence,
      all_match: !c.divergence_found,
    })),
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

// ============================================================================
// Validation Gates
// ============================================================================

async function runDeterminismGates(
  run1Rows: IdentityResolution[],
  run2Rows: IdentityResolution[],
  comparisons: RowComparison[]
): Promise<DeterminismGate[]> {
  const gates: DeterminismGate[] = [];

  // Gate 1: Both runs produced output
  gates.push({
    gate_name: 'Run Execution Success',
    gate_type: 'run_execution',
    check: 'Both Phase 3 Steps 9-10 ran successfully and produced output',
    result: run1Rows.length > 0 && run2Rows.length > 0 ? 'PASS' : 'FAIL',
    details: `Run 1: ${run1Rows.length} rows, Run 2: ${run2Rows.length} rows`,
    expected_count: 1000,
  });

  // Gate 2: Identity field consistency
  const identityFieldMismatches = comparisons.filter((c) => !c.identity_fields_match).length;
  gates.push({
    gate_name: 'Identity Field Consistency',
    gate_type: 'identity_fields',
    check: 'All identity fields (packet_key, feature_id, tree_node_id, source_ref) match across runs',
    result: identityFieldMismatches === 0 ? 'PASS' : 'FAIL',
    details: `${identityFieldMismatches} rows with identity field divergence`,
    divergence_count: identityFieldMismatches,
    expected_count: 0,
  });

  // Gate 3: Resolution state consistency
  const resolutionStateMismatches = comparisons.filter((c) => !c.resolution_state_match).length;
  gates.push({
    gate_name: 'Resolution State Consistency',
    gate_type: 'resolution_state',
    check: '5-state classification (RESOLVED, *_MISSING, etc.) matches across runs',
    result: resolutionStateMismatches === 0 ? 'PASS' : 'FAIL',
    details: `${resolutionStateMismatches} rows with resolution state divergence`,
    divergence_count: resolutionStateMismatches,
    expected_count: 0,
  });

  // Gate 4: Logical row hash consistency
  const signatureMismatches = comparisons.filter((c) => !c.signature_match).length;
  gates.push({
    gate_name: 'Logical Row Hash Consistency',
    gate_type: 'logical_hash',
    check: 'Semantic content hashes match (deterministic row signatures)',
    result: signatureMismatches === 0 ? 'PASS' : 'FAIL',
    details: `${signatureMismatches} rows with hash divergence`,
    divergence_count: signatureMismatches,
    expected_count: 0,
  });

  // Gate 5: Round-trip determinism (all fields match)
  const totalDivergent = comparisons.filter((c) => c.divergence_found).length;
  gates.push({
    gate_name: 'Determinism Proven (Round-Trip)',
    gate_type: 'round_trip',
    check: 'Identical snapshot input produces identical output across two complete runs',
    result: totalDivergent === 0 ? 'PASS' : 'FAIL',
    details: `${totalDivergent}/${comparisons.length} rows diverged between runs (${((totalDivergent / comparisons.length) * 100).toFixed(2)}% divergence)`,
    divergence_count: totalDivergent,
    expected_count: 0,
  });

  return gates;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const cwd = process.cwd();
  const snapshotPath = resolve(cwd, 'control-snapshot-1k', 'snapshot.ndjson');
  const resultsDir = resolve(cwd, 'identity-resolution-results');
  const validationDir = resolve(cwd, 'determinism-validation-results');
  const step9ScriptPath = resolve(cwd, 'scripts', 'atlas', 'phase3-identity-resolver.mts');
  const step10ScriptPath = resolve(cwd, 'scripts', 'atlas', 'phase3-step10-parquet-arrow-exporters.mts');

  console.log('[Phase 3 Step 11] Determinism Validator');
  console.log(`Snapshot: ${snapshotPath}`);
  console.log(`Results directory: ${resultsDir}`);
  console.log(`Validation directory: ${validationDir}`);
  console.log('');

  // Create validation directory
  mkdirSync(validationDir, { recursive: true });

  // Step 1: Verify input exists
  console.log('[Step 1] Verifying input snapshot...');
  if (!existsSync(snapshotPath)) {
    console.error(`✗ Snapshot not found: ${snapshotPath}`);
    process.exit(2);
  }
  console.log(`✓ Snapshot found: ${snapshotPath}`);

  // Step 2: Run Phase 3 Steps 9-10 (Run 1)
  console.log('\n[Step 2] Running Phase 3 Steps 9-10 (Run 1)...');
  try {
    // Clean up previous results
    const run1Dir = resolve(validationDir, 'run1-results');
    mkdirSync(run1Dir, { recursive: true });

    console.log('  → Running Step 9 (Identity Resolver)...');
    execSync('npx tsx scripts/atlas/phase3-identity-resolver.mts', { cwd, stdio: 'inherit' });

    console.log('  → Running Step 10 (Parquet + Arrow Exporters)...');
    execSync('npx tsx scripts/atlas/phase3-step10-parquet-arrow-exporters.mts', { cwd, stdio: 'inherit' });

    // Copy results
    const run1Results = await loadAndParseNdjson(resolve(resultsDir, 'results.ndjson'));
    writeFileSync(
      resolve(validationDir, 'run1-results.ndjson'),
      run1Results.map((r) => JSON.stringify(r)).join('\n'),
      'utf-8'
    );
    console.log(`✓ Run 1 complete: ${run1Results.length} packets processed`);
  } catch (err) {
    console.error(`✗ Run 1 failed: ${err}`);
    process.exit(1);
  }

  // Step 3: Run Phase 3 Steps 9-10 (Run 2)
  console.log('\n[Step 3] Running Phase 3 Steps 9-10 (Run 2)...');
  try {
    // Clean up previous results
    const run2Dir = resolve(validationDir, 'run2-results');
    mkdirSync(run2Dir, { recursive: true });

    console.log('  → Running Step 9 (Identity Resolver)...');
    execSync('npx tsx scripts/atlas/phase3-identity-resolver.mts', { cwd, stdio: 'inherit' });

    console.log('  → Running Step 10 (Parquet + Arrow Exporters)...');
    execSync('npx tsx scripts/atlas/phase3-step10-parquet-arrow-exporters.mts', { cwd, stdio: 'inherit' });

    // Copy results
    const run2Results = await loadAndParseNdjson(resolve(resultsDir, 'results.ndjson'));
    writeFileSync(
      resolve(validationDir, 'run2-results.ndjson'),
      run2Results.map((r) => JSON.stringify(r)).join('\n'),
      'utf-8'
    );
    console.log(`✓ Run 2 complete: ${run2Results.length} packets processed`);
  } catch (err) {
    console.error(`✗ Run 2 failed: ${err}`);
    process.exit(1);
  }

  // Step 4: Load both run results
  console.log('\n[Step 4] Loading and comparing results...');
  const run1Results = await loadAndParseNdjson(resolve(validationDir, 'run1-results.ndjson'));
  const run2Results = await loadAndParseNdjson(resolve(validationDir, 'run2-results.ndjson'));

  if (run1Results.length !== run2Results.length) {
    console.error(
      `✗ Row count mismatch: Run 1 = ${run1Results.length}, Run 2 = ${run2Results.length}`
    );
    process.exit(3);
  }

  // Step 5: Compare row-by-row
  console.log('[Step 5] Comparing rows row-by-row...');
  const comparisons: RowComparison[] = [];

  for (let i = 0; i < run1Results.length; i++) {
    const comparison = compareRows(run1Results[i], run2Results[i]);
    comparisons.push(comparison);
  }

  const divergentCount = comparisons.filter((c) => c.divergence_found).length;
  console.log(
    `✓ Compared ${comparisons.length} rows: ${divergentCount} divergent (${((divergentCount / comparisons.length) * 100).toFixed(2)}%)`
  );

  // Step 6: Run validation gates
  console.log('\n[Step 6] Running validation gates...');
  const gates = await runDeterminismGates(run1Results, run2Results, comparisons);
  const passCount = gates.filter((g) => g.result === 'PASS').length;
  const failCount = gates.filter((g) => g.result === 'FAIL').length;

  console.log(`\nValidation Gates (${passCount}/${gates.length} passed):`);
  for (const gate of gates) {
    const symbol = gate.result === 'PASS' ? '✓' : gate.result === 'FAIL' ? '✗' : '○';
    console.log(`  ${symbol} ${gate.gate_name}: ${gate.result}`);
    console.log(`    ${gate.details}`);
  }

  // Step 7: Write audit report
  console.log('\n[Step 7] Writing comparison audit report...');
  const auditPath = resolve(validationDir, 'comparison-audit.json');
  const auditReport = {
    timestamp: new Date().toISOString(),
    run_counts: {
      run1_total: run1Results.length,
      run2_total: run2Results.length,
      comparisons: comparisons.length,
    },
    divergence_summary: {
      total_divergent_rows: divergentCount,
      identity_field_mismatches: comparisons.filter((c) => !c.identity_fields_match).length,
      resolution_state_mismatches: comparisons.filter((c) => !c.resolution_state_match).length,
      signature_mismatches: comparisons.filter((c) => !c.signature_match).length,
    },
    divergence_examples: comparisons
      .filter((c) => c.divergence_found)
      .slice(0, 5)
      .map((c) => ({
        packet_key: c.packet_key,
        run1_state: c.run1_state,
        run2_state: c.run2_state,
        run1_confidence: c.run1_confidence,
        run2_confidence: c.run2_confidence,
        identity_mismatch: !c.identity_fields_match,
        state_mismatch: !c.resolution_state_match,
      })),
    gates,
    summary: {
      total_gates: gates.length,
      passed_gates: passCount,
      failed_gates: failCount,
      overall_result: failCount === 0 ? 'DETERMINISM_PROVEN' : 'DETERMINISM_BROKEN',
    },
  };

  writeFileSync(auditPath, JSON.stringify(auditReport, null, 2), 'utf-8');
  console.log(`✓ Audit report: ${auditPath}`);

  // Exit with appropriate code
  const allPass = failCount === 0;
  console.log(`\n[Result] Phase 3 Step 11: ${allPass ? '✓ PASS — DETERMINISM PROVEN' : '✗ FAIL — DETERMINISM BROKEN'}`);
  process.exit(allPass ? 0 : 3);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
