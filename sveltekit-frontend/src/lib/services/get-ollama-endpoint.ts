/**
 * Utility to resolve the Ollama API endpoint across different environments
 */

export const DEFAULT_OLLAMA = 'http://localhost:11434';

export function getOllamaEndpoint(): string {
	// 1) Try Vite-provided env (available at build time when running in Vite)
	try {
		// @ts-ignore - import.meta.env might not be recognized in all contexts
		const viteUrl = import.meta.env?.VITE_OLLAMA_URL;
		if (viteUrl) return viteUrl;
	} catch {
		// ignore: runtime environments may not have import.meta
	}

	// 2) Try Node environment variables
	if (typeof process !== 'undefined' && process.env) {
		const nodeEnv =
			process.env.OLLAMA_URL ||
			process.env.OLLAMA_HOST ||
			process.env.OLLAMA_BASEURL ||
			process.env.PUBLIC_OLLAMA_URL ||
			process.env.VITE_OLLAMA_URL;
		if (nodeEnv) return nodeEnv;
	}

	// 3) Fallback to default constant
	return DEFAULT_OLLAMA;
}



