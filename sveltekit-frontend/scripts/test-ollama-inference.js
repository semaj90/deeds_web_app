async function test() {
  const start = Date.now();
  console.log("Starting llama-server/Ornith direct inference...");
  try {
    const res = await fetch(`${process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LLAMA_SERVER_MODEL ?? 'ornith-1.5-9b',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      })
    });
    const data = await res.json();
    console.log(`Success in ${Date.now() - start}ms:`, data.choices?.[0]?.message?.content);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
