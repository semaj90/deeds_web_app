
async function test() {
  const res = await fetch('http://127.0.0.1:8788/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
