/**
 * Ollama client endpoint helper
 *
 * Prefer Vite env (client), then Node env (server),
 * then Docker service hostname, then localhost dev fallback.
 */

export function getOllamaEndpoint(): string {
	const nodeEnv = typeof process !== 'undefined'
		? process.env?.OLLAMA_URL
		: undefined;

	const dockerHostFallback = 'http://ollama:11434';
	const localhostFallback = 'http://localhost:11434';

	return nodeEnv || dockerHostFallback || localhostFallback;
}