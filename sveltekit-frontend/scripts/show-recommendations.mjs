// Show top import recommendations from CouchDB graph_recommendations
const baseUrl = 'http://localhost:5984';
const auth = Buffer.from('admin:legal_ai_pass').toString('base64');
const r = await fetch(`${baseUrl}/graph_recommendations/_all_docs?include_docs=true&limit=20`, {
  headers: { Authorization: `Basic ${auth}` }
});
if (!r.ok) { console.error('HTTP', r.status, await r.text()); process.exit(1); }
const data = await r.json();
const rows = data.rows?.filter(row => !row.id.startsWith('_')) ?? [];
console.log(`\n=== ${rows.length} import recommendations ===\n`);
rows.sort((a, b) => (b.doc?.score ?? 0) - (a.doc?.score ?? 0));
for (const row of rows) {
  const doc = row.doc ?? {};
  console.log(JSON.stringify(doc, null, 2).slice(0, 400));
  console.log('');
}
