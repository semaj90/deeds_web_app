import neo4j from 'neo4j-driver';
import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, routeSummary, createProgressLogger } from './_atlas-utils.mjs';

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
const PROGRESS_EVERY = parseInt([...args].find((arg) => String(arg).startsWith('--progress-every='))?.split('=')[1] ?? '100', 10);
const NODE_BATCH_SIZE = parseInt([...args].find((arg) => String(arg).startsWith('--node-batch-size='))?.split('=')[1] ?? '1000', 10);
const EDGE_BATCH_SIZE = parseInt([...args].find((arg) => String(arg).startsWith('--edge-batch-size='))?.split('=')[1] ?? '500', 10);

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
  nodeCounts.set('CodeArtifact', (nodeCounts.get('CodeArtifact') ?? 0) + 1);
  
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
    const startAt = Date.now();
    
    // Phase 1: Constraints/Indexes
    console.log('Phase 1: Ensuring Neo4j Constraints and Indexes...');
    await session.executeWrite(tx => tx.run(`CREATE CONSTRAINT artifact_path IF NOT EXISTS FOR (n:CodeArtifact) REQUIRE n.path IS UNIQUE`));
    await session.executeWrite(tx => tx.run(`CREATE INDEX artifact_type IF NOT EXISTS FOR (n:CodeArtifact) ON (n.type)`));
    await session.executeWrite(tx => tx.run(`CREATE INDEX artifact_workspace IF NOT EXISTS FOR (n:CodeArtifact) ON (n.workspace)`));
    await session.executeWrite(tx => tx.run(`CREATE INDEX artifact_runid IF NOT EXISTS FOR (n:CodeArtifact) ON (n.runId)`));

    // Phase 2: Merge Nodes
    console.log(`Phase 2: Writing ${nodes.length} nodes in batches of ${NODE_BATCH_SIZE}...`);
    const nodeProgress = createProgressLogger({ label: 'neo4j-nodes', total: nodes.length, every: PROGRESS_EVERY });
    for (let i = 0; i < nodes.length; i += NODE_BATCH_SIZE) {
      const batch = nodes.slice(i, i + NODE_BATCH_SIZE);
      await session.executeWrite(tx => tx.run(`
        UNWIND $batch AS row
        MERGE (n:CodeArtifact {path: row.path})
        SET n:Codebase, n += row, n.updatedAt = datetime()
        WITH n, row.type AS type
        CALL apoc.create.addLabels([n], [type]) YIELD node
        RETURN count(node)
      `, { batch }));
      nodeProgress(Math.min(i + NODE_BATCH_SIZE, nodes.length));
    }

    // Phase 3: Merge Edges Grouped by Type
    const edgeTypes = [...new Set(edges.map(e => e.type))];
    console.log(`Phase 3: Writing ${edges.length} edges across ${edgeTypes.length} types in batches of ${EDGE_BATCH_SIZE}...`);
    
    for (const type of edgeTypes) {
      const typedEdges = edges.filter(e => e.type === type);
      console.log(`  Relationship: [${type}] (${typedEdges.length} edges)`);
      const edgeProgress = createProgressLogger({ label: `neo4j-${type.toLowerCase()}`, total: typedEdges.length, every: PROGRESS_EVERY });
      
      for (let i = 0; i < typedEdges.length; i += EDGE_BATCH_SIZE) {
        const batch = typedEdges.slice(i, i + EDGE_BATCH_SIZE);
        // Using labels for matching is faster with constraints
        await session.executeWrite(tx => tx.run(`
          UNWIND $batch AS row
          MATCH (a:CodeArtifact {path: row.from})
          MATCH (b:CodeArtifact {path: row.to})
          MERGE (a)-[r:${type}]->(b)
          SET r.runId = row.runId, r.updatedAt = datetime()
          RETURN count(r)
        `, { batch }));
        edgeProgress(Math.min(i + EDGE_BATCH_SIZE, typedEdges.length));
      }
    }
    
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
    console.log(`Successfully projected GraphRAG to Neo4j in ${elapsed}s.`);
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

process.exit(0);


