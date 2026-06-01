#!/usr/bin/env node
/**
 * smoke-phase19c-consolidation.mjs
 *
 * Validates Phase 19C consolidation outputs.
 *
 * Checks:
 * - Feature registry exists and parses
 * - Kanban tasks JSONL exists and is valid
 * - Consolidation report exists and validation passed
 * - Neo4j sync report generated
 * - Qdrant index report generated
 * - Retrieval-loop has consolidation rows
 * - All outputs have required schema
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const TASKS_PATH = path.join(ROOT, '.tmp', 'ingester-kanban-tasks.jsonl');
const CONSOLIDATION_REPORT_PATH = path.join(ROOT, '.tmp', 'consolidation-report.json');
const NEO4J_REPORT_PATH = path.join(ROOT, '.tmp', 'neo4j-sync-report.json');
const QDRANT_REPORT_PATH = path.join(ROOT, '.tmp', 'qdrant-index-report.json');
const RETRIEVAL_LOOP_PATH = path.join(ROOT, '.tmp', 'atlas-retrieval-loop.jsonl');

const checks = [];
function check(name, pass, details = '') {
  checks.push({ name, pass, details });
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon} ${name}${details ? ` — ${details}` : ''}`);
}

async function main() {
  console.log('\n── Smoke Test: Phase 19C Consolidation ────────────────');

  // Check 1: Feature registry exists and parses
  const registryExists = fs.existsSync(REGISTRY_PATH);
  check('Feature registry file exists', registryExists, REGISTRY_PATH);

  let registry = null;
  if (registryExists) {
    try {
      const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
      registry = JSON.parse(content);
      check('Feature registry JSON parses', true, `${registry.features?.length || 0} features`);
    } catch (e) {
      check('Feature registry JSON parses', false, e.message);
    }
  }

  // Check 2: Kanban tasks file exists and is valid
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

  // Check 3: Consolidation report exists and validation passed
  const consolidationExists = fs.existsSync(CONSOLIDATION_REPORT_PATH);
  check('Consolidation report exists', consolidationExists, CONSOLIDATION_REPORT_PATH);

  let consolidationValid = false;
  if (consolidationExists) {
    try {
      const content = fs.readFileSync(CONSOLIDATION_REPORT_PATH, 'utf8');
      const report = JSON.parse(content);
      consolidationValid =
        report.status === 'consolidated' &&
        report.validation.allInputsPresent &&
        report.validation.caveman_rule_complete;
      check('Consolidation report validation', consolidationValid, `status: ${report.status}`);
      if (report.execution) {
        check(
          'Consolidation execution applied',
          Boolean(report.execution.applied),
          `attempted: ${Boolean(report.execution.attempted)}`
        );
      }
    } catch (e) {
      check('Consolidation report valid', false, e.message);
    }
  }

  // Check 4: Neo4j sync report generated
  const neo4jExists = fs.existsSync(NEO4J_REPORT_PATH);
  check('Neo4j sync report exists', neo4jExists, NEO4J_REPORT_PATH);

  let neo4jReady = false;
  if (neo4jExists) {
    try {
      const content = fs.readFileSync(NEO4J_REPORT_PATH, 'utf8');
      const report = JSON.parse(content);
      neo4jReady = report.validation.cypherReady && report.validation.applied;
      check(
        'Neo4j Cypher queries applied',
        neo4jReady,
        `${report.outputs.cypherStatements} statements`
      );
    } catch (e) {
      check('Neo4j sync report valid', false, e.message);
    }
  }

  // Check 5: Qdrant index report generated
  const qdrantExists = fs.existsSync(QDRANT_REPORT_PATH);
  check('Qdrant index report exists', qdrantExists, QDRANT_REPORT_PATH);

  let qdrantReady = false;
  if (qdrantExists) {
    try {
      const content = fs.readFileSync(QDRANT_REPORT_PATH, 'utf8');
      const report = JSON.parse(content);
      qdrantReady = report.validation.payloadsReady && report.validation.applied;
      check('Qdrant payloads applied', qdrantReady, `${report.outputs.payloadsBuilt} payloads`);
    } catch (e) {
      check('Qdrant index report valid', false, e.message);
    }
  }

  // Check 6: Retrieval-loop appended
  const retrievalLoopExists = fs.existsSync(RETRIEVAL_LOOP_PATH);
  check('Retrieval-loop file exists', retrievalLoopExists, RETRIEVAL_LOOP_PATH);

  let consolidationAppended = false;
  if (retrievalLoopExists) {
    try {
      const content = fs.readFileSync(RETRIEVAL_LOOP_PATH, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      consolidationAppended = lines.some((line) => {
        try {
          const entry = JSON.parse(line);
          return (
            (entry.domain === 'atlas-pipeline' && entry.intent === 'consolidation') ||
            entry.tool === 'knowledge_consolidation'
          );
        } catch {
          return false;
        }
      });

      check('Consolidation rows appended', consolidationAppended, `${lines.length} total rows`);
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
    console.log('\n✅ Phase 19C consolidation smoke test PASSED');
    console.log('\nStatus: All consolidation outputs valid and ready for Neo4j/Qdrant sync');
    process.exit(0);
  } else {
    console.log('\n❌ Phase 19C consolidation smoke test FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});
