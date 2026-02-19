import fetch from 'node-fetch';

async function test() {
  const url = process.env.URL || 'http://localhost:4000/api/agentic/call';
  const body = { name: 'web_search', args: ['legal precedent'] };
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    const j = await res.json();
    console.log('Response:', j);
  } catch (e) {
    console.error('Test call failed', e);
    process.exit(1);
  }
}

test();
