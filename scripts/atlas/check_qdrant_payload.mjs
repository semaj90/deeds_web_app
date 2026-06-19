
async function check() {
  const res = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: 10,
      with_payload: true,
      with_vector: false
    })
  });
  const data = await res.json();
  const points = data.result?.points ?? [];
  
  console.log('Sample Points payload audit:');
  for (const p of points) {
    console.log(`Point ID: ${p.id}`);
    console.log(`  Keys in payload:`, Object.keys(p.payload || {}));
    console.log(`  packetKey:`, p.payload?.packetKey);
    console.log(`  packet_key:`, p.payload?.packet_key);
    console.log(`  source_ref:`, p.payload?.source_ref);
    console.log(`  sourceRefs:`, p.payload?.sourceRefs);
    console.log(`  filePath:`, p.payload?.filePath);
    console.log(`  path:`, p.payload?.path);
  }
}
check();
