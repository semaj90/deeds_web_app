import { CONFIG } from '$lib/config/env.server';

/**
 * Determines the correct Ollama endpoint based on environment configuration.
 * Prioritizes CONFIG.OLLAMA_URL, falls back to host.docker.internal for Docker,
 * then to localhost.
 */
export function getOllamaEndpoint(): string {
    if (CONFIG.OLLAMA_URL) {
        return CONFIG.OLLAMA_URL.replace(/\/+$/, '');
    }

    // Check if running inside a Docker container
    if (process.env.NODE_ENV === 'development' && process.env.DOCKER_ENV === 'true') {
        return 'http://host.docker.internal:11434';
    }

    return 'http://localhost:11434';
}

