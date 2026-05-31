import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

const outPath = path.join(FRONTEND_ROOT, '.tmp', 'neo4j-context-graph.json');

async function main() {
  console.log(`🌐 Querying Neo4j Graph Topology to construct Contextual JSON...`);
  
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    await driver.verifyConnectivity();
    console.log('✓ Connected to Neo4j');
  } catch (e) {
    console.error('✗ Cannot connect to Neo4j:', e.message);
    process.exit(1);
  }

  const session = driver.session();
  const contextGraph = {
    files: [],
    tables: [],
    tools: [],
    relationships: []
  };

  try {
    // 1. Get Codebase Files
    const filesRes = await session.run('MATCH (f:CodebaseFile) RETURN f.filePath AS path LIMIT 500');
    contextGraph.files = filesRes.records.map(r => r.get('path'));

    // 2. Get DB Tables
    const tablesRes = await session.run('MATCH (t:DBTable) RETURN t.name AS name LIMIT 100');
    contextGraph.tables = tablesRes.records.map(r => r.get('name'));

    // 3. Get Tools
    const toolsRes = await session.run('MATCH (t:Tool) RETURN t.name AS name, t.toolType AS type LIMIT 100');
    contextGraph.tools = toolsRes.records.map(r => ({
      name: r.get('name'),
      type: r.get('type')
    }));

    // 4. Get USES_DB Relationships
    const dbRelRes = await session.run(`
      MATCH (f:CodebaseFile)-[r:USES_DB]->(t:DBTable)
      RETURN f.filePath AS file, t.name AS table, r.operation AS operation, r.line_num AS line_num
      LIMIT 1000
    `);
    contextGraph.relationships.push(...dbRelRes.records.map(r => ({
      type: 'USES_DB',
      source: r.get('file'),
      target: r.get('table'),
      operation: r.get('operation'),
      line_num: r.get('line_num')
    })));

    // 5. Get USES_TOOL Relationships
    const toolRelRes = await session.run(`
      MATCH (f:CodebaseFile)-[r:USES_TOOL]->(t:Tool)
      RETURN f.filePath AS file, t.name AS tool, r.type AS type
      LIMIT 1000
    `);
    contextGraph.relationships.push(...toolRelRes.records.map(r => ({
      type: 'USES_TOOL',
      source: r.get('file'),
      target: r.get('tool'),
      type_attr: r.get('type')
    })));

    // Save JSON
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(contextGraph, null, 2));
    console.log(`✓ Saved ${contextGraph.relationships.length} contextual graph relationships to ${outPath}`);

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
