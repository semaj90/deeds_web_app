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
    const res = await session.run('RETURN gds.version() AS version');
    console.log('GDS Version:', res.records[0].get('version'));
  } catch (err) {
    console.error('GDS not available:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
