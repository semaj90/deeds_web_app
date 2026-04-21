import http from 'http';

const queries = ['dialog modal popup', 'form validation', 'button click'];

for (const query of queries) {
  const payload = JSON.stringify({ query, limit: 3 });
  await new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 5173, path: '/api/codebase/wiki', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        console.log(`\n"${query}" → ${r.results?.length || 0} results`);
        if (r.results) {
          r.results.forEach((x, i) => {
            const fp = x.file_path ? x.file_path.split(/[/\\]/).pop() : 'unknown';
            console.log(`  ${i+1}. ${fp} (sim: ${(x.similarity || 0).toFixed(4)})`);
          });
        }
        if (r.error) console.log(`  Error: ${r.error}`);
        resolve();
      });
    });
    req.write(payload);
    req.end();
  });
}
