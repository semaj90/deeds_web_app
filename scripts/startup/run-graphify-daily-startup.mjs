#!/usr/bin/env node
/**
 * run-graphify-daily-startup.mjs
 *
 * Wrapper for graphify:daily npm script.
 * Safe background launcher when invoked manually or by a task.
 * Signals partial/provisional progress via a stable "graphify:daily partial" pattern
 * for problemMatcher.
 */

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { acquireStartupLock, releaseStartupLock } from './lib/graphify-startup-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');
const PARENT_ATLAS = path.resolve(ROOT, 'packages/parent-atlas');
const DAILY_CHAIN_SCRIPT = 'npm run graphify:daily:chain';
const FALLBACK_SCRIPT = 'npm run startup:graphify-complete:no-consumer -- --skip-audit';
const STARTUP_LOCK_FILE = path.resolve(ROOT, '.graphify-daily-start.lock');

const quiet = process.env.GRAPHIFY_QUIET === '1';
const refreshFeatures = process.env.GRAPHIFY_FEATURE_RECOMMENDATIONS === '1';
const allowFallback = process.env.GRAPHIFY_ALLOW_FALLBACK === '1';
const nativeStructural = process.env.GRAPHIFY_NATIVE_STRUCTURAL === '1';
const nativeStructuralApply = process.env.GRAPHIFY_NATIVE_STRUCTURAL_APPLY === '1';
const nativeStructuralAllowCreateSymbols = process.env.GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS === '1';
const nativeStructuralLimit = process.env.GRAPHIFY_NATIVE_STRUCTURAL_LIMIT || '50';
const nativeStructuralInclude = process.env.GRAPHIFY_NATIVE_STRUCTURAL_INCLUDE || '';
const nativeStructuralReachabilityOut = process.env.GRAPHIFY_NATIVE_STRUCTURAL_REACHABILITY_OUT?.trim() || '';
const neuralPrefill = process.env.GRAPHIFY_NEURAL_PREFILL === '1';
const neuralPrefillShortlist = process.env.GRAPHIFY_NEURAL_PREFILL_SHORTLIST === '1';
const neuralPrefillOnly = process.env.GRAPHIFY_NEURAL_PREFILL_ONLY === '1';
let neuralPrefillStatus = 'NOT_RUN';
const provenanceScript = 'npm run atlas:phase109b:workflow:dry';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function writeNativeStructuralReachability(state) {
  if (!nativeStructuralReachabilityOut) return;
  const outputPath = path.isAbsolute(nativeStructuralReachabilityOut)
    ? nativeStructuralReachabilityOut
    : path.resolve(ROOT, nativeStructuralReachabilityOut);
  const payload = {
    schema: 'atlas.graphify-native-structural-reachability.v1',
    generatedAt: new Date().toISOString(),
    wrapper: 'scripts/startup/run-graphify-daily-startup.mjs',
    nativeStructuralEnabled: nativeStructural,
    applyRequested: nativeStructuralApply,
    allowCreateSymbolsRequested: nativeStructuralAllowCreateSymbols,
    limit: Number(nativeStructuralLimit),
    includePrefix: nativeStructuralInclude || null,
    ...state,
  };
  const receipt = { ...payload, outputChecksum: sha256(payload) };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function writeNeuralPrefillDailyReceipt(state) {
  const reportPaths = [
    'docs/reports/atlas-graphify-nlp-prefill-dry-v1.json',
    'docs/reports/atlas-neural-prefill-validation-v1.json',
    'docs/reports/atlas-candidate-shortlist-receipt-v1.json',
  ];
  const children = reportPaths.filter((relativePath) => existsSync(path.resolve(ROOT, relativePath))).map((relativePath) => {
    const content = readFileSync(path.resolve(ROOT, relativePath), 'utf8');
    return { path: relativePath, checksum: sha256(content) };
  });
  const payload = {
    schema: 'atlas.graphify-neural-prefill-daily-receipt.v1',
    generatedAt: new Date().toISOString(),
    wrapper: 'scripts/startup/run-graphify-daily-startup.mjs',
    optIn: neuralPrefill || neuralPrefillShortlist,
    shortlistOptIn: neuralPrefillShortlist,
    readOnly: true,
    canonicalWrites: false,
    qdrantWrites: false,
    valkeyWrites: false,
    ...state,
    children,
  };
  const outputPath = path.resolve(ROOT, 'docs/reports/atlas-graphify-neural-prefill-daily-v1.json');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ ...payload, outputChecksum: sha256(payload) }, null, 2)}\n`, 'utf8');
}

if (!acquireStartupLock(STARTUP_LOCK_FILE, { script: 'run-graphify-daily-startup.mjs' })) {
  if (!quiet) console.log('[graphify:daily] Another startup lock is active; backing off.');
  console.log('graphify:daily complete');
  process.exit(75);
}

process.on('exit', () => releaseStartupLock(STARTUP_LOCK_FILE));
process.on('SIGINT', () => {
  releaseStartupLock(STARTUP_LOCK_FILE);
  process.exit(130);
});
process.on('SIGTERM', () => {
  releaseStartupLock(STARTUP_LOCK_FILE);
  process.exit(143);
});

try {
  if (!quiet) console.log('[graphify:daily] Starting...');

  if (!quiet) console.log('[graphify:daily] Running repository provenance dry-run...');
  execSync(provenanceScript, {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 10 * 60 * 1000
  });
  if (!quiet) console.log('[graphify:daily] Repository provenance dry-run complete');

  // Normalize the agentic provenance output into a stable workflow receipt.
  // This is a local read-only artifact; Postgres ownership remains gated separately.
  execSync('node scripts/atlas/prepare-graphify-daily-workflow-receipt.mjs', {
    cwd: ROOT,
    stdio: quiet ? 'ignore' : 'inherit',
    timeout: 60 * 1000
  });

  // Optional read-only neural/AST/NLP prefill. This is deliberately before
  // the mutating daily chain and fail-open while the lane is in progress.
  if (neuralPrefill) {
    if (!quiet) console.log('[graphify:daily] Running optional neural prefill dry pass...');
    try {
      execSync('npm run atlas:graphify:nlp:passes:dry', {
        cwd: FRONTEND,
        stdio: quiet ? 'ignore' : 'inherit',
        timeout: 20 * 60 * 1000,
      });
      execSync('npm run atlas:neural:prefill:validate', {
        cwd: FRONTEND,
        stdio: quiet ? 'ignore' : 'inherit',
        timeout: 60 * 1000,
      });
      if (neuralPrefillShortlist) {
        execSync('npm run atlas:neural:prefill:shortlist:dry', {
          cwd: FRONTEND,
          stdio: quiet ? 'ignore' : 'inherit',
          timeout: 5 * 60 * 1000,
        });
      }
      neuralPrefillStatus = 'PASS';
      if (!quiet) console.log('[graphify:daily] Neural prefill dry pass validated.');
    } catch (prefillError) {
      neuralPrefillStatus = 'DEGRADED';
      console.warn(`[graphify:daily] Neural prefill degraded; continuing existing Graphify chain: ${prefillError.message}`);
    }
  }

  if (neuralPrefillShortlist && !neuralPrefill) {
    try {
      execSync('npm run atlas:neural:prefill:shortlist:dry', {
        cwd: FRONTEND,
        stdio: quiet ? 'ignore' : 'inherit',
        timeout: 5 * 60 * 1000,
      });
      neuralPrefillStatus = 'PASS';
    } catch (shortlistError) {
      neuralPrefillStatus = 'DEGRADED';
      console.warn(`[graphify:daily] Neural shortlist degraded; continuing existing Graphify chain: ${shortlistError.message}`);
    }
  }

  if (neuralPrefill || neuralPrefillShortlist) {
    writeNeuralPrefillDailyReceipt({
      status: neuralPrefillStatus,
      neuralPrefill,
      neuralPrefillShortlist,
      fallbackPolicy: 'CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT',
    });
  }

  if (neuralPrefillOnly) {
    if (!neuralPrefill && !neuralPrefillShortlist) {
      throw new Error('GRAPHIFY_NEURAL_PREFILL_ONLY requires an opt-in neural lane');
    }
    console.log('graphify:daily neural-prefill-only complete');
    process.exit(0);
  }

  // Run from sveltekit-frontend directory to resolve npm scripts
  //
  // graphify:daily:chain runs 6 sequential steps (dedup-validation,
  // materialize, cold-processing, phase8-fanout's own 9 sub-steps,
  // qdrant tag-mirror, feature-map-sync) over the full production
  // packet corpus (60K+ rows). A 5-minute timeout here silently killed
  // the chain mid-run with ETIMEDOUT regardless of progress — phase8's
  // own fanout orchestrator already grants itself a 2h overall-timeout
  // (see run-atlas-phase8-fanout.mjs), so the outer wrapper must not be
  // shorter than that. 3h gives headroom for the steps around it.
  execSync(DAILY_CHAIN_SCRIPT, {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 3 * 60 * 60 * 1000 // 3 hour timeout
  });

  // Read-only BM25 plan consumes the completed Graphify run when the control plane is installed.
  // It never creates an index receipt or mutates Postgres.
  if (!quiet) console.log('[graphify:daily] Planning BM25 index from Graphify run...');
  execSync('npm run atlas:bm25:index:plan', {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 60 * 1000
  });

  // Record the bounded 768d feature/Qdrant alignment after the daily refresh.
  // This is diagnostic only: it must not block Graphify completion or mutate a
  // canonical store when an optional projection is unavailable.
  if (!quiet) console.log('[graphify:daily] Checking 768d embedding alignment...');
  try {
    execSync('node scripts/atlas/test-graphify-embedding-alignment.mjs', {
      cwd: ROOT,
      stdio: quiet ? 'ignore' : 'inherit',
      timeout: 2 * 60 * 1000
    });
  } catch (alignmentError) {
    console.warn(`[graphify:daily] 768d alignment receipt deferred: ${alignmentError.message}`);
  }

  // Keep backfill eligibility visible without embedding or writing projections.
  // The error lane is intentionally omitted because its live column is legacy
  // 384d and requires an explicit migration decision.
  for (const [label, command] of [
    ['canonical 768d embedding plan', 'node scripts/atlas/backfill-graphify-file-embeddings-768.mjs --limit=128 --since-hours=24 --out=docs/reports/graphify-daily-content-embedding-plan-v1.json'],
    ['signature 768d embedding plan', 'node scripts/atlas/backfill-graphify-rff-embeddings-768.mjs --signature-only --limit=128 --since-hours=24 --out=docs/reports/graphify-daily-signature-embedding-plan-v1.json']
  ]) {
    if (!quiet) console.log(`[graphify:daily] Planning ${label}...`);
    try {
      execSync(command, {
        cwd: ROOT,
        stdio: quiet ? 'ignore' : 'inherit',
        timeout: 2 * 60 * 1000
      });
    } catch (planError) {
      console.warn(`[graphify:daily] ${label} deferred: ${planError.message}`);
    }
  }

  console.log('graphify:daily partial');

  // Native structural owner migration. Batch A remains a synthetic/heuristic
  // compatibility producer and is not promoted. This step is opt-in until the
  // 8095 runtime and PostgreSQL readback gates are proven on the workstation.
  //
  // GRAPHIFY_NATIVE_STRUCTURAL=1                    -> dry-run (default)
  // GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1              -> requests canonical writes, which the
  //                                                    child currently blocks while revision
  //                                                    authority is unproven
  // GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS=1 -> additionally request GIS symbol creation
  // GRAPHIFY_NATIVE_STRUCTURAL_REACHABILITY_OUT=<path> -> write noncanonical GPH-17 reachability proof
  if (nativeStructural) {
    const startedAt = new Date().toISOString();
    writeNativeStructuralReachability({
      status: 'ENTERED_NATIVE_STRUCTURAL_STAGE',
      startedAt,
      completedAt: null,
      invoked: false,
      completed: false,
      childExitCode: null,
      canonicalWritesProven: false,
    });

    if (!quiet) console.log('[graphify:daily] Building Parent Atlas contracts for native structural owner...');
    execSync('npm run build', {
      cwd: PARENT_ATLAS,
      stdio: quiet ? 'ignore' : 'inherit',
      timeout: 5 * 60 * 1000,
      shell: true,
    });

    const nativeArgs = [
      'npx tsx scripts/atlas/native-structural-materializer.mts',
      `--limit=${nativeStructuralLimit}`,
    ];
    if (nativeStructuralInclude) nativeArgs.push(`--include=${nativeStructuralInclude}`);
    if (nativeStructuralApply) nativeArgs.push('--apply');
    if (nativeStructuralAllowCreateSymbols) nativeArgs.push('--allow-create-symbols');
    if (!quiet) nativeArgs.push('--verbose');

    if (!quiet) {
      console.log(`[graphify:daily] Native structural owner ${nativeStructuralApply ? 'APPLY' : 'DRY-RUN'} mode; symbol creation ${nativeStructuralAllowCreateSymbols ? 'ENABLED' : 'DISABLED'}.`);
    }

    writeNativeStructuralReachability({
      status: 'INVOKING_NATIVE_STRUCTURAL_CHILD',
      startedAt,
      completedAt: null,
      invoked: true,
      completed: false,
      childExitCode: null,
      canonicalWritesProven: false,
    });

    try {
      execSync(nativeArgs.join(' '), {
        cwd: FRONTEND,
        stdio: quiet ? 'ignore' : 'inherit',
        timeout: 2 * 60 * 60 * 1000,
        shell: true,
        env: { ...process.env, ATLAS_NATIVE_STRUCTURAL_LIMIT: nativeStructuralLimit },
      });
      writeNativeStructuralReachability({
        status: nativeStructuralApply ? 'APPLY_CHILD_COMPLETED_UNPROVEN' : 'LIVE_REACHABLE_DRY_RUN',
        startedAt,
        completedAt: new Date().toISOString(),
        invoked: true,
        completed: true,
        childExitCode: 0,
        canonicalWritesProven: false,
      });
    } catch (nativeError) {
      const childExitCode = Number.isInteger(nativeError?.status) ? nativeError.status : null;
      writeNativeStructuralReachability({
        status: 'NATIVE_STRUCTURAL_CHILD_FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        invoked: true,
        completed: false,
        childExitCode,
        canonicalWritesProven: false,
        error: nativeError instanceof Error ? nativeError.message : String(nativeError),
      });
      throw nativeError;
    }

    if (!quiet) console.log('[graphify:daily] Native structural owner step complete');
  }

  if (refreshFeatures) {
    if (!quiet) console.log('[graphify:daily] Refreshing feature recommendation index...');
    execSync('npm run atlas:feature-recommendations:refresh', {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true
    });
    console.log('[graphify:daily] feature recommendations complete');
  }

  // DAG-4/QAS is a non-mutating recommendation sketch. It may emit a
  // deferred receipt when no candidate feature matrix exists, but it must
  // never block canonical Graphify completion or invent candidate evidence.
  try {
    execSync('npx tsx ../scripts/atlas/prove-query-adaptive-sampling.mts --daily', {
      cwd: FRONTEND,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      timeout: 60 * 1000
    });
  } catch (qasError) {
    console.warn(`[graphify:daily] QAS receipt deferred: ${qasError.message}`);
  }
  try {
    execSync('npx tsx ../scripts/atlas/evaluate-query-adaptive-sampling.mts', {
      cwd: FRONTEND,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      timeout: 60 * 1000
    });
  } catch (qasEvalError) {
    console.warn(`[graphify:daily] QAS evaluation deferred: ${qasEvalError.message}`);
  }

  // Terminal lifecycle marker for .vscode/tasks.json's background problemMatcher
  // (endsPattern: "graphify:daily complete") — must be printed on every exit
  // path (success, fallback-success, and failure), not just success. Before
  // this fix the script never emitted this exact string anywhere, so the
  // isBackground:true task's endsPattern could never match — VS Code had no
  // reliable signal the task had finished, on success or failure alike. Do
  // not confuse this with the "partial" markers above/below, which signal
  // data-completeness (chain-progressed-but-not-all-substeps-verified), a
  // separate concern from process-lifecycle termination.
  console.log('graphify:daily complete');
  process.exit(0);
} catch (err) {
  console.error(`ERROR: graphify:daily failed: ${err.message}`);
  if (!allowFallback) {
    console.error('[graphify:daily] Fallback disabled; exiting with failure.');
    console.log('graphify:daily complete');
    process.exit(1);
  }

  console.log('[graphify:daily] Falling back to startup pipeline...');

  try {
    execSync(FALLBACK_SCRIPT, {
      cwd: FRONTEND,
      stdio: 'inherit',
      timeout: 10 * 60 * 1000,
      shell: true,
    });
    console.log('[graphify:daily] fallback startup partial');
    console.log('graphify:daily complete');
    process.exit(0);
  } catch (fallbackErr) {
    console.error(`ERROR: graphify fallback failed: ${fallbackErr.message}`);
    console.log('graphify:daily partial');
    console.log('graphify:daily complete');
    process.exit(1);
  }
}
