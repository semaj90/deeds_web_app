async function test() {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    const data = await res.json();
    console.log("Ollama Tags:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
