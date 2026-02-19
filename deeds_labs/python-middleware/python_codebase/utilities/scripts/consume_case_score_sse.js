// Simple SSE consumer for the /api/case/score endpoint
// Node 18+ or modern browsers
async function consume(caseId) {
  const res = await fetch(`http://localhost:5173/api/case/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId })
  });

  if (!res.ok) {
    console.error('Request failed', res.status, await res.text());
    return;
  }

  const reader = res.body.getReader();
  const utf8 = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += utf8.decode(value, { stream: true });
    // parse simple SSE chunks
    const parts = buffer.split('\n\n');
    while (parts.length > 1) {
      const chunk = parts.shift();
      if (!chunk) continue;
      const lines = chunk.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.replace('event:', '').trim();
        if (line.startsWith('data:')) data += line.replace('data:', '').trim();
      }
      try {
        const parsed = JSON.parse(data || '{}');
        console.log(`[${event}]`, parsed);
      } catch (e) {
        console.log(`[${event}]`, data);
      }
    }
    buffer = parts[0] || '';
  }
}

if (require.main === module) {
  const caseId = process.argv[2] || 'case-demo-1';
  consume(caseId).catch(err => console.error('Consumer error:', err));
}

export default consume;
