import fetch from 'node-fetch';

async function test() {
  const response = await fetch('http://localhost:3040/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ollama/gemma4-legal:latest',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7
    })
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
