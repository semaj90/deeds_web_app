#!/usr/bin/env node
/**
 * smoke-unified-ingester.mjs
 *
 * Validates unified codebase ingester outputs.
 *
 * Checks:
 * - Enriched features JSON exists and parses
 * - Kanban tasks JSONL exists and is valid
 * - Validation report exists
 * - All task cards have required fields
 * - Retrieval-loop was appended
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const ENRICHED_PATH = path.join(ROOT, '.tmp', 'ingester-enriched-features.json');
const TASKS_PATH = path.join(ROOT, '.tmp', 'ingester-kanban-tasks.jsonl');
const REPORT_PATH = path.join(ROOT, '.tmp', 'ingester-validation-report.json');
const RETRIEVAL_LOOP_PATH = path.join(ROOT, '.tmp', 'atlas-retrieval-loop.jsonl');

const checks = [];
function check(name, pass, details = '') {
  checks.push({ name, pass, details });
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon} ${name}${details ? ` — ${details}` : ''}`);
}

async function main() {
  console.log('\n── Smoke Test: Unified Ingester ─────────────────────────────');

  // Check 1: Enriched features file
  const enrichedExists = fs.existsSync(ENRICHED_PATH);
  check('Enriched features file exists', enrichedExists, ENRICHED_PATH);

  let enrichedFeatures = null;
  if (enrichedExists) {
    try {
      const content = fs.readFileSync(ENRICHED_PATH, 'utf8');
      enrichedFeatures = JSON.parse(content);
      check('Enriched features JSON parses', true);
    } catch (e) {
      check('Enriched features JSON parses', false, e.message);
    }
  }

  // Check 2: Kanban tasks file
  const tasksExists = fs.existsSync(TASKS_PATH);
  check('Kanban tasks file exists', tasksExists, TASKS_PATH);

  let taskCount = 0;
  if (tasksExists) {
    try {
      const content = fs.readFileSync(TASKS_PATH, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        JSON.parse(line);
      }
      taskCount = lines.length;
      check('Kanban tasks JSONL parses', true, `${taskCount} tasks`);
    } catch (e) {
      check('Kanban tasks JSONL parses', false, e.message);
    }
  }

  // Check 3: Validation report
  const reportExists = fs.existsSync(REPORT_PATH);
  check('Validation report exists', reportExists, REPORT_PATH);

  let reportPass = false;
  if (reportExists) {
    try {
      const content = fs.readFileSync(REPORT_PATH, 'utf8');
      const report = JSON.parse(content);
      reportPass = report.pass;
      check('Validation report pass', reportPass, `${report.checks.errors.length} errors`);
    } catch (e) {
      check('Validation report valid', false, e.message);
    }
  }

  // Check 4: Task card fields
  let allTasksValid = true;
  const requiredFields = ['taskId', 'featureId', 'title', 'description', 'kanbanStatus', 'priority', 'confidence'];
  if (tasksExists && taskCount > 0) {
    try {
      const content = fs.readFileSync(TASKS_PATH, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const task = JSON.parse(line);
        const missing = requiredFields.filter((f) => !(f in task));
        if (missing.length > 0) {
          allTasksValid = false;
          check(`Task ${task.taskId} complete`, false, `missing: ${missing.join(', ')}`);
          break;
        }
      }
      if (allTasksValid) {
        check(`All ${taskCount} task cards have required fields`, true);
      }
    } catch (e) {
      check('Task validation', false, e.message);
    }
  }

  // Check 5: Retrieval-loop append
  const retrieval_loop_exists = fs.existsSync(RETRIEVAL_LOOP_PATH);
  check('Retrieval-loop file exists', retrieval_loop_exists);

  let retrieval_loop_appended = false;
  if (retrieval_loop_exists) {
    try {
      const content = fs.readFileSync(RETRIEVAL_LOOP_PATH, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];
      const lastEntry = JSON.parse(lastLine);
      if (lastEntry.tool === 'unified_ingester' && lastEntry.outcome === 'success') {
        retrieval_loop_appended = true;
      }
      check('Retrieval-loop appended', retrieval_loop_appended, `tool: ${lastEntry.tool}, outcome: ${lastEntry.outcome}`);
    } catch (e) {
      check('Retrieval-loop append check', false, e.message);
    }
  }

  // Summary
  const passCount = checks.filter((c) => c.pass).length;
  const totalCount = checks.length;
  console.log(`\n── Summary ────────────────────────────────────────────────`);
  console.log(`  ${passCount}/${totalCount} checks passed`);

  if (passCount === totalCount) {
    console.log('\n✅ Unified ingester smoke test PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Unified ingester smoke test FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
