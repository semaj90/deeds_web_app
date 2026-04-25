import('neo4j-driver').then(async neo4j => {
  try {
    const bolt = process.env.NEO4J_BOLT_URL || 'bolt://127.0.0.1:7688';
    const user = process.env.NEO4J_USER || 'neo4j';
    const pass = process.env.NEO4J_PASSWORD || 'Neo4jPass123!';
    console.log('Attempting to connect to', bolt, 'using realm/native');
    // provide native realm explicitly
    const driver = neo4j.driver(bolt, neo4j.auth.basic(user, pass, 'native'));
    const session = driver.session();
    const res = await session.run('RETURN 1 AS ok');
    console.log('Query result:', res.records.map(r => r.toObject()));
    await session.close();
    await driver.close();
    console.log('Neo4j connection successful');
    process.exit(0);
  } catch (err) {
    console.error('Neo4j connection failed:', err);
    process.exit(2);
  }
}).catch(err => {
  console.error('Failed to import neo4j-driver. Is it installed?', err);
  process.exit(3);
});
