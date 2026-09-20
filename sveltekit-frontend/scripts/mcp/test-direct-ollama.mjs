/**
 * Direct test without tool calling - query llama-server/Ornith about Svelte 5
 */

async function testDirectOllama() {
    console.log(`\n🤖 Direct Ollama Test: Svelte 5 Migration\n`);

    const query = `Based on the Svelte 5 migration guide, explain:

1. Why was "new Component()" deprecated?
2. What is the mount() function and how does it work?
3. Show a before/after code example
4. What are the key differences?

Provide a concise answer with code examples.`;

    try {
        const response = await fetch(`${process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090'}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.LLAMA_SERVER_MODEL ?? 'ornith-1.5-9b',
                messages: [{ role: 'user', content: query }],
                stream: false,
                max_tokens: 512,
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Ollama Response:\n`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(data.choices?.[0]?.message?.content ?? 'NO CONTENT');
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

            console.log(`📊 Stats:`);
            console.log(`   Model: ${data.model}`);
            console.log(`   Tokens: ${data.eval_count || 'N/A'}`);
            console.log(`   Time: ${(data.total_duration / 1e9).toFixed(2)}s`);
        } else {
            console.error(`❌ Ollama error: ${response.status}`);
            const text = await response.text();
            console.error(text);
        }

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    }
}

testDirectOllama();
