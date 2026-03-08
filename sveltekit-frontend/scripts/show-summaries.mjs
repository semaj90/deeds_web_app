#!/usr/bin/env node
const auth = 'Basic ' + Buffer.from('admin:password').toString('base64');
const res = await fetch('http://localhost:5984/llm_summaries/_all_docs?include_docs=true', {
  headers: { Authorization: auth }
});
const data = await res.json();
console.log('Database: llm_summaries');
console.log('Total docs:', data.total_rows);
console.log('');
for (const r of data.rows) {
  if (r.id.startsWith('_design')) continue;
  const d = r.doc;
  console.log('ID:', d._id);
  console.log('  File:', d.file_path);
  console.log('  Summary:', (d.summary || '').slice(0, 200));
  console.log('  Entities:', JSON.stringify(d.key_entities));
  console.log('  Lines:', d.metadata?.lines_of_code, '| Importers:', d.metadata?.importers_count);
  console.log('');
}
