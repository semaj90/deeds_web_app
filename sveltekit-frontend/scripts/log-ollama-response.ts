
import { getOllamaEndpoint } from '../src/lib/services/get-ollama-endpoint';

async function testOllama() {
    const endpoint = getOllamaEndpoint();
    console.log(`Testing Ollama at endpoint: ${endpoint}`);

    try {
        const response = await fetch(`${endpoint}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemma3-legal:latest',
                prompt: 'Hello, are you online?',
                stream: false
            })
        });

        if (!response.ok) {
            console.error(`Ollama error: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        console.log('Ollama Response:', data.response);
    } catch (err) {
        console.error('Failed to connect to Ollama:', err);
    }
}

testOllama();
