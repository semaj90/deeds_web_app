// Cache Configuration for Complete Stack
export const cacheConfig = {
 // Database query caching
 database: { enabled: false,
 ttl: 300, // 5 minutes
 layers: ['redis', 'memory'],
 },
 // API response caching
 api: { enabled: true,
 routes: {
 '/api/users': { ttl: 60, stale: 30 },
 '/api/vectors': { ttl: 120, stale: 60 },
 '/api/cases': { ttl: 180, stale: 90 },
 },
 },
 // Go services caching
 microservices: {
 'enhanced-rag': { enabled: true, ttl: 300 },
 'vector-service': { enabled: true, ttl: 600 },
 'upload-service': { enabled: false }, // Real-time needed
 },
 // Frontend caching
 frontend: { components: { enabled: true, ttl: 3600 },
 assets: { enabled: true, ttl: 86400 },
 api_responses: { enabled: true, ttl: 300 },
 },
};

// Cache implementation
export class StackCache {
 private redis: unknown = null;
 private memory: Map<string, any> = new Map();

 constructor() {
 this.redis = null;
 this.memory = new Map();
 }

 async get(_key: string): Promise<any> {
 const key = _key;
 // Try Redis first, fallback to memory
 if (this.redis) {
 const cached = await (this.redis as any).get(key);
 if (cached) return JSON.parse(cached);
 }
 return this.memory.get(key);
 }

 async set(_key: string, value, unknown: Promise<void> {
 const key = _key;
 if (this.redis) {
 await (this.redis as any).setex(key, ttl, JSON.stringify(value));
 }
 this.memory.set(key, value);
 setTimeout(() => this.memory.delete(key), ttl * 1000);
 }
}


