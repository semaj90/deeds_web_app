#!/usr/bin/env node
/**
 * scripts/atlas/project-clusters-neo4j.mjs
 * 
 * Projects task-to-cluster relationships into Neo4j.
 */

import neo4j from 'neo4j-driver';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const NEO4J_URL = process.env.NEO4J_URL;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASS = process.env.NEO4J_PASSWORD;
const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates-v2.json');
const ALIASES_FILE = resolve(process.cwd(), 'docs/graph/cluster-aliases.json');

function loadAliases() {
  if (!existsSync(ALIASES_FILE)) return {};
  try { return JSON.parse(readFileSync(ALIASES_FILE, 'utf-8')); } catch { return {}; }
}

async function main() {
  if (!NEO4J_URL || !NEO4J_USER || !NEO4J_PASS) throw new Error('NEO4J_URL, NEO4J_USER, and NEO4J_PASSWORD are required');
  console.log('🚀 Atlas: Projecting Tasks to Neo4j...');

  if (!existsSync(DISTILLATES_FILE)) {
    console.error(`❌ Distillates file not found: ${DISTILLATES_FILE}`);
    process.exit(1);
  }

  const distillates = JSON.parse(readFileSync(DISTILLATES_FILE, 'utf-8'));
  const aliases = loadAliases();
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session();

  try {
    for (const task of distillates) {
      console.log(`   Projecting Task: ${task.task_key}`);
      
      // Create Task node
      await session.run(`
        MERGE (t:Task {key: $key})
        SET t.summary = $summary, t.actions = $actions
      `, {
        key: task.task_key,
        summary: task.summary,
        actions: task.recommended_actions
      });

      // Link to Clusters
      if (task.clusters) {
        for (const clusterId of task.clusters) {
          const alias = aliases[String(clusterId)]?.alias ?? null;
          const topic = aliases[String(clusterId)]?.topic ?? null;
          await session.run(`
            MATCH (t:Task {key: $key})
            MERGE (c:Cluster {id: $clusterId})
            SET c.alias = coalesce(c.alias, $alias), c.topic = coalesce(c.topic, $topic)
            MERGE (t)-[:USES_CLUSTER]->(c)
          `, {
            key: task.task_key,
            clusterId: parseInt(clusterId, 10),
            alias,
            topic,
          });
        }
      }
    }
    console.log('✅ Tasks projected to Neo4j.');
  } catch (err) {
    console.error(`❌ Neo4j Error: ${err.message}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
