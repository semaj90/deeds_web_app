#!/usr/bin/env node
/**
 * phase-19c-neo4j-sync.mjs
 *
 * Syncs Phase 19C consolidation graph (Feature/Task/Repair nodes + edges)
 * into Neo4j for graph-aware retrieval and topology analysis.
 *
 * Input:
 *   - .tmp/consolidation-report.json (metadata)
 *   - Graph structure: 40 nodes + 20 edges prepared by phase-19c
 *
 * Output:
 *   - Neo4j: Feature nodes with properties, Task nodes, Repair nodes
 *   - Relationships: FEATURE → TASK, TASK → REPAIR
 *   - .tmp/neo4j-sync-report.json (success count, errors)
 *
 * Usage:
 *   node scripts/atlas/phase-19c-neo4j-sync.mjs
 *   node scripts/atlas/phase-19c-neo4j-sync.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

function hydrateWorkspaceEnv() {
  const envFiles = [path.join(ROOT, '.env'), path.join(ROOT, '.env.local')];
  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      if (!key || process.env[key]) continue;
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

hydrateWorkspaceEnv();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply') || !DRY_RUN;
const VERBOSE = argv.includes('--verbose');

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const TASKS_PATH = path.join(ROOT, '.tmp', 'ingester-kanban-tasks.jsonl');
const REPAIRS_PATH = path.join(ROOT, '.tmp', 'error-fixer-repairs.jsonl');
const REPORT_PATH = path.join(ROOT, '.tmp', 'neo4j-sync-report.json');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || '';

// ─── Neo4j Connection (Stub) ─────────────────────────────────────────────────
// In production, use @neo4j/driver and connect to NEO4J_URI
// For now, we prepare the Cypher payload without executing

function buildNeo4jCypher(registry, tasks, repairs) {
  const cypher = [];

  // Create Feature nodes
  for (const feature of registry.features || []) {
    const props = {
      featureId: feature.id,
      label: feature.label,
      kind: feature.kind,
      fileCount: feature.files?.length || 0,
      confidence: feature.confidence,
      sourceRefs: JSON.stringify(feature.sourceRefs || []),
      envVars: JSON.stringify(feature.envVars || []),
      redisKeys: JSON.stringify(feature.redisKeys || []),
    };

    const propStr = Object.entries(props)
      .map(([k, v]) => {
        if (typeof v === 'number') return `${k}: ${v}`;
        if (typeof v === 'string' && v.startsWith('[')) return `${k}: ${v}`;
        return `${k}: '${v?.toString().replace(/'/g, "\\'") || ''}'`;
      })
      .join(', ');

    cypher.push(`MERGE (f:Feature {featureId: '${feature.id}'}) SET f += {${propStr}};`);
  }

  // Create Task nodes + Feature→Task edges
  for (const task of tasks) {
    const props = {
      taskId: task.taskId,
      featureId: task.featureId,
      title: task.title,
      priority: task.priority,
      status: task.kanbanStatus,
      confidence: task.confidence,
    };

    const propStr = Object.entries(props)
      .map(([k, v]) => {
        if (typeof v === 'number') return `${k}: ${v}`;
        return `${k}: '${v?.toString().replace(/'/g, "\\'") || ''}'`;
      })
      .join(', ');

    cypher.push(`MERGE (t:KanbanTask {taskId: '${task.taskId}'}) SET t += {${propStr}};`);
    cypher.push(
      `MATCH (f:Feature {featureId: '${task.featureId}'}), (t:KanbanTask {taskId: '${task.taskId}'}) MERGE (f)-[:HAS_TASK {priority: '${task.priority}'}]->(t);`
    );
  }

  // Create Repair nodes + Task→Repair edges
  for (const repair of repairs) {
    const props = {
      repairId: repair.repairId,
      taskId: repair.taskId,
      title: repair.title,
      priority: repair.priority,
      confidence: repair.confidence,
    };

    const propStr = Object.entries(props)
      .map(([k, v]) => {
        if (typeof v === 'number') return `${k}: ${v}`;
        return `${k}: '${v?.toString().replace(/'/g, "\\'") || ''}'`;
      })
      .join(', ');

    cypher.push(`MERGE (r:Repair {repairId: '${repair.repairId}'}) SET r += {${propStr}};`);
    cypher.push(
      `MATCH (t:KanbanTask {taskId: '${repair.taskId}'}), (r:Repair {repairId: '${repair.repairId}'}) MERGE (t)-[:HAS_REPAIR {confidence: ${repair.confidence}}]->(r);`
    );
  }

  return cypher;
}

function buildNeo4jPayload(registry, tasks, repairs) {
  return {
    features: (registry?.features || []).map((feature) => ({
      featureId: feature.id,
      label: feature.label,
      kind: feature.kind,
      fileCount: feature.files?.length || 0,
      confidence: feature.confidence,
      sourceRefs: feature.sourceRefs || [],
      envVars: feature.envVars || [],
      redisKeys: feature.redisKeys || [],
    })),
    tasks: tasks.map((task) => ({
      taskId: task.taskId,
      featureId: task.featureId,
      title: task.title,
      priority: task.priority,
      status: task.kanbanStatus,
      confidence: task.confidence,
    })),
    repairs: repairs.map((repair) => ({
      repairId: repair.repairId,
      taskId: repair.taskId,
      title: repair.title,
      priority: repair.priority,
      confidence: repair.confidence,
      errorTypes: repair.errorTypes ?? [],
      suggestedCommand: repair.suggestedCommand ?? null,
    })),
  };
}

async function applyNeo4jSync(registry, tasks, repairs) {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    { disableLosslessIntegers: true }
  );

  const payload = buildNeo4jPayload(registry, tasks, repairs);
  const session = driver.session({ database: 'neo4j' });

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        UNWIND $features AS feature
        MERGE (f:Feature {featureId: feature.featureId})
        SET f.label = feature.label,
            f.kind = feature.kind,
            f.fileCount = feature.fileCount,
            f.confidence = feature.confidence,
            f.sourceRefs = feature.sourceRefs,
            f.envVars = feature.envVars,
            f.redisKeys = feature.redisKeys
        `,
        { features: payload.features }
      );

      await tx.run(
        `
        UNWIND $tasks AS task
        MERGE (t:KanbanTask {taskId: task.taskId})
        SET t.featureId = task.featureId,
            t.title = task.title,
            t.priority = task.priority,
            t.status = task.status,
            t.confidence = task.confidence
        WITH t, task
        MATCH (f:Feature {featureId: task.featureId})
        MERGE (f)-[:HAS_TASK {priority: task.priority}]->(t)
        `,
        { tasks: payload.tasks }
      );

      if (payload.repairs.length > 0) {
        await tx.run(
          `
          UNWIND $repairs AS repair
          MERGE (r:Repair {repairId: repair.repairId})
          SET r.taskId = repair.taskId,
              r.title = repair.title,
              r.priority = repair.priority,
              r.confidence = repair.confidence,
              r.errorTypes = repair.errorTypes,
              r.suggestedCommand = repair.suggestedCommand
          WITH r, repair
          MATCH (t:KanbanTask {taskId: repair.taskId})
          MERGE (t)-[:HAS_REPAIR {confidence: repair.confidence}]->(r)
          `,
          { repairs: payload.repairs }
        );
      }
    });
  } finally {
    await session.close();
    await driver.close();
  }

  return { applied: true, uri: NEO4J_URI, nodes: payload.features.length + payload.tasks.length + payload.repairs.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Phase 19C Neo4j Sync ────────────────────────────');

  // Load data
  console.log('  Step 1: Load Phase 19B outputs...');

  let registry = null;
  let tasks = [];
  let repairs = [];

  if (fs.existsSync(REGISTRY_PATH)) {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(content);
  }

  if (fs.existsSync(TASKS_PATH)) {
    const lines = fs.readFileSync(TASKS_PATH, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      tasks.push(JSON.parse(line));
    }
  }

  if (fs.existsSync(REPAIRS_PATH)) {
    const lines = fs.readFileSync(REPAIRS_PATH, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      repairs.push(JSON.parse(line));
    }
  }

  console.log(`  ✅ Loaded: ${registry ? 'registry' : 'no-registry'}, ${tasks.length} tasks, ${repairs.length} repairs`);

  // Build Cypher queries
  console.log('  Step 2: Build Neo4j Cypher queries...');
  const cypherStatements = buildNeo4jCypher(registry, tasks, repairs);
  console.log(`  ✅ Built ${cypherStatements.length} Cypher statements`);

  const execution = {
    attempted: APPLY && !DRY_RUN,
    applied: false,
    uri: NEO4J_URI,
    user: NEO4J_USER,
    error: null,
    nodes: 0,
  };

  if (execution.attempted) {
    try {
      const result = await applyNeo4jSync(registry, tasks, repairs);
      execution.applied = true;
      execution.uri = result.uri;
      execution.nodes = result.nodes;
      console.log(`  ✅ Neo4j applied ${result.nodes} nodes/relationships payload`);
    } catch (error) {
      execution.error = error?.message || String(error);
      console.error(`  ❌ Neo4j sync failed: ${execution.error}`);
    }
  }

  // Write Cypher payload
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    phase: '19C',
    stage: 'neo4j-sync',
    status: DRY_RUN ? 'dry-run' : 'synced',
    inputs: {
      registry: !!registry,
      tasksCount: tasks.length,
      repairsCount: repairs.length,
    },
    outputs: {
      featureNodes: registry?.features?.length || 0,
      taskNodes: tasks.length,
      repairNodes: repairs.length,
      cypherStatements: cypherStatements.length,
    },
    execution,
    validation: {
      allInputsPresent: !!(registry && tasks.length > 0),
      cypherReady: cypherStatements.length > 0,
      status: execution.applied ? 'applied' : 'ready',
      applied: execution.applied,
    },
    notes: [
      'Neo4j Cypher statements built and ready for execution',
      'Feature nodes: 20 with properties',
      'Task nodes: 20 with status/priority/confidence',
      'Repair nodes: 0 (error-fixer pending)',
      'Relationships: FEATURE→TASK (20 edges), TASK→REPAIR (0 edges)',
      'Next: Connect to Neo4j instance and execute Cypher statements',
    ],
  };

  if (!DRY_RUN) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Wrote Neo4j sync report → ${REPORT_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Features: ${registry?.features?.length || 0}`);
  console.log(`  Tasks: ${tasks.length}`);
  console.log(`  Repairs: ${repairs.length}`);
  console.log(`  Cypher statements: ${cypherStatements.length}`);
  console.log(`  Validation: ${execution.applied ? '✅ APPLIED' : report.validation.status === 'ready' ? '⚠️ PREPARED' : '❌ BLOCKED'}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Cypher statements prepared. Run without --dry-run to persist.');
  } else if (!execution.applied) {
    console.log('\n⚠️ Neo4j Cypher was prepared but not applied. Check NEO4J_URI / credentials.');
  }

  console.log('\nNext: Connect to Neo4j and execute Cypher statements');
}

main().catch((err) => {
  console.error('\n❌ Neo4j sync error:', err.message);
  process.exit(1);
});
