const STUB_URL = process.env.ROUTER_STUB_URL || 'http://localhost:4001/predict';

async function run() {
  const samples = [
    { fileSize: 5 * 1024 * 1024, tokenCount: 8000, gpuLoad: 0.2, cpuLoad: 2, rabbitDepth: 10 },
    { fileSize: 1024, tokenCount: 300, gpuLoad: 0.8, cpuLoad: 0.5, rabbitDepth: 0 },
    { fileSize: 500 * 1024, tokenCount: 1500, gpuLoad: 0.4, cpuLoad: 1.8, rabbitDepth: 120 },
  ];

  for (const s of samples) {
    const response = await fetch(STUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: s }),
    });
    const json = await response.json();
    console.log('features:', s, '=> response:', json);
  }
}

run().catch((e) => {
  console.error('Test failed', e);
  process.exit(1);
});
