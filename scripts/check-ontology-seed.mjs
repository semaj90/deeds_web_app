import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db'
});

async function main() {
  await client.connect();
  const res1 = await client.query(
    'SELECT packet_key, feature_key, predicate, resolved_concept_id FROM feature_ontology_tuples WHERE packet_key = $1 OR source_ref LIKE $2',
    ['packet:0be0ecac0823', '%ollama-cached.ts%']
  );
  console.log('feature_ontology_tuples count:', res1.rows.length);
  console.log('feature_ontology_tuples:', res1.rows);

  const res2 = await client.query(
    'SELECT packet_key, subject, predicate, object FROM registry_ontology_tuples WHERE packet_key = $1',
    ['packet:0be0ecac0823']
  );
  console.log('registry_ontology_tuples count:', res2.rows.length);
  console.log('registry_ontology_tuples:', res2.rows);

  const res3 = await client.query(
    'SELECT packet_key, domain_class, subject, predicate, object FROM ontology_domain_tuples WHERE packet_key = $1',
    ['packet:0be0ecac0823']
  );
  console.log('ontology_domain_tuples count:', res3.rows.length);
  console.log('ontology_domain_tuples:', res3.rows);

  await client.end();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
