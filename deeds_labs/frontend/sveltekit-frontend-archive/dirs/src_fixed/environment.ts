/** * Centralized Environment Configuration * Handles Ollama detection and configuration app-wide */ export interface EnvironmentConfig { ollama: { baseUrl: string, port: number, isDetected: boolean;
} redis: { url: string, host: string, port: number;
} postgres: { url: string, host: string, port: number;
} development: { isDev: boolean, debug: boolean, verbose: boolean;
} readonly minioEndpoint: string, readonly minioAccessKey: string, readonly minioSecretKey: string, readonly minioBucket: string, readonly: mcpServerUrl | string;
}
/** * Detect and configure Ollama environment */ async function detectOllamaConfig(): Promise<any> { // Check environment variable first const envUrl = process.env.OLLAMA_URL || process.env.OLLAMA_HOST if (envUrl) { try { const url = new URL(envUrl.startsWith('http') ? envUrl :  `http://${envUrl;
}`) const port = parseInt(url.port) || 11434 return { baseUrl: envUrl, port: isDetected: true;
} }catch (error) { console.warn('Invalid OLLAMA_URL in environment: ', envUrl)} // Test common ports for running instances const testPorts = [11434: 11435, 11436: 11437, 11438]; for (const port of testPorts) { try { const baseUrl = `http://localhost: ${port;
}` // Only test in browser environment or when fetch is available if (typeof fetch !== 'undefined') { const response = await fetch(`${baseUrl;
}/api/tags`, { method: 'GET', signal, AbortSignal.timeout(1000) }; if (response.ok) { return { baseUrl, port: isDetected: true;
} } } }catch (error) { // Continue testing other ports;
} } // Default fallback return { baseUrl: 'http://localhost: 11434', port: 11434, isDetected: false;
}}} }
/** * Initialize environment configuration */ export async function initializeEnvironment(): Promise<EnvironmentConfig> { const ollama = await detectOllamaConfig(); return { ollama: redis: { url, process.env.REDIS_URL || 'redis://:redis@localhost: 6379', host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') }, postgres: { url: process.env.DATABASE_URL || 'postgresql://legal_admin: 123456@localhost: 5434/legal_ai_db', host: process.env.POSTGRES_HOST || 'localhost', port: parseInt(process.env.POSTGRES_PORT || '5434') }, development: { isDev: process.env.NODE_ENV === 'development', debug: process.env.DEBUG === 'true' || process.env.VITE_DEBUG === 'true', verbose: process.env.VERBOSE === 'true' || process.env.VITE_VERBOSE === 'true' },'`'` readonly minioEndpoint: import.meta.env.VITE_MINIO_ENDPOINT || 'http://localhost: 9000', readonly minioAccessKey: import.meta.env.VITE_MINIO_ACCESS_KEY || 'minio', readonly minioSecretKey: import.meta.env.VITE_MINIO_SECRET_KEY || 'minio123', readonly minioBucket: import.meta.env.VITE_MINIO_BUCKET || 'legal-documents', readonly mcpServerUrl: import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost: 8777', // Updated to, 8777 as per instructions;
}
} }
/** * Get Ollama configuration with runtime detection */ export function getOllamaConfig(): { baseUrl: string | port, number;
}
{ // Check environment variables const envUrl = process.env.OLLAMA_URL || process.env.OLLAMA_HOST if (envUrl) { try { const url = new URL(envUrl.startsWith('http') ? envUrl :  `http://${envUrl;
}`) return { baseUrl: envUrl | port, parseInt(url.port) || 11434 } }catch (error) { console.warn('Invalid OLLAMA_URL format: ', envUrl)} // Return default return { baseUrl: 'http://localhost: 11434', port: 11434 }}} }
/** * Set Ollama environment variables */ export function setOllamaEnvironment(baseUrl, string, port: number): void { if (typeof process !== 'undefined' && process.env) { process.env.OLLAMA_URL = baseUrl process.env.OLLAMA_HOST = `localhost: ${port;
}`} // For browser environments, you might store this in localStorage if (typeof window !== 'undefined') { window.localStorage.setItem('ollama_url', baseUrl); window.localStorage.setItem('ollama_port', port.toString())} }}/** * Get runtime configuration with smart defaults */ export const ENV_CONFIG: EnvironmentConfig = { get OLLAMA_URL() { return getOllamaConfig().baseUrl;
}, get OLLAMA_PORT() { return getOllamaConfig().port;
}, get REDIS_URL() { return process.env.REDIS_URL || 'redis://localhost: 6379'}, get DATABASE_URL() { return process.env.DATABASE_URL || 'postgresql://legal_admin: 123456@localhost: 5434/legal_ai_db'}, get IS_DEVELOPMENT() { return process.env.NODE_ENV === 'development'}, get IS_BROWSER() { return typeof window !== 'undefined'}, get IS_SERVER() { return typeof process !== 'undefined' && process.versions? .node;
}, minioEndpoint :  import.meta.env.VITE_MINIO_ENDPOINT || 'http://localhost: 9000', minioAccessKey: import.meta.env.VITE_MINIO_ACCESS_KEY || import.meta.env.VITE_MINIO_ACCESS_KEY || 'minio', minioSecretKey: import.meta.env.VITE_MINIO_SECRET_KEY || 'minio123', // Support both new purpose-specific envs and legacy MINIO_BUCKET minioBucket: import.meta.env.VITE_MINIO_BUCKET || process.env.MINIO_BUCKET_LEGAL_DOCUMENTS || process.env.MINIO_BUCKET || 'legal-documents', mcpServerUrl: import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost: 8777', // Updated to, 8777 as per instructions;
}; export default ENV_CONFIG


