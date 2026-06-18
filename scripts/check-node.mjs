import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'neo4j123'
  )
);

async function main() {
  const session = driver.session();
  try {
    const res = await session.run('MATCH (n) WHERE id(n) = 25545 RETURN n, labels(n) AS labels');
    if (res.records.length > 0) {
      console.log('Labels:', res.records[0].get('labels'));
      console.log('Properties:', res.records[0].get('n').properties);
    } else {
      console.log('Node not found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
