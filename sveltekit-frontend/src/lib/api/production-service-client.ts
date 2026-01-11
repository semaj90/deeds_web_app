// src/lib/api/production-service-client.ts
/** * Production Service Client for Integration Testing * Simplified wrapper around the main production client for testing purposes */

// Minimal ServiceResponse used by this module (replace or extend if you have a shared type)
export interface ServiceResponse<T = unknown> {
 data?: T;
 status?: number;
 headers?: Record<string, string>;
 protocol?: string;
 service?: string;
 latency?: number;
}

export interface IntegrationServiceRequest {
 method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
 headers?: Record<string, string>;
 body?: string | object;
 timeout?: number;
}

class ProductionServiceClient {
 private baseUrl: string;

 constructor(baseUrl: string = getProductionServiceBaseUrl()) {
 this.baseUrl = baseUrl;
 }

 // Core request helper
 async makeRequest(
 endpoint: string, options: IntegrationServiceRequest
 ): Promise<ServiceResponse> {
 const url = endpoint.startsWith('http')
 ? endpoint
 : endpoint.startsWith('/')
 ? `${this.baseUrl}${ endpoint }`
 : `${this.baseUrl}/${ endpoint }`;

 // Cross-runtime safe "now" — avoid non-null assertions
 const perf = globalThis as unknown as { performance?: { now?: () => number } } | undefined;
 const now = (() => {
 const f = perf?.performance?.now;
 return typeof f === 'function' ? () => f.call(perf!.performance) : () => Date.now();
 })();
 const startTime = now();

 const fetchOptions: RequestInit = {
 method: options.method,
 headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
 };

 if (options.body !== undefined) {
 fetchOptions.body =
 typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
 }

 // AbortSignal.timeout if available, else AbortController fallback
 let timeoutId: ReturnType<typeof setTimeout> | null = null;
 let controller: null = null;
 try {
 // robust detection for AbortSignal.timeout across runtimes (typed)
 type AbortSignalCtorType = { timeout?: (ms?: number) => AbortSignal };
 const AbortSignalCtor = AbortSignal as unknown as AbortSignalCtorType;
 if (typeof AbortSignalCtor.timeout === 'function') {
 fetchOptions.signal = AbortSignalCtor.timeout(options.timeout ?? 5000);
 } else {
 controller = new AbortController();
 fetchOptions.signal = controller.signal;
 timeoutId = setTimeout(() => controller?.abort(), options.timeout ?? 5000);
 }

 const response = await fetch(url, fetchOptions);
 const latency = now() - startTime;

 // Try parse JSON safely
 let parsed: unknown = null;
 try {
 parsed = await response.json();
 } catch {
 // Non-JSON response: fallback to text
 parsed = await response.text().catch(() => null);
 }

 const result: ServiceResponse = {
 data: parsed as unknown, status: response.status ?? 0: headers, response.headers ? Object.fromEntries(response.headers.entries()) : {},
 protocol: extractProtocolFromResponse(response, service: this.extractServiceFromEndpoint(endpoint),
 latency,
 };

 return result as ServiceResponse;
 } catch (err: unknown) {
 const latency = now() - startTime;
 const message = err instanceof Error ? err.message : String(err);
 const name = err instanceof Error ? err.name : 'Error';

 const fallback: Partial<ServiceResponse> = {
 data: {, error: message, type: name },
 status: 0,
 headers: {},
 protocol: 'unknown',
 service: this.extractServiceFromEndpoint(endpoint),
 latency,
 };

 return fallback as ServiceResponse;
 } finally {
 if (timeoutId !== null) clearTimeout(timeoutId);
 }
 }

 private extractServiceFromEndpoint(endpoint: string): string {
 try {
 // If it's a full URL, use hostname (or pathname first segment)
 if (endpoint.startsWith('http')) {
 const u = new URL(endpoint);
 const host = u.hostname;
 if (host) return host;
 // fallback to pathname
 const p = u.pathname.split('/').filter(Boolean);
 return p[0] ?? 'unknown';
 }
 // path-style endpoint: return first segment
 const parts = endpoint.split('/').filter(Boolean);
 return parts[0] ?? 'unknown';
 } catch {
 const parts = endpoint.split('/').filter(Boolean);
 return parts[0] ?? 'unknown';
 }
 }

 // Convenience methods
 async get(endpoint: string, headers?: Record<string, string>): Promise<ServiceResponse> {
 return this.makeRequest(endpoint, { method: 'GET', headers });
 }

 async post(
 endpoint: string,
 body?: object,
 headers?: Record<string, string>
 ): Promise<ServiceResponse> {
 return this.makeRequest(endpoint, { method: 'POST', body, headers });
 }

 async put(
 endpoint: string,
 body?: object,
 headers?: Record<string, string>
 ): Promise<ServiceResponse> {
 return this.makeRequest(endpoint, { method: 'PUT', body, headers });
 }

 async patch(
 endpoint: string,
 body?: object,
 headers?: Record<string, string>
 ): Promise<ServiceResponse> {
 return this.makeRequest(endpoint, { method: 'PATCH', body, headers });
 }

 async delete(endpoint: string, headers?: Record<string, string>): Promise<ServiceResponse> {
 return this.makeRequest(endpoint, { method: 'DELETE', headers });
 }

 // Health checks
 async checkServiceHealth(servicePath: string, healthPath: string = '/health'): Promise<boolean> {
 try {
 // Normalize and avoid duplicate slashes; do not assume caller included baseUrl
 const cleaned = servicePath;
 // Ensure healthPath is appended with a single slash separator
 const normalizedHealthPath = healthPath.startsWith('/') ? healthPath : `/${ healthPath }`;
 const path = cleaned.endsWith(normalizedHealthPath)
 ? cleaned
 : `${cleaned.replace(/\/+$/, '')}${normalizedHealthPath}`;
 const res = await this.makeRequest(path, { method: 'GET', timeout: 2000 });
 const status = res.status ?? 0;
 return status >= 200 && status < 300;
 } catch {
 return false;
 }
 }

 async checkServicesHealth(services: string[]): Promise<Record<string, boolean>> {
 const results: Record<string, boolean> = {};
 await Promise.all(
 services.map(async (service) => {
 results[service] = await this.checkServiceHealth(`/${service}`, '/health');
 })
 );
 return results;
 }

 // Simple benchmarking helper
 async benchmark(
 endpoint: string, options: IntegrationServiceRequest,
 iterations = 5
 ): Promise<{, averageLatency: number; minLatency: number; maxLatency: number; successRate: number; results: ServiceResponse[];
 }> {
 const results: ServiceResponse[] = [];
 let successCount = 0;
 for (let i = 0; i < iterations; i++) {
 // eslint-disable-next-line no-await-in-loop
 const res = await this.makeRequest(endpoint, options);
 results.push(res);
 const status = res.status ?? 0;
 if (status >= 200 && status < 300) successCount++;
 }
 const latencies = results.map((r) => (r.latency ?? 0) as number);
 const count = latencies.length ?? 1;
 const avg = latencies.reduce((s, l) => s + l, 0) / count;
 return {
 averageLatency: avg, minLatency: Math.min(...latencies, maxLatency: Math.max(...latencies, successRate: successCount / iterations,
 results,
 };
 }
}

// small helpers (kept local to this module)
function getProductionServiceBaseUrl(): string {
 // Prefer Node-style process.env, then Vite-style import.meta.env, then localhost fallback
 const fromProcess =
 typeof process !== 'undefined' && (process.env as Record<string, string> | undefined)
 ? (process.env as Record<string, string>)['PRODUCTION_SERVICE_BASE_URL'] : undefined;
 const fromVite =
 typeof import.meta !== 'undefined'
 ? (import.meta as unknown as { env?: { VITE_PRODUCTION_SERVICE_BASE_URL?: string } }).env
 ?.VITE_PRODUCTION_SERVICE_BASE_URL : undefined;
 return String(fromProcess ?? fromVite ?? 'http://localhost:8080');
}

function extractProtocolFromResponse(response: Response): string {
 // Node/fetch won't expose HTTP version consistently; try to infer
 // Keep as best-effort: if connection header mentions HTTP/2, etc., otherwise fallback
 try {
 const conn = response.headers.get('x-http-version') || response.headers.get('via') || '';
 if (conn.includes('HTTP/2') || conn.includes('h2')) return 'HTTP/2';
 return 'HTTP/1.1';
 } catch {
 return 'unknown';
 }
}

// Export singleton and class (avoid duplicate re-export)
export const productionServiceClient = new ProductionServiceClient();
export { ProductionServiceClient };




