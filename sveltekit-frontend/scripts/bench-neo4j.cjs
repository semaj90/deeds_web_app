/* eslint-disable */
const neo4j = require('neo4j-driver');
const driver = neo4j.default.driver(
  'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', 'neo4j123'),
  { connectionTimeout: 10000, maxConnectionPoolSize: 5 }
);

const BATCH500 = Array.from({ length: 500 }, (_, i) => ({
  id: 'test_node_' + i,
  filePath: 'src/lib/test_' + i + '.ts',
  label: 'test_' + i + '.ts',
  nodeLabel: 'File', type: 'util', cluster: 'lib',
  lineCount: 50, fileSize: 1000, complexity: 3, classCount: 0,
  importCount: 2, exportCount: 1, exports: [], functions: [],
  usedTables: [], publishedQueues: [], consumedQueues: [],
  fetchedRoutes: [], usesNative: false, hasDynamicImports: false,
}));

async function run() {
  const s = driver.session({ database: 'neo4j' });
  try {
    // Benchmark: 500-node UNWIND MERGE
    const t0 = Date.now();
    await s.run(
      `UNWIND $batch AS node
       MERGE (f:CodebaseFile {id: node.id})
       SET f.filePath = node.filePath,
           f.nodeLabel = node.nodeLabel,
           f.type = node.type,
           f.cluster = node.cluster,
           f.lineCount = node.lineCount,
           f.updatedAt = datetime()`,
      { batch: BATCH500 }
    );
    console.log('Write 500 nodes:', Date.now() - t0, 'ms');

    // Benchmark: COUNT
    const t1 = Date.now();
    const cnt = await s.run("MATCH (f:CodebaseFile) WHERE f.id STARTS WITH 'test_node_' RETURN count(f) AS n");
    console.log('Count test nodes:', cnt.records[0].get('n').toNumber(), 'in', Date.now() - t1, 'ms');

    // Cleanup
    const t2 = Date.now();
    await s.run("MATCH (f:CodebaseFile) WHERE f.id STARTS WITH 'test_node_' DETACH DELETE f");
    console.log('Cleanup:', Date.now() - t2, 'ms');
  } finally {
    await s.close();
    await driver.close();
  }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
