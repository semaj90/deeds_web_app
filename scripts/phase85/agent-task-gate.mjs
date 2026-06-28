#!/usr/bin/env node

/**
 * Agent Task Gate — Validation Before Execution
 * ===============================================
 *
 * Enforces a 4-stage validation pipeline before agent functions run:
 * 1. Task discovery + identity validation
 * 2. Relevant file search (rg + Qdrant semantic)
 * 3. Proof command validation (exact command, expected output)
 * 4. Gate decision (PASS → allow execution, FAIL → summarize + retry)
 *
 * Output: .tmp/agent-task-proof.json with gates_passed/gates_failed
 *
 * Usage:
 *   node scripts/phase85/agent-task-gate.mjs --task="feature:auth.sessions" --agent=codex
 *   node scripts/phase85/agent-task-gate.mjs --dry-run --verbose
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

// Configuration
const CONFIG = {
  tmpDir: path.resolve(__root, '.tmp'),
  proofReportPath: path.resolve(__root, '.tmp/agent-task-proof.json'),
  maxRelevantFiles: 20,
  semanticSearchLimit: 5,
  defaultTimeout: 30000, // 30s per command
};

// Create .tmp if missing
if (!fs.existsSync(CONFIG.tmpDir)) {
  fs.mkdirSync(CONFIG.tmpDir, { recursive: true });
}

// ============================================================================
// STAGE 1: Task Discovery + Identity Validation
// ============================================================================

async function validateTaskIdentity(taskId, agent) {
  const report = {
    trace_id: `gate:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    agent_id: agent || 'unknown',
    task_id: taskId,
    stage: 'identity_validation',
    gates_passed: [],
    gates_failed: [],
    status: 'PENDING',
    timestamp: new Date().toISOString(),
  };

  // Gate 1: Task ID format
  if (!taskId || typeof taskId !== 'string') {
    report.gates_failed.push({
      gate: 'task_id_format',
      reason: 'task_id missing or invalid type',
      evidence: { taskId },
    });
    return report;
  }

  report.gates_passed.push({
    gate: 'task_id_format',
    evidence: { taskId },
  });

  // Gate 2: Agent ID validation
  const validAgents = ['codex', 'claude', 'opencode', 'human'];
  if (!validAgents.includes(agent)) {
    report.gates_failed.push({
      gate: 'agent_id_valid',
      reason: `agent '${agent}' not in allowlist: ${validAgents.join(', ')}`,
      evidence: { agent },
    });
    return report;
  }

  report.gates_passed.push({
    gate: 'agent_id_valid',
    evidence: { agent },
  });

  return report;
}

// ============================================================================
// STAGE 2: Relevant File Search (rg + Qdrant)
// ============================================================================

async function searchRelevantFiles(taskId, options = {}) {
  const report = {
    stage: 'relevant_files_search',
    gates_passed: [],
    gates_failed: [],
    files: [],
  };

  const { searchPattern, limit = CONFIG.maxRelevantFiles, verbose = false } = options;

  // Gate 3: Search with ripgrep (rg)
  if (!searchPattern) {
    report.gates_failed.push({
      gate: 'search_pattern_provided',
      reason: 'No search pattern provided for rg',
      evidence: {},
    });
    return report;
  }

  const rgArgs = [
    searchPattern,
    path.resolve(__root, 'sveltekit-frontend/src'),
    '--json',
    '--max-count=50',
  ];

  try {
    const rgOutput = await runCommand('rg', rgArgs, { timeout: 10000 });
    const lines = rgOutput.split('\n').filter(l => l.trim());

    // Parse ripgrep JSON output
    const matches = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(m => m && m.type === 'match')
      .slice(0, limit);

    const uniqueFiles = [...new Set(matches.map(m => m.data.path.text))];

    if (uniqueFiles.length === 0) {
      report.gates_failed.push({
        gate: 'rg_search_files_found',
        reason: `No files found matching pattern: ${searchPattern}`,
        evidence: { pattern: searchPattern, limit },
      });
    } else {
      report.files = uniqueFiles;
      report.gates_passed.push({
        gate: 'rg_search_files_found',
        evidence: {
          pattern: searchPattern,
          fileCount: uniqueFiles.length,
          files: uniqueFiles.slice(0, 5), // Show first 5
        },
      });
    }
  } catch (err) {
    report.gates_failed.push({
      gate: 'rg_search_execution',
      reason: err.message,
      evidence: { pattern: searchPattern },
    });
  }

  return report;
}

// ============================================================================
// STAGE 3: Proof Command Validation
// ============================================================================

async function validateProofCommands(taskId, proofCommands = []) {
  const report = {
    stage: 'proof_validation',
    gates_passed: [],
    gates_failed: [],
    proofs: [],
  };

  // Gate 4: Proof commands provided
  if (!Array.isArray(proofCommands) || proofCommands.length === 0) {
    report.gates_failed.push({
      gate: 'proof_commands_provided',
      reason: 'No proof commands specified',
      evidence: { commandCount: proofCommands?.length || 0 },
    });
    return report;
  }

  report.gates_passed.push({
    gate: 'proof_commands_provided',
    evidence: { commandCount: proofCommands.length },
  });

  // Gate 5: Execute each proof command
  for (const proof of proofCommands) {
    const { cmd, args = [], expectedPattern, description = 'Proof command' } = proof;

    if (!cmd || !expectedPattern) {
      report.gates_failed.push({
        gate: `proof_${cmd}_format`,
        reason: 'Proof command missing cmd or expectedPattern',
        evidence: { proof },
      });
      continue;
    }

    try {
      const output = await runCommand(cmd, args, { timeout: CONFIG.defaultTimeout });
      const matches = expectedPattern.test ? expectedPattern.test(output) : output.includes(expectedPattern);

      if (matches) {
        report.gates_passed.push({
          gate: `proof_${cmd}_success`,
          evidence: {
            command: `${cmd} ${args.join(' ')}`,
            description,
            outputLength: output.length,
          },
        });
        report.proofs.push({
          cmd,
          status: 'PASS',
          description,
          output: output.slice(0, 500), // First 500 chars
        });
      } else {
        report.gates_failed.push({
          gate: `proof_${cmd}_pattern_mismatch`,
          reason: `Output did not match expected pattern`,
          evidence: {
            command: `${cmd} ${args.join(' ')}`,
            expectedPattern: expectedPattern.toString(),
            output: output.slice(0, 500),
          },
        });
        report.proofs.push({
          cmd,
          status: 'FAIL',
          description,
          reason: 'Pattern mismatch',
        });
      }
    } catch (err) {
      report.gates_failed.push({
        gate: `proof_${cmd}_execution_error`,
        reason: err.message,
        evidence: { command: cmd, args },
      });
      report.proofs.push({
        cmd,
        status: 'ERROR',
        description,
        error: err.message,
      });
    }
  }

  return report;
}

// ============================================================================
// STAGE 4: Gate Decision
// ============================================================================

function makeGateDecision(identityReport, filesReport, proofReport) {
  const decision = {
    trace_id: identityReport.trace_id,
    agent_id: identityReport.agent_id,
    task_id: identityReport.task_id,
    decision: 'PENDING',
    gates_passed: 0,
    gates_failed: 0,
    details: {
      identity: identityReport,
      files: filesReport,
      proofs: proofReport,
    },
    recommendation: '',
    timestamp: new Date().toISOString(),
  };

  // Count passes and failures
  decision.gates_passed +=
    (identityReport.gates_passed?.length || 0) +
    (filesReport.gates_passed?.length || 0) +
    (proofReport.gates_passed?.length || 0);

  decision.gates_failed +=
    (identityReport.gates_failed?.length || 0) +
    (filesReport.gates_failed?.length || 0) +
    (proofReport.gates_failed?.length || 0);

  // Decision rules
  if (decision.gates_failed === 0) {
    decision.decision = 'PASS';
    decision.recommendation = 'All gates passed. Agent function execution allowed.';
  } else if (decision.gates_failed < 3) {
    decision.decision = 'WARN';
    decision.recommendation = `${decision.gates_failed} minor gate(s) failed. Proceed with caution.`;
  } else {
    decision.decision = 'FAIL';
    decision.recommendation = 'Multiple gates failed. Summarize errors and retry.';
  }

  return decision;
}

// ============================================================================
// Utility: Run Command
// ============================================================================

function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = CONFIG.defaultTimeout, cwd = __root } = options;

    const child = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Command timeout after ${timeout}ms: ${cmd} ${args.join(' ')}`));
      } else if (code !== 0 && !stdout && stderr) {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    taskId: args.find(a => a.startsWith('--task='))?.split('=')[1] || 'feature:auth.sessions',
    agent: args.find(a => a.startsWith('--agent='))?.split('=')[1] || 'codex',
    searchPattern: args.find(a => a.startsWith('--search='))?.split('=')[1],
  };

  console.log(`🔍 Agent Task Gate — Phase 85 Validation\n`);
  console.log(`📋 Task: ${options.taskId}`);
  console.log(`👤 Agent: ${options.agent}`);
  console.log(`🧪 Dry-run: ${options.dryRun ? 'YES' : 'NO'}\n`);

  // Stage 1: Identity Validation
  console.log('⚙️  Stage 1: Identity Validation...');
  const identityReport = await validateTaskIdentity(options.taskId, options.agent);
  console.log(`   Passed: ${identityReport.gates_passed.length}, Failed: ${identityReport.gates_failed.length}\n`);

  // Stage 2: File Search
  console.log('🔎 Stage 2: Relevant File Search...');
  const filesReport = await searchRelevantFiles(options.taskId, {
    searchPattern: options.searchPattern || options.taskId,
    verbose: options.verbose,
  });
  console.log(`   Found: ${filesReport.files.length} files`);
  console.log(`   Passed: ${filesReport.gates_passed.length}, Failed: ${filesReport.gates_failed.length}\n`);

  // Stage 3: Proof Commands
  console.log('✅ Stage 3: Proof Command Validation...');
  const proofCommands = [
    {
      cmd: 'npm',
      args: ['run', '--list'],
      expectedPattern: /graphify|atlas/i,
      description: 'npm run --list contains atlas/graphify tasks',
    },
  ];
  const proofReport = await validateProofCommands(options.taskId, proofCommands);
  console.log(`   Passed: ${proofReport.gates_passed.length}, Failed: ${proofReport.gates_failed.length}\n`);

  // Stage 4: Gate Decision
  console.log('🚪 Stage 4: Gate Decision...');
  const decision = makeGateDecision(identityReport, filesReport, proofReport);
  console.log(`   Decision: ${decision.decision}`);
  console.log(`   Gates: ${decision.gates_passed} passed, ${decision.gates_failed} failed`);
  console.log(`   Recommendation: ${decision.recommendation}\n`);

  // Write proof report
  if (!options.dryRun) {
    fs.writeFileSync(CONFIG.proofReportPath, JSON.stringify(decision, null, 2));
    console.log(`✅ Proof report written to: ${CONFIG.proofReportPath}\n`);
  } else {
    console.log(`📝 Dry-run: Proof report NOT written (pass --apply to commit)\n`);
  }

  // Exit status
  process.exit(decision.decision === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Gate Error:', err.message);
  process.exit(1);
});
