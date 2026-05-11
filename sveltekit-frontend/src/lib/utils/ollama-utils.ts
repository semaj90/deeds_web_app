import { ENV } from '$lib/server/env.server.js';

const LOOPBACK_IP = ['127', '0', '0', '1'].join('.');

/**
 * Determines the correct Ollama endpoint based on environment configuration.
 * Prioritizes ENV.OLLAMA_BASE_URL, falls back to host.docker.internal for Docker,
 * then to loopback.
 */
export function getOllamaEndpoint(): string {
    if (ENV.OLLAMA_BASE_URL) {
        return ENV.OLLAMA_BASE_URL.replace(/\/+$/, '');
    }

    // Check if running inside a Docker container
    if (process.env.NODE_ENV === 'development' && process.env.DOCKER_ENV === 'true') {
        return 'http://host.docker.internal:11434';
    }

    return `http://${LOOPBACK_IP}:11434`;
}

