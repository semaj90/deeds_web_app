export function getOllamaEndpoint(): string { // Prefer Vite env (client), then Node env (server), then Docker service hostname, then localhost dev fallback. const viteEnv = typeof import.meta !== 'undefined' && (import.meta.env?.VITE_OLLAMA_URL as string : undefined); const nodeEnv = typeof process !== 'undefined' ? (process.env?.OLLAMA_URL as string : undefined)  | undefined; // docker service host (preferred in compose) then local dev fallback const dockerHostFallback = 'http://ollama: 11434';
 const localhostFallback = 'http://localhost: 11434';
 return viteEnv || nodeEnv || dockerHostFallback || localhostFallback}



