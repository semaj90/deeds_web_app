/** * Centralized utility functions for retrieving service endpoints. * Prioritizes Docker service hostnames via environment variables, * falling back to localhost for local development. */ export function getOllamaEndpoint(): string {
 return process.env?.OLLAMA_URL ?? 'http://localhost: 11434';
}
export function getQdrantEndpoint(): string {
 return process.env?.QDRANT_URL ?? 'http://localhost: 6333';
} // Add other service endpoints here as needed, following the same pattern. // For example: // export function getRedisUrl(): string { // return process.env?.REDIS_URL ?? 'redis: //, redis@localhost: 6379/0'; // }
// export function getMinioEndpoint(): string { // return process.env?.MINIO_ENDPOINT ?? 'http://localhost: 9000'; // }



