const neo4j = require('neo4j-driver');
const d = neo4j.default.driver('bolt://localhost:7687', neo4j.default.auth.basic('neo4j', 'neo4j123'));
async function run() {
  const s = d.session({ database: 'neo4j' });
  try {
    // Test exact query from codebase-neo4j-sync.ts constraint check
    const t0 = Date.now();
    const r = await s.run(
      'SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties WHERE labelsOrTypes = ["CodebaseFile"] RETURN name, properties'
    );
    console.log('SHOW CONSTRAINTS WHERE:', Date.now() - t0, 'ms, count:', r.records.length);
    if (r.records.length) {
      const props = r.records[0].get('properties');
      console.log('properties type:', typeof props, 'value:', JSON.stringify(props));
      console.log('includes id:', Array.isArray(props) && props.includes('id'));
    }
  } catch (e) {
    console.error('FAILED:', e.message);
  } finally {
    await s.close();
    await d.close();
  }
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
