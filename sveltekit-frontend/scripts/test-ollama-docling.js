async function test() {
  const start = Date.now();
  console.log("Querying docling model directly in Ollama...");
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ibm/granite-docling:258m',
        prompt: 'Hi',
        stream: false
      })
    });
    const data = await res.json();
    console.log(`Success in ${Date.now() - start}ms:`, data.response);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
