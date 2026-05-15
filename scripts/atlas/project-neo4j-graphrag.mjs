import neo4j from 'neo4j-driver';
import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, routeSummary } from './_atlas-utils.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');

function sanitizePayload(payload) {
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  for (const field of forbidden) {
    delete payload[field];
  }
  return payload;
}

const LIMIT = parseInt([...args].find((arg) => String(arg).startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const WORKSPACE = [...args].find(a => a.startsWith('--workspace='))?.split('=')[1];
const RUN_ID = [...args].find(a => a.startsWith('--runId='))?.split('=')[1];

if (WRITE && !RUN_ID) {
  console.error('Refusing write: --runId is required for write mode.');
  process.exit(1);
}

const EFFECTIVE_RUN_ID = RUN_ID || `run_${Date.now()}`;

const config = loadConfig();
const graph = loadCodebaseGraph(config);
const routeMap = loadRouteMap(config);
const aliases = loadClusterAliases(config);

if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

console.log(`Starting Neo4j GraphRAG Projection [WRITE=${WRITE}] [runId=${EFFECTIVE_RUN_ID}]`);

let files = graph.files ?? [];

if (WORKSPACE) {
  console.log(`Filtering for workspace: ${WORKSPACE}`);
  files = files.filter(f => workspaceForPath(f.rel, config.workspaces) === WORKSPACE);
}

if (LIMIT > 0) {
  console.log(`Applying limit: ${LIMIT}`);
  files = files.slice(0, LIMIT);
}

const nodes = [];
const edges = [];
const nodeCounts = new Map();
const edgeCounts = new Map();

for (const file of files) {
  const rel = file.rel ?? '';
  const nodeType = file.isRoute ? 'Route' : file.isSvelteComp ? 'Component' : 'File';
  nodes.push({ 
    path: rel, 
    type: nodeType, 
    workspace: workspaceForPath(rel, config.workspaces), 
    runId: EFFECTIVE_RUN_ID 
  });
  nodeCounts.set(nodeType, (nodeCounts.get(nodeType) ?? 0) + 1);
  
  const imports = file.imports ?? [];
  for (const imp of imports) {
    edges.push({ from: rel, to: imp, type: 'IMPORTS', runId: EFFECTIVE_RUN_ID });
    edgeCounts.set('IMPORTS', (edgeCounts.get('IMPORTS') ?? 0) + 1);
  }
}

if (WRITE) {
  const driver = neo4j.driver(
    process.env.NEO4J_URL || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASS || 'deeds123')
  );
  console.log('Connecting to Neo4j for write...');
  const session = driver.session();
  
  try {
    console.log(`Writing ${nodes.length} nodes to Neo4j...`);
    await session.executeWrite(tx => tx.run(`
      UNWIND $batch AS row
      MERGE (n:CodeArtifact {path: row.path})
      SET n:Codebase, n += row, n.updatedAt = datetime()
      RETURN count(n)
    `, { batch: nodes }));

    console.log(`Writing ${edges.length} edges to Neo4j...`);
    await session.executeWrite(tx => tx.run(`
      UNWIND $batch AS row
      MATCH (a:CodeArtifact {path: row.from})
      MATCH (b:CodeArtifact {path: row.to})
      MERGE (a)-[r:IMPORTS]->(b)
      SET r.runId = row.runId, r.updatedAt = datetime()
      RETURN count(r)
    `, { batch: edges }));
    
    console.log('Successfully projected GraphRAG to Neo4j.');
  } catch (err) {
    console.error('Neo4j projection failed:', err.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

const report = {
  repo: config.repoName,
  runId: EFFECTIVE_RUN_ID,
  generatedAt: new Date().toISOString(),
  dryRun: !WRITE,
  workspace: WORKSPACE || 'all',
  limit: LIMIT,
  nodes: Object.fromEntries(nodeCounts),
  edges: Object.fromEntries(edgeCounts),
  topEdgeTypes: topEntries(edgeCounts, 12)
};

writeJson(resolveRepoPath(config.outputs.neo4jReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.neo4jReportMd), parentAtlasMarkdown('Neo4j GraphRAG Projection — Parent Atlas Ingestion', {
  nodes: nodes.length,
  edges: edges.length,
  stage: 'Ingestion',
  runId: EFFECTIVE_RUN_ID
}, report.topEdgeTypes.map(({ key, value }) => `${key}: ${value}`)));

console.log(`Neo4j GraphRAG report written to ${config.outputs.neo4jReportJson} [runId: ${EFFECTIVE_RUN_ID}]`);
if (!WRITE) console.log('Dry-run complete. Add --write once Neo4j driver is configured for ingestion.');


