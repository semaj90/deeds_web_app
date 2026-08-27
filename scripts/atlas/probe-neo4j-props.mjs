#!/usr/bin/env node
import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://127.0.0.1:7687', neo4j.auth.basic('neo4j', 'neo4j123'));
const s = driver.session();

async function run() {
  try {
    // All labels in the DB
    const labelsRes = await s.run('CALL db.labels() YIELD label RETURN collect(label) AS labels');
    const labels = labelsRes.records[0]?.get('labels') ?? [];
    console.log('LABELS:', JSON.stringify(labels));

    const totalRes = await s.run('MATCH (n) RETURN count(n) AS c');
    console.log('TOTAL NODES:', totalRes.records[0]?.get('c').toNumber());

    // Sample a few nodes to see their property keys
    const sampleRes = await s.run('MATCH (n) RETURN labels(n) AS l, keys(n) AS k, n LIMIT 5');
    for (const rec of sampleRes.records) {
      const props = {};
      for (const key of rec.get('k')) {
        props[key] = rec.get('n').properties[key];
      }
      console.log(JSON.stringify({ labels: rec.get('l'), keys: rec.get('k'), sample: props }));
    }

    // Check what source_ref variants exist
    const srcRefRes = await s.run(
      'MATCH (n) WHERE n.source_ref IS NOT NULL OR n.sourceRef IS NOT NULL OR n.file_path IS NOT NULL OR n.filePath IS NOT NULL RETURN labels(n) AS l, n.source_ref AS sr, n.sourceRef AS sr2, n.file_path AS fp, n.filePath AS fp2, keys(n) AS k LIMIT 5'
    );
    console.log('SOURCE_REF SAMPLES:');
    for (const rec of srcRefRes.records) {
      console.log(JSON.stringify({ labels: rec.get('l'), source_ref: rec.get('sr'), sourceRef: rec.get('sr2'), file_path: rec.get('fp'), filePath: rec.get('fp2'), keys: rec.get('k') }));
    }

    // Check if any nodes already have canonical_id
    const canonRes = await s.run('MATCH (n) WHERE n.canonical_id IS NOT NULL OR n.canonicalId IS NOT NULL RETURN count(n) AS c');
    console.log('NODES WITH canonical_id:', canonRes.records[0]?.get('c').toNumber());
  } finally {
    await s.close();
    await driver.close();
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
