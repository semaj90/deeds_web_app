import fetch from 'node-fetch';

async function testOllama() {
    console.log("🔍 Testing Ollama Connection...");

    // 1. Check Tags
    try {
        const tagRes = await fetch('http://localhost:11434/api/tags');
        const tags = await tagRes.json();
        console.log("✅ Models found:", tags.models.map(m => m.name));
    } catch (e) {
        console.error("❌ Connection failed:", e.message);
        process.exit(1);
    }

    // 2. Test Generation with Long Timeout
    console.log("\n🧪 Testing Generation...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 Minute Timeout

    try {
        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            body: JSON.stringify({
                model: 'gemma3-legal:latest', // Ensure this matches your `ollama list`
                prompt: "Are you ready?",
                stream: false
            }),
            signal: controller.signal
        });
        const data = await res.json();
        console.log(`✅ Success! Response: "${data.response}"`);
    } catch (e) {
        console.error("❌ Generation Failed:", e.message);
    } finally {
        clearTimeout(timeout);
    }
}

testOllama();