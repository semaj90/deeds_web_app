const pairs = ["neo4j:neo4j123","neo4j:neo4j","neo4j:legal123","neo4j:password","neo4j:admin"];
async function test(pair) {
  const [u,pw] = pair.split(':');
  const b64 = Buffer.from(`${u}:${pw}`).toString('base64');
  try {
    const r = await fetch('http://localhost:7474/db/neo4j/query/v2', {
      method:'POST',
      headers:{Authorization:`Basic ${b64}`,'Content-Type':'application/json'},
      body:'{"statement":"RETURN 1"}',
      signal: AbortSignal.timeout(5000)
    });
    console.log(`${pair} -> ${r.status}`);
  } catch(e) {
    console.log(`${pair} -> ERR: ${e.message}`);
  }
}
(async()=>{ for(const p of pairs) await test(p); })();
