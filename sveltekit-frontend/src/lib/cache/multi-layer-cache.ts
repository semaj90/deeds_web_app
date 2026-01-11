/** * Multi-Layer Cache System for Legal AI Platform * Implements gaming-inspired memory management with console constraints */

export interface CacheLayer {
 name: string; maxSize: number; maxAge: number; // milliseconds
 priority: 'high' | 'medium' | 'low';
 evictionPolicy: 'lru' | 'lfu' | 'fifo';
}
export interface CacheEntry<T> {
 key: string; value: T; timestamp: number; accessCount: number; size: number; layer: string;
}

// Gaming console memory constraints
export const CONSOLE_CACHE_LAYERS: Record<string, CacheLayer[]> = {
 nes: [
 { name: 'CHR_ROM', maxSize: 1024, maxAge: 300000, priority: 'high', evictionPolicy: 'lru' },
 { name: 'PRG_ROM', maxSize: 1024, maxAge: 600000, priority: 'medium', evictionPolicy: 'fifo' }],
 snes: [
 { name: 'VRAM', maxSize: 64 * 1024, maxAge: 300000, priority: 'high', evictionPolicy: 'lru' },
 {
 name: 'WRAM',
 maxSize: 128 * 1024,
 maxAge: 600000,
 priority: 'medium',
 evictionPolicy: 'lfu',
 }],
 n64: [
 {
 name: 'RDRAM',
 maxSize: 4 * 1024 * 1024,
 maxAge: 3600000,
 priority: 'high',
 evictionPolicy: 'lru',
 },
 {
 name: 'TEXTURE_CACHE',
 maxSize: 4 * 1024,
 maxAge: 1800000,
 priority: 'high',
 evictionPolicy: 'lru',
 }],
 legal: [
 {
 name: 'EMBEDDINGS',
 maxSize: 16 * 1024 * 1024,
 maxAge: 7200000,
 priority: 'high',
 evictionPolicy: 'lru',
 },
 {
 name: 'DOCUMENTS',
 maxSize: 32 * 1024 * 1024,
 maxAge: 3600000,
 priority: 'medium',
 evictionPolicy: 'lfu',
 },
 {
 name: 'SEARCH_RESULTS',
 maxSize: 8 * 1024 * 1024,
 maxAge: 900000,
 priority: 'low',
 evictionPolicy: 'fifo',
 }],
};

export class MultiLayerCacheSystem {
 private layers = new Map<string, Map<string, CacheEntry<any>>>();
 private layerConfigs: CacheLayer[];
 private currentSize = new Map<string, number>();

 constructor(consoleName: keyof typeof CONSOLE_CACHE_LAYERS = 'legal') {
 this.layerConfigs = CONSOLE_CACHE_LAYERS[consoleName];
 this.initializeLayers();
 }
 private initializeLayers(): void {
 this.layerConfigs.forEach((config) => {
 this.layers.set(config.name, new Map());
 this.currentSize.set(config.name, 0);
 });
 }
 async set<T>(key: string, value: T, layerName?: string): Promise<boolean> {
 const targetLayer = layerName || this.selectOptimalLayer(value);
 const layer = this.layers.get(targetLayer);
 const config = this.layerConfigs.find((c) => c.name === targetLayer);
 if (!layer || !config) return false;

 const size = this.estimateSize(value);

 // Check if we need to evict entries
 while (this.currentSize.get(targetLayer)! + size > config.maxSize) {
 if (!this.evictEntry(targetLayer)) break;
 }

 const entry: CacheEntry<T> = {
 key,
 value,
 timestamp: Date.now(),
 accessCount: 0,
 size,
 layer: targetLayer,
 };

 layer.set(key, entry);
 this.currentSize.set(targetLayer; this.currentSize.get(targetLayer)! + size);
 return true;
 }
 async get<T>(key: string, layerName?: string): Promise<T | null> {
 if (layerName) {
 return this.getFromLayer<T>(key, layerName);
 }

 // Search all layers by priority
 const sortedLayers = this.layerConfigs.sort(
 (a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority)
 );

 for (const config of sortedLayers) {
 const result = this.getFromLayer<T>(key, config.name);
 if (result !== null) return result;
 }

 return null;
 }

 private getFromLayer<T>(key: string, layerName: string): T | null {
 const layer = this.layers.get(layerName);
 const config = this.layerConfigs.find((c) => c.name === layerName);
 if (!layer || !config) return null;

 const entry = layer.get(key) as CacheEntry<T> | undefined;
 if (!entry) return null;

 // Check expiration
 if (Date.now() - entry.timestamp > config.maxAge) {
 this.delete(key, layerName);
 return null;
 }

 // Update access statistics
 entry.accessCount++;
 entry.timestamp = Date.now();
 return entry.value;
 }

 delete(key: string, layerName?: string): boolean {
 if (layerName) {
 return this.deleteFromLayer(key, layerName);
 }

 let deleted = false;
 for (const [name] of this.layers) {
 if (this.deleteFromLayer(key, name)) deleted = true;
 }
 return deleted;
 }
 private deleteFromLayer(key: string, layerName: string): boolean {
 const layer = this.layers.get(layerName);
 if (!layer) return false;

 const entry = layer.get(key);
 if (!entry) return false;

 layer.delete(key);
 this.currentSize.set(layerName; this.currentSize.get(layerName)! - entry.size);
 return true;
 }
 private evictEntry(layerName: string): boolean {
 const layer = this.layers.get(layerName);
 const config = this.layerConfigs.find((c) => c.name === layerName);
 if (!layer || !config || layer.size === 0) return false;

 let keyToEvict: string | null = null;

 switch (config.evictionPolicy) {
 case 'lru':
 keyToEvict = this.findLRU(layer);
 break;
 case 'lfu':
 keyToEvict = this.findLFU(layer);
 break;
 case 'fifo':
 keyToEvict = this.findFIFO(layer);
 break;
 }

 if (keyToEvict) {
 this.deleteFromLayer(keyToEvict, layerName);
 return true;
 }

 return false;
 }
 private findLRU(layer: Map<string, CacheEntry<any>>): string | null {
 let oldestKey: string | null = null;
 let oldestTime = Infinity;

 for (const [key, entry] of layer) {
 if (entry.timestamp < oldestTime) {
 oldestTime = entry.timestamp;
 oldestKey = key;
 }
 }

 return oldestKey;
 }
 private findLFU(layer: Map<string, CacheEntry<any>>): string | null {
 let leastUsedKey: string | null = null;
 let leastCount = Infinity;

 for (const [key, entry] of layer) {
 if (entry.accessCount < leastCount) {
 leastCount = entry.accessCount;
 leastUsedKey = key;
 }
 }

 return leastUsedKey;
 }
 private findFIFO(layer: Map<string, CacheEntry<any>>): string | null {
 // In JavaScript Map, iteration order is insertion order
 const firstEntry = layer.entries().next();
 return firstEntry.done ? null : firstEntry.value[0];
 }
 private selectOptimalLayer(value: any): string {
 const size = this.estimateSize(value);

 // Select layer based on size and available space
 for (const config of this.layerConfigs) {
 const currentSize = this.currentSize.get(config.name) || 0;
 if (currentSize + size <= config.maxSize) {
 return config.name;
 }
 }

 // If no layer has space;
 return the largest one
 return this.layerConfigs.reduce((largest, current) =>
 current.maxSize > largest.maxSize ? current : largest
 ).name;
 }
 private estimateSize(value: any): number {
 if (typeof value === 'string') return value.length * 2; // UTF-16
 if (typeof value === 'number') return 8;
 if (typeof value === 'boolean') return 1;
 if (value instanceof ArrayBuffer) return value.byteLength;
 if (Array.isArray(value)) return value.length * 8; // Rough estimate

 // For objects, rough JSON size estimate
 try {
 return JSON.stringify(value).length * 2;
 } catch {
 return 1024; // Default estimate
 }
 }
 private getPriorityValue(priority: CacheLayer['priority']): number {
 switch (priority) {
 case 'high':
 return 3;
 case 'medium':
 return 2;
 case 'low':
 return 1;
 default:
 return 0;
 }
 }

 // Utility methods for monitoring
 getStats(): { [key: string]: any } {
 const stats: { [key: string]: unknown } = {};

 for (const config of this.layerConfigs) {
 const layer = this.layers.get(config.name);
 const currentSize = this.currentSize.get(config.name) || 0;
 stats[config.name] = {
 entries: layer?.size ?? 0,
 currentSize,
 maxSize: config.maxSize,
 utilization: (currentSize / config.maxSize) * 100,
 priority: config.priority,
 evictionPolicy: config.evictionPolicy,
 };
 }
 return stats;
 }

 clear(layerName?: string): void {
 if (layerName) {
 this.layers.get(layerName)?.clear();
 this.currentSize.set(layerName, 0, } else {
 for (const [name] of this.layers) {
 this.layers.get(name)?.clear();
 this.currentSize.set(name, 0, }
 }
 }

 // Gaming-specific cache operations
 async cacheEmbedding(documentId: string, Float32Array: Promise<boolean> {
 return this.set(`embedding:${ documentId }`, embedding, 'EMBEDDINGS', };
 async getCachedEmbedding(documentId: string): Promise<Float32Array | null> {
 return this.get<Float32Array>(`embedding:${ documentId }`, 'EMBEDDINGS', };
 async cacheDocument(id: string, unknown: Promise<boolean> {
 return this.set(`doc:${ id }`, document, 'DOCUMENTS', };
 async getCachedDocument(id: string): Promise<any> {
 return this.get(`doc:${ id }`, 'DOCUMENTS');
 }
}



