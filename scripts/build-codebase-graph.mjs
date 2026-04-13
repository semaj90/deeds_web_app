/**
 * Build Neo4j Knowledge Graph from Codebase Index
 *
 * Reads codebase-graph-audit.json and creates Neo4j graph with:
 * - File nodes
 * - Import/Export edges
 * - Semantic similarity edges (from Qdrant)
 * - Cluster metadata
 *
 * Prerequisites:
 * 1. Run: node scripts/audit/codebase-graph-audit.mjs
 * 2. Neo4j running on localhost:7687
 *
 * Usage: node scripts/build-codebase-graph.mjs
 */

import neo4j from 'neo4j-driver';
import { readFile } from 'fs/promises';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';

function log(msg, color = reset) {
  console.log(`${color}${msg}${reset}`);
}

// ============================================================================
// Neo4j Connection
// ============================================================================

let driver;
let session;

async function connectNeo4j() {
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    session = driver.session();

    // Test connection
    await session.run('RETURN 1');
    log('✅ Connected to Neo4j', green);
  } catch (error) {
    log(`❌ Failed to connect to Neo4j: ${error.message}`, red);
    log(`   Make sure Neo4j is running on ${NEO4J_URI}`, yellow);
    throw error;
  }
}

async function closeNeo4j() {
  if (session) await session.close();
  if (driver) await driver.close();
}

// ============================================================================
// Graph Construction
// ============================================================================

async function createConstraints() {
  log('\n🔧 Creating Neo4j constraints...', blue);

  const constraints = [
    'CREATE CONSTRAINT file_path_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE',
    'CREATE INDEX file_type_index IF NOT EXISTS FOR (f:File) ON (f.type)',
    'CREATE INDEX file_language_index IF NOT EXISTS FOR (f:File) ON (f.language)',
  ];

  for (const constraint of constraints) {
    try {
      await session.run(constraint);
    } catch (err) {
      // Constraint may already exist
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }

  log('✅ Constraints created', green);
}

async function createFileNodes(auditData) {
  log('\n📁 Creating file nodes...', blue);

  let created = 0;
  const batchSize = 500;
  const files = [];

  // Build file list with metadata
  for (const [filePath, imports] of Object.entries(auditData.imports || {})) {
    const exports = auditData.exports[filePath] || [];
    const lang = getLanguage(filePath);
    const nodeType = getNodeType(filePath);

    files.push({
      path: filePath,
      type: nodeType,
      language: lang,
      importCount: imports.length,
      exportCount: exports.length,
    });
  }

  // Batch insert
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await session.run(`
      UNWIND $files AS file
      MERGE (f:File {path: file.path})
      SET f.type = file.type,
          f.language = file.language,
          f.importCount = file.importCount,
          f.exportCount = file.exportCount,
          f.createdAt = datetime()
    `, { files: batch });

    created += batch.length;

    if (created % 1000 === 0) {
      log(`  Created ${created.toLocaleString()} / ${files.length.toLocaleString()} nodes...`, cyan);
    }
  }

  log(`✅ Created ${created.toLocaleString()} file nodes`, green);
  return created;
}

async function createImportEdges(auditData) {
  log('\n🔗 Creating import edges...', blue);

  let created = 0;
  const batchSize = 500;
  const edges = [];

  for (const [source, imports] of Object.entries(auditData.imports || {})) {
    for (const target of imports) {
      edges.push({
        source,
        target: resolveImportPath(source, target),
      });
    }
  }

  for (let i = 0; i < edges.length; i += batchSize) {
    const batch = edges.slice(i, i + batchSize);

    await session.run(`
      UNWIND $edges AS edge
      MATCH (source:File {path: edge.source})
      MERGE (target:File {path: edge.target})
      MERGE (source)-[r:IMPORTS]->(target)
      SET r.createdAt = datetime()
    `, { edges: batch });

    created += batch.length;

    if (created % 1000 === 0) {
      log(`  Created ${created.toLocaleString()} / ${edges.length.toLocaleString()} edges...`, cyan);
    }
  }

  log(`✅ Created ${created.toLocaleString()} import edges`, green);
  return created;
}

async function createClusterMetadata(auditData) {
  log('\n🌐 Creating cluster metadata...', blue);

  for (const cluster of auditData.clusters || []) {
    // Create cluster node
    await session.run(`
      CREATE (c:Cluster {
        id: $clusterId,
        size: $size,
        createdAt: datetime()
      })
    `, {
      clusterId: cluster.id,
      size: cluster.size,
    });

    // Link files to cluster
    await session.run(`
      MATCH (c:Cluster {id: $clusterId})
      UNWIND $files AS filePath
      MATCH (f:File {path: filePath})
      MERGE (f)-[:BELONGS_TO]->(c)
    `, {
      clusterId: cluster.id,
      files: cluster.files,
    });
  }

  log(`✅ Created ${auditData.clusters?.length || 0} cluster nodes`, green);
}

async function addSemanticSimilarityEdges() {
  log('\n🧠 Adding semantic similarity edges from Qdrant...', blue);

  // This requires querying Qdrant for each file's nearest neighbors
  // For now, we'll skip this in the initial build and add it as a separate step

  log('⚠️  Skipping semantic edges (run add-semantic-edges.mjs separately)', yellow);
}

// ============================================================================
// Helpers
// ============================================================================

function getLanguage(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    'ts': 'TypeScript',
    'js': 'JavaScript',
    'mjs': 'JavaScript',
    'svelte': 'Svelte',
    'go': 'Go',
    'proto': 'Protobuf',
    'sql': 'SQL',
  };
  return langMap[ext] || 'Other';
}

function getNodeType(filePath) {
  if (filePath.includes('/routes/api/')) return 'api_route';
  if (filePath.includes('/routes/(app)/')) return 'app_route';
  if (filePath.includes('/lib/components/')) return 'component';
  if (filePath.includes('/lib/server/')) return 'server_module';
  if (filePath.includes('/lib/contracts/')) return 'contract';
  return 'module';
}

function resolveImportPath(fromFile, importPath) {
  if (importPath.startsWith('$lib/')) {
    return importPath.replace('$lib/', 'src/lib/');
  }
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const dir = fromFile.split('/').slice(0, -1).join('/');
    return `${dir}/${importPath}`.replace(/\/\.\//g, '/');
  }
  return importPath;
}

// ============================================================================
// Graph Stats
// ============================================================================

async function printGraphStats() {
  log('\n📊 Neo4j Graph Statistics:', blue);

  const nodeCount = await session.run('MATCH (n:File) RETURN count(n) as count');
  const edgeCount = await session.run('MATCH ()-[r:IMPORTS]->() RETURN count(r) as count');
  const clusterCount = await session.run('MATCH (c:Cluster) RETURN count(c) as count');

  log(`  Files: ${nodeCount.records[0].get('count').toNumber().toLocaleString()}`, reset);
  log(`  Import edges: ${edgeCount.records[0].get('count').toNumber().toLocaleString()}`, reset);
  log(`  Clusters: ${clusterCount.records[0].get('count').toNumber().toLocaleString()}`, reset);

  // Top imported files
  const topImported = await session.run(`
    MATCH (f:File)<-[r:IMPORTS]-()
    WITH f, count(r) as importCount
    ORDER BY importCount DESC
    LIMIT 10
    RETURN f.path as path, importCount
  `);

  log('\n🔝 Top 10 Most Imported Files:', cyan);
  for (const record of topImported.records) {
    const path = record.get('path');
    const count = record.get('importCount').toNumber();
    log(`  ${count.toString().padStart(4)} - ${path}`, reset);
  }

  log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    log('\n🚀 Building Neo4j Codebase Knowledge Graph...', blue);

    // Load audit data
    log('\n📖 Loading audit data...', blue);
    const auditJson = await readFile('codebase-graph-audit.json', 'utf-8');
    const auditData = JSON.parse(auditJson);
    log(`✅ Loaded audit data: ${auditData.totalFiles.toLocaleString()} files`, green);

    // Connect to Neo4j
    await connectNeo4j();

    // Clear existing graph (optional - comment out to preserve)
    // log('\n🗑️  Clearing existing graph...', yellow);
    // await session.run('MATCH (n) DETACH DELETE n');

    // Create schema
    await createConstraints();

    // Build graph
    await createFileNodes(auditData);
    await createImportEdges(auditData);
    await createClusterMetadata(auditData);
    await addSemanticSimilarityEdges();

    // Print stats
    await printGraphStats();

    log('✅ Graph construction complete!', green);
    log('\n📍 Next steps:', blue);
    log('  1. Open Neo4j Browser: http://localhost:7474', cyan);
    log('  2. Run query: MATCH (n:File) RETURN n LIMIT 100', cyan);
    log('  3. Run: node scripts/add-semantic-edges.mjs (adds vector similarity)', cyan);
    log('  4. Build D3 visualization in /demos/codebase-graph\n', cyan);

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, red);
    console.error(error);
    process.exit(1);
  } finally {
    await closeNeo4j();
  }
}

main();
