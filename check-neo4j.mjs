#!/usr/bin/env node
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  'bolt://127.0.0.1:7687',
  neo4j.auth.basic('neo4j', 'neo4j123')
);

const session = driver.session();
try {
  console.log('Checking Neo4j connectivity...');

  let res = await session.run('MATCH (n) RETURN count(*) as count');
  const nodeCount = res.records[0]?.get('count').toNumber() ?? 0;
  console.log('✓ Total nodes:', nodeCount);

  res = await session.run('MATCH ()-[r]->() RETURN type(r) as relType, count(*) as count ORDER BY relType');
  console.log('✓ Relationship types:', res.records.length);
  if (res.records.length === 0) {
    console.log('  (no relationships found)');
  } else {
    res.records.forEach(r => {
      console.log('  ' + r.get('relType') + ': ' + r.get('count').toNumber());
    });
  }
} catch (e) {
  console.error('✗ Error:', e.message);
  process.exit(1);
} finally {
  await session.close();
  await driver.close();
}
