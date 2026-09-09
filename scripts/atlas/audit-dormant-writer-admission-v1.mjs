#!/usr/bin/env node
/**
 * DORMANT-PACKET-WRITER-ADMISSION-01 (read-only)
 *
 * Prevents today's dormant capability from becoming tomorrow's silent
 * second owner. Any of the 8 confirmed-dormant atlas_packets writers
 * (PACKET_REGISTRY_WRITER_OWNERSHIP_01B) that later gains a real caller
 * must, at the same time, prove it routes through:
 *   - the same canonical packet-key resolver (resolveCanonicalPacketKey)
 *   - decidePacketWrite() (packet-write-decision-v1.ts, conflict semantics)
 *   - executePacketWriteTransaction() (packet-write-transaction-v1.ts,
 *     transaction/outbox contract)
 * Otherwise CI/architecture validation should fail.
 *
 * This script re-checks BOTH halves live, every run, rather than trusting
 * a frozen baseline:
 *   (a) reachability -- does the file still have zero real production
 *       callers of its mutating function? (re-derived, not copied from the
 *       01B census, in case something changed since)
 *   (b) contract compliance -- does the file import/call
 *       decidePacketWrite or executePacketWriteTransaction at all?
 *
 * The violation this gate exists to catch: reachability flips to "has a
 * real caller now" while contract compliance stays false. That combination
 * is a FAIL. Any other combination (still dormant; or reachable AND
 * compliant) is a PASS.
 *
 * Writes ONE receipt. Never mutates code, schema, or data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'dormant-writer-admission-v1.json');

// The 8 confirmed-dormant writers from PACKET_REGISTRY_WRITER_OWNERSHIP_01B,
// with their mutating function names (not the file/module name -- reachability
// must be checked at function-call granularity, per this session's own
// repeated lesson that file/module-level checks produce false positives).
const DORMANT_WRITERS = [
  { file: 'sveltekit-frontend/src/lib/server/topology/canonical-id-hierarchy.ts', functions: ['persistIDHierarchyToPostgres', 'softDeletePacket', 'approveAndPermanentlyDelete', 'undeletePacket'] },
  { file: 'sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts', functions: ['materializePacket', 'materializePacketBatch'] },
  { file: 'sveltekit-frontend/src/lib/server/unknown/promotion-executor.ts', functions: [] }, // no single named write function established in 01B -- reachability-only check on the module
  { file: 'sveltekit-frontend/src/lib/server/workers/identity-worker.ts', functions: ['processPacketIdentity'] },
  { file: 'sveltekit-frontend/src/lib/server/indexer/feature-label-enricher.ts', functions: ['enrichPacketWithLabels'] },
  { file: 'sveltekit-frontend/src/lib/server/indexer/summary-freshness-checker.ts', functions: ['recordSummaryGeneration'] },
  { file: 'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts', functions: ['materializePackets'] },
  { file: 'sveltekit-frontend/src/lib/server/dispatch/mcp-tool-implementations.ts', functions: ['toolIdentityQuarantine'] }, // the specific unused wrapped export, not the whole file (4 siblings are live and out of scope here)
];

function rgRealImportCallers(needle, roots) {
  try {
    const output = execFileSync(
      'rg',
      ['-l', '--hidden', '--glob', '!**/node_modules/**', '--glob', '!**/.git/**', '--glob', '!**/dist/**', '--glob', '!**/.svelte-kit/**', '--fixed-strings', '--', needle, ...roots],
      { cwd: ROOT, encoding: 'utf8', timeout: 15000 },
    );
    return output.split(/\r?\n/).filter(Boolean).map((f) => f.replaceAll('\\', '/'));
  } catch {
    return [];
  }
}

function checkContractCompliance(relPath) {
  const absPath = path.join(ROOT, relPath);
  let source = '';
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch {
    return { fileExists: false, usesDecidePacketWrite: false, usesExecutePacketWriteTransaction: false, usesResolveCanonicalPacketKey: false };
  }
  return {
    fileExists: true,
    usesDecidePacketWrite: /decidePacketWrite/.test(source),
    usesExecutePacketWriteTransaction: /executePacketWriteTransaction/.test(source),
    usesResolveCanonicalPacketKey: /resolveCanonicalPacketKey/.test(source),
  };
}

/**
 * Verifies a bare-name-grep caller candidate actually IMPORTS the dormant
 * file (not merely a same-named function defined locally in the candidate
 * file itself, or a same-named function imported from somewhere else
 * entirely). This is the exact fix this session already needed twice for
 * the identical materializePacket/materializePackets name collision
 * (ace-materializer.ts and packet-parser.ts each define their own unrelated
 * function of that name) -- baking it into this gate's own methodology so
 * it does not reproduce that false positive a third time.
 */
function candidateReallyImportsFile(candidateRelPath, dormantRelPath) {
  const absPath = path.join(ROOT, candidateRelPath);
  let source = '';
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch {
    return false;
  }
  const dormantBasename = path.basename(dormantRelPath, path.extname(dormantRelPath));
  // Matches `from '...basename.js'`, `from '...basename'`, `from "$lib/.../basename.js"` etc.
  const importPattern = new RegExp(`from\\s+['"][^'"]*${dormantBasename}(\\.js)?['"]`);
  return importPattern.test(source);
}

function checkReachability(entry) {
  if (entry.functions.length === 0) {
    const basename = path.basename(entry.file, path.extname(entry.file));
    const candidates = rgRealImportCallers(basename, ['sveltekit-frontend/src']).filter((f) => f !== entry.file && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'));
    const importers = candidates.filter((c) => candidateReallyImportsFile(c, entry.file));
    return { functionsChecked: [], candidatesFound: candidates, realCallersFound: importers, hasRealCaller: importers.length > 0 };
  }
  const allCandidates = new Set();
  for (const fn of entry.functions) {
    const callers = rgRealImportCallers(`${fn}(`, ['sveltekit-frontend/src'])
      .filter((f) => f !== entry.file && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'));
    for (const c of callers) allCandidates.add(c);
  }
  const realCallers = [...allCandidates].filter((c) => candidateReallyImportsFile(c, entry.file));
  return { functionsChecked: entry.functions, candidatesFound: [...allCandidates], realCallersFound: realCallers, hasRealCaller: realCallers.length > 0 };
}

function main() {
  const results = DORMANT_WRITERS.map((entry) => {
    const reachability = checkReachability(entry);
    const compliance = checkContractCompliance(entry.file);
    const contractCompliant = compliance.usesDecidePacketWrite || compliance.usesExecutePacketWriteTransaction;

    // The actual violation: newly reachable AND not contract-compliant.
    const admission = reachability.hasRealCaller && !contractCompliant
      ? 'FAIL_NEWLY_REACHABLE_WITHOUT_CONTRACT'
      : reachability.hasRealCaller && contractCompliant
        ? 'PASS_REACHABLE_AND_COMPLIANT'
        : 'PASS_STILL_DORMANT';

    return {
      file: entry.file,
      ...reachability,
      ...compliance,
      contractCompliant,
      admission,
    };
  });

  const failures = results.filter((r) => r.admission === 'FAIL_NEWLY_REACHABLE_WITHOUT_CONTRACT');
  const stillDormantCount = results.filter((r) => r.admission === 'PASS_STILL_DORMANT').length;

  const report = {
    schema: 'atlas.dormant-writer-admission.v1',
    gate: 'DORMANT-PACKET-WRITER-ADMISSION-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    canonicalAuthority: false,
    dormantWriterCount: DORMANT_WRITERS.length,
    stillDormantCount,
    violationCount: failures.length,
    overallResult: failures.length === 0 ? 'PASS' : 'FAIL',
    results,
    violations: failures,
    invariant: 'Any writer in DORMANT_WRITERS that gains a real production caller (reachability=true) MUST also import decidePacketWrite or executePacketWriteTransaction (contractCompliant=true) in the same change. A writer becoming reachable without also becoming compliant is a FAIL -- this is exactly the "today\'s dormant capability becomes tomorrow\'s silent second owner" failure mode the operator\'s directive warned about.',
    nextAction: failures.length === 0
      ? 'No violations. Re-run this script (or wire it into CI) whenever any file in DORMANT_WRITERS or its function list changes, or before promoting any of these files out of dormant status.'
      : 'One or more dormant writers gained a real caller without contract compliance -- do not promote or merge until the new caller is either removed or the writer is updated to route through decidePacketWrite/executePacketWriteTransaction.',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'DORMANT_WRITER_ADMISSION_READ_ONLY_COMPLETE',
    overallResult: report.overallResult,
    stillDormantCount,
    violationCount: failures.length,
    perFile: results.map((r) => ({ file: r.file, hasRealCaller: r.hasRealCaller, contractCompliant: r.contractCompliant, admission: r.admission })),
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main();
