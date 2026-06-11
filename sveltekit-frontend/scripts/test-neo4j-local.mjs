import neo4j from 'neo4j-driver';

const urls = [
  'bolt://127.0.0.1:7687',
  'bolt://localhost:7687'
];

for (const url of urls) {
  console.log(`\nTesting connection to ${url} with ENCRYPTION_OFF...`);
  const driver = neo4j.driver(url, neo4j.auth.basic('neo4j', 'neo4j123'), {
    encrypted: 'ENCRYPTION_OFF',
    trust: 'TRUST_ALL_CERTIFICATES'
  });
  const session = driver.session();
  try {
    const res = await session.run('RETURN 1');
    console.log(`SUCCESS on ${url}:`, res.records[0].get(0).toNumber());
  } catch (err) {
    console.error(`ERROR on ${url}:`, err.message || err);
  } finally {
    await session.close();
    await driver.close();
  }
}
