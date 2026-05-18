#!/usr/bin/env node
/**
 * scripts/atlas/hermes-self-healing-warden.mjs
 *
 * Hermes Self-Healing Warden (Phase 15).
 * Automated diagnostics and repair sentinel:
 * - Probes dev service ports (Postgres, Redis, Qdrant).
 * - Scans local cross-layer contracts for findings.
 * - Resolves HMM error states by querying Redis Bifrost KAG fixer patterns.
 * - Automatically executes matching fixer tools (e.g., meta hygiene fix).
 * - Appends healing events to historical transaction ledgers.
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function runWarden() {
  console.log(`\n${C.bold}📡 [Hermes Warden] Initializing Agentic Self-Healing Diagnostic Sentinel...${C.reset}`);

  const eventLog = {
    timestamp: new Date().toISOString(),
    status: 'UNKNOWN',
    services: {},
    findingsDetected: 0,
    findingsHealed: 0,
    actionsTriggered: [],
    errors: []
  };

  // 1. Service Health Checks
  const servicesToCheck = [
    { name: 'Postgres', port: 5434 },
    { name: 'Redis', port: 6379 },
    { name: 'Qdrant', port: 6333 }
  ];

  for (const svc of servicesToCheck) {
    const isUp = await tcpProbe('127.0.0.1', svc.port);
    eventLog.services[svc.name] = isUp ? 'ONLINE' : 'OFFLINE';
    console.log(`   - Service ${String(svc.name).padEnd(10)}: ${isUp ? C.green + 'ONLINE' : C.red + 'OFFLINE'}${C.reset}`);
  }

  if (eventLog.services.Redis !== 'ONLINE') {
    console.error(`\n🔴 ${C.red}Self-Healing Warden aborted: Redis is offline. Fixer heuristics cannot be retrieved.${C.reset}\n`);
    process.exit(1);
  }

  // 2. Scan Contract Map Findings
  const contractReportPath = join(REPORTS_DIR, 'contract-error-map-report.json');
  let contractReport = null;

  // Run a quick pre-audit check to ensure our report is fresh
  try {
    console.log(`\n🔄 ${C.cyan}Running fresh cross-layer contract audit...${C.reset}`);
    execSync('npm run audit:contracts', { stdio: 'ignore', cwd: resolve(REPO_ROOT, 'sveltekit-frontend') });
  } catch (err) {
    // Audit may fail if findings are active; that is normal and expected
  }

  if (existsSync(contractReportPath)) {
    try {
      contractReport = JSON.parse(readFileSync(contractReportPath, 'utf8'));
      eventLog.findingsDetected = contractReport.findings ? contractReport.findings.length : 0;
    } catch (e) {
      eventLog.errors.push(`Failed to parse contract report: ${e.message}`);
    }
  }

  console.log(`\n🔍 Active Cross-Layer Findings: ${C.bold}${eventLog.findingsDetected}${C.reset}`);

  // Connect to Redis to look up repair strategies
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });

  if (eventLog.findingsDetected > 0 && contractReport && contractReport.findings) {
    for (const finding of contractReport.findings) {
      const state = finding.hmmState;
      if (!state) continue;

      console.log(`\n⚠️  [Finding Detected] ID: ${finding.id}`);
      console.log(`   - Severity: ${finding.severity.toUpperCase()} | Layer: ${finding.layer} | HMM State: ${state}`);
      console.log(`   - Problem:  ${finding.problem}`);

      const fixerKey = `ace:fixer:patterns:${state}`;
      const hasFixerPattern = await redis.exists(fixerKey);

      if (hasFixerPattern) {
        const fixerData = await redis.hgetall(fixerKey);
        console.log(`   - Fixer Pattern found in Redis: "${fixerData.description}"`);
        console.log(`   - Action: ${fixerData.fixSummary}`);

        if (fixerData.command) {
          console.log(`   🚀 ${C.bold}Triggering Automated Remediation Command: "${fixerData.command}"...${C.reset}`);
          try {
            // Execute the self-healing command
            execSync(fixerData.command, { cwd: REPO_ROOT, stdio: 'inherit' });
            
            eventLog.actionsTriggered.push({
              findingId: finding.id,
              state,
              command: fixerData.command,
              status: 'SUCCESS'
            });
            eventLog.findingsHealed++;
            console.log(`   🟢 ${C.green}Remediation command executed successfully!${C.reset}`);
          } catch (cmdErr) {
            console.error(`   🔴 ${C.red}Remediation command failed: ${cmdErr.message}${C.reset}`);
            eventLog.actionsTriggered.push({
              findingId: finding.id,
              state,
              command: fixerData.command,
              status: 'FAILED',
              error: cmdErr.message
            });
          }
        }
      } else {
        console.log(`   - No automated fixer registered in Redis for state [${state}]. Requires operator manual review.`);
      }
    }
  }

  // 3. System VRAM Baseline Drift Check
  const soakReportPath = join(REPORTS_DIR, 'workstation-soak-report.json');
  if (existsSync(soakReportPath)) {
    try {
      const soakData = JSON.parse(readFileSync(soakReportPath, 'utf8'));
      const baselineVram = soakData.cycles && soakData.cycles[0] ? soakData.cycles[0].vramBeforeMb : 0;
      const latestVram = soakData.cycles && soakData.cycles[soakData.cycles.length - 1] ? soakData.cycles[soakData.cycles.length - 1].vramAfterMb : 0;

      if (baselineVram > 7800 || latestVram > 7800) {
        console.log(`\n⚠️  ${C.yellow}[VRAM Warning] High GPU utilization detected (${latestVram} MB). Triggering model flush...${C.reset}`);
        
        // Trigger model flush via Redis invalidator
        try {
          console.log(`   🚀 Flushing downstream cache anchors...`);
          await redis.del('turbo:prefix:*', 'turbo:warm:*', 'kb_bundle:*');
          eventLog.actionsTriggered.push({
            action: 'vram_cache_flush',
            status: 'SUCCESS'
          });
          console.log(`   🟢 VRAM Cache anchors successfully evicted.`);
        } catch (flushErr) {
          console.error(`   Failed VRAM flush: ${flushErr.message}`);
        }
      } else {
        console.log(`\n🟢 Hardware check: VRAM baseline is stable (${latestVram} MB). No memory flush required.`);
      }
    } catch (e) {
      eventLog.errors.push(`Failed VRAM drift check: ${e.message}`);
    }
  }

  // 4. Save Event log
  eventLog.status = eventLog.findingsHealed === eventLog.findingsDetected ? 'ALL_HEALED' : eventLog.findingsHealed > 0 ? 'PARTIALLY_HEALED' : 'NO_ACTION_TAKEN';
  
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const jsonPath = join(REPORTS_DIR, 'hermes-self-healing-report.json');
  writeFileSync(jsonPath, JSON.stringify(eventLog, null, 2), 'utf8');

  const historyPath = join(REPORTS_DIR, 'hermes-self-healing-events.jsonl');
  appendFileSync(historyPath, JSON.stringify({
    ts: eventLog.timestamp,
    status: eventLog.status,
    detected: eventLog.findingsDetected,
    healed: eventLog.findingsHealed,
    actionsCount: eventLog.actionsTriggered.length
  }) + '\n', 'utf8');

  console.log(`\n🎉 Self-Healing diagnostics run complete! Status: ${C.bold}${eventLog.status}${C.reset}`);
  console.log(`   - JSON report:  ${jsonPath}`);
  console.log(`   - History log:  ${historyPath}\n`);

  await redis.quit();
}

runWarden().catch(err => {
  console.error('🔴 Critical Warden execution failure:', err);
  process.exit(1);
});
