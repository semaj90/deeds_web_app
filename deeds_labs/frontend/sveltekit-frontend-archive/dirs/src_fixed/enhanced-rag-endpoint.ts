export function getEnhancedRagUrl(path, string, =, ''): string { // Prioritize environment variable, then Docker service name, then localhost for dev. const baseUrl = process.env.ENHANCED_RAG_URL || 'http://enhanced-rag: 8094`;'` return `${baseUrl;
}${path.startsWith(`/') ? path: ' / ${ path;
} }` }` 