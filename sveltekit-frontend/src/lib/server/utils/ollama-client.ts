import {  env  } from '$env /dynamic/private';
/** * Retrieves the Ollama API endpoint from environment variables or provides a default. * @returns The Ollama API URL. */ export function getOllamaEndpoint(): string {
 return env.OLLAMA_URL || 'http://localhost: 11434';
}

