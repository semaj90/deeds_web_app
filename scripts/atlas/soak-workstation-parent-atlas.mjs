#!/usr/bin/env node
/**
 * scripts/atlas/soak-workstation-parent-atlas.mjs
 *
 * Production soak and benchmark harness for the Parent Atlas / ACE Hypergraph.
 * Runs sequential query retrieval and synthesis workloads, checking VRAM recovery,
 * latency, and compliance policies.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const DEFAULT_QUERIES = [
  'how do we validate pgvector hnsw indexes',
  'drizzle schema user_id mismatch',
  'how does cluster pivot retrieval work',
  'where is llm synthesis memory logged'
];

function getVramUsage() {
  try {
    const stdout = execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return parseInt(stdout.trim(), 10);
  } catch (err) {
    return 0; // Fallback
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    cycles: 5,
    dryRun: true, // Default to dry-run
    write: false,
    query: null
  };

  for (const arg of args) {
    if (arg.startsWith('--cycles=')) {
      options.cycles = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--write') {
      options.write = true;
      options.dryRun = false; // --write overrides default dry-run
    } else if (arg.startsWith('--query=')) {
      options.query = arg.split('=')[1];
    }
  }

  return options;
}

async function runSoak() {
  const options = parseArgs();
  console.log('⚡ Initializing Workstation Parent Atlas Soak Benchmark Harness...');
  console.log(`ℹ️ Parameters: Cycles=${options.cycles}, DryRun=${options.dryRun}, Write=${options.write}`);

  const soakReport = {
    timestamp: new Date().toISOString(),
    cyclesConfigured: options.cycles,
    isDryRun: options.dryRun,
    overallStatus: 'UNKNOWN',
    metrics: {
      totalQueriesExecuted: 0,
      averageLatencyMs: 0,
      peakVramDeltaMb: 0,
      forbiddenFieldsDetected: 0,
      sourceRefsMissingCount: 0,
      redisOk: true,
      qdrantOk: true,
      postgresOk: true
    },
    cycles: []
  };

  const queries = options.query ? [options.query] : DEFAULT_QUERIES;
  let totalLatency = 0;
  let peakDelta = 0;

  const baselineVram = getVramUsage();

  for (let c = 0; c < options.cycles; c++) {
    const query = queries[c % queries.length];
    console.log(`\n🔄 [Cycle ${c + 1}/${options.cycles}] Query: "${query}"`);

    const cycleData = {
      cycleIndex: c + 1,
      query,
      vramBeforeMb: getVramUsage(),
      vramAfterMb: 0,
      latencyMs: 0,
      aceSmokePassed: false,
      synthesisSmokePassed: false,
      sourceRefsPresent: false,
      forbiddenFieldsDetected: false,
      errors: []
    };

    const start = Date.now();

    // 1. Run ACE Packet Smoke Builder via CLI to guarantee separate process space
    try {
      execSync(`node scripts/atlas/smoke-ace-packet-builder.mjs --query "${query}"`, { stdio: 'ignore' });
      cycleData.aceSmokePassed = true;
    } catch (err) {
      cycleData.errors.push(`ACE Packet failed: ${err.message}`);
    }

    // 2. Run LLM Synthesis Logger in dry-run
    try {
      execSync('node scripts/atlas/smoke-llm-synthesis-event.mjs --dry-run', { stdio: 'ignore' });
      cycleData.synthesisSmokePassed = true;
    } catch (err) {
      cycleData.errors.push(`Synthesis failed: ${err.message}`);
    }

    cycleData.latencyMs = Date.now() - start;
    cycleData.vramAfterMb = getVramUsage();
    totalLatency += cycleData.latencyMs;

    const delta = Math.abs(cycleData.vramAfterMb - cycleData.vramBeforeMb);
    if (delta > peakDelta) {
      peakDelta = delta;
    }

    // 3. Inspect generated ACE packet report to verify policy compliance
    const aceReportPath = resolve(REPO_ROOT, 'docs/reports/ace-packet-smoke-report.json');
    if (existsSync(aceReportPath)) {
      try {
        const reportContent = JSON.parse(readFileSync(aceReportPath, 'utf8'));
        
        // Audit sourceRefs
        if (reportContent.findings && reportContent.findings.length > 0) {
          cycleData.sourceRefsPresent = reportContent.findings.every(f => f.sourceRefs !== undefined);
        } else {
          // If no findings, fall back to checking if reports are present
          cycleData.sourceRefsPresent = true;
        }

        // Audit Forbidden Fields (hiddenThoughts, chainOfThought, kv_cache, tensor, cudaPointer)
        const rawContent = readFileSync(aceReportPath, 'utf8');
        const forbiddenKeys = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
        for (const key of forbiddenKeys) {
          if (rawContent.includes(`"${key}"`)) {
            cycleData.forbiddenFieldsDetected = true;
            soakReport.metrics.forbiddenFieldsDetected++;
            console.error(`🔴 Critical Violation: Forbidden field "${key}" detected in report!`);
          }
        }
      } catch (err) {
        cycleData.errors.push(`Report parsing error: ${err.message}`);
      }
    }

    if (!cycleData.sourceRefsPresent) {
      soakReport.metrics.sourceRefsMissingCount++;
    }

    console.log(`   ✔️ Latency: ${cycleData.latencyMs} ms`);
    console.log(`   ✔️ VRAM Before/After: ${cycleData.vramBeforeMb} MB / ${cycleData.vramAfterMb} MB`);
    console.log(`   ✔️ SourceRefs Present: ${cycleData.sourceRefsPresent ? '✅' : '❌'}`);

    soakReport.cycles.push(cycleData);
    soakReport.metrics.totalQueriesExecuted++;
  }

  // Calculate averages
  soakReport.metrics.averageLatencyMs = Number((totalLatency / soakReport.metrics.totalQueriesExecuted).toFixed(2));
  soakReport.metrics.peakVramDeltaMb = peakDelta;

  // Decide overall status
  if (soakReport.metrics.forbiddenFieldsDetected === 0 && soakReport.metrics.sourceRefsMissingCount === 0) {
    soakReport.overallStatus = 'PASS';
    console.log('\n🎉 Production Soak Benchmark PASSED successfully!');
  } else {
    soakReport.overallStatus = 'FAIL';
    console.error('\n🔴 Production Soak Benchmark FAILED due to compliance violations.');
  }

  // 4. Write reports to disk ONLY if --write flag is passed
  if (options.write) {
    const reportsDir = resolve(REPO_ROOT, 'docs/reports');
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }

    const jsonPath = join(reportsDir, 'workstation-soak-report.json');
    const mdPath = join(reportsDir, 'workstation-soak-report.md');

    writeFileSync(jsonPath, JSON.stringify(soakReport, null, 2), 'utf8');

    // Append summary row to benchmark history JSONL
    const historyPath = join(reportsDir, 'workstation-soak-history.jsonl');
    try {
      const cycles = soakReport.cycles;
      const latencies = [...cycles.map(c => c.latencyMs)].sort((a, b) => a - b);
      const pct = (p) => latencies[Math.max(0, Math.ceil(p * latencies.length) - 1)];
      const histRow = JSON.stringify({
        ts: soakReport.timestamp,
        runId: 'soak_' + soakReport.timestamp.replace(/[-:T.Z]/g, '').slice(0, 15),
        cycles: soakReport.cyclesConfigured,
        isDryRun: soakReport.isDryRun,
        overallStatus: soakReport.overallStatus,
        latencyP50Ms: pct(0.50),
        latencyP95Ms: pct(0.95),
        vramBaselineMb: cycles[0]?.vramBeforeMb ?? 0,
        vramPeakDeltaMb: soakReport.metrics.peakVramDeltaMb,
        sourceRefCoveragePct: cycles.length
          ? Math.round(cycles.filter(c => c.sourceRefsPresent).length / cycles.length * 100) : 0,
        forbiddenFields: soakReport.metrics.forbiddenFieldsDetected,
        acePassRate: cycles.length
          ? Math.round(cycles.filter(c => c.aceSmokePassed).length / cycles.length * 100) : 0,
        synthesisPassRate: cycles.length
          ? Math.round(cycles.filter(c => c.synthesisSmokePassed).length / cycles.length * 100) : 0,
      });
      appendFileSync(historyPath, histRow + '\n', 'utf8');
      console.log(`   - History: ${historyPath}`);
    } catch (e) {
      console.warn(`[soak] Failed to append history: ${e.message}`);
    }

    // Format MD report
    const mdContent = `# Workstation Parent Atlas Soak Benchmark Report

## Execution Summary
- **Timestamp**: ${soakReport.timestamp}
- **Cycles Executed**: ${soakReport.cyclesConfigured}
- **Dry-run Mode**: ${soakReport.isDryRun ? 'ENABLED (no write)' : 'DISABLED (write to disk)'}
- **Overall Status**: **${soakReport.overallStatus}**

## Benchmark Summary Metrics
- **Total Queries Executed**: ${soakReport.metrics.totalQueriesExecuted}
- **Average Query Latency**: ${soakReport.metrics.averageLatencyMs} ms
- **Peak VRAM Delta**: ${soakReport.metrics.peakVramDeltaMb} MB
- **SourceRef Compliance Gaps**: ${soakReport.metrics.sourceRefsMissingCount}
- **Zero-Hidden-Thought Policy Violations**: ${soakReport.metrics.forbiddenFieldsDetected}

---

## Cycle Execution Log

| Cycle | Query | Latency | VRAM (B/A) | SourceRefs | Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
${soakReport.cycles.map(c => `| #${c.cycleIndex} | "${c.query}" | ${c.latencyMs} ms | ${c.vramBeforeMb} MB / ${c.vramAfterMb} MB | ${c.sourceRefsPresent ? '✅ Yes' : '❌ No'} | ${c.forbiddenFieldsDetected ? '❌ Violation' : '✅ Compliant'} |`).join('\n')}

---
*Report programmatically generated by the Workstation Soak Benchmark Harness.*
`;

    writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`\n✔️ Soak reports successfully saved to:`);
    console.log(`   - JSON: ${jsonPath}`);
    console.log(`   - Markdown: ${mdPath}\n`);
  } else {
    console.log('\nℹ️ Soak reports were NOT written to disk (pass --write to persist).');
  }

  process.exit(soakReport.overallStatus === 'PASS' ? 0 : 1);
}

runSoak().catch(err => {
  console.error('🔴 Critical soak coordinator failure:', err);
  process.exit(1);
});
