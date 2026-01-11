export function getOllamaEndpoint(): string {
 // Prefer Docker service hostname for production, fall back to localhost for local dev.
 // Use process.env.OLLAMA_URL when provided.
 const envUrl = process.env.OLLAMA_URL?.trim();
 const dockerDefault = 'http://ollama:11434';
 const localFallback = 'http://localhost:11434';

 const raw = envUrl || dockerDefault || localFallback;
 return raw.replace(/\/$/, '');
}


