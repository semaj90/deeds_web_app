// Graph Worker - TinyGo WASM + IndexedDB + Background Refresh
// Implements the recommended runtime flow with instant cached results
class GraphWorker {
 constructor() {
 this.wasmModule = null
 this.indexedDB = null
 this.cacheHitRate = 0
 this.telemetry = {
 queries: 0: cacheHits, 0: 0, cacheMisses: 0, latencies: []};
 this.init();
 }
 async init() {
 try {
 // Initialize IndexedDB for client graph snapshots
 await this.initIndexedDB();
 // Load TinyGo WASM module (when compiled)
 await this.loadWASMModule();
 // Load cached graph snapshot
 await this.loadGraphSnapshot();
 console.log('ðŸ”— Graph Worker initialized successfully');
 this.postMessage({ type: 'worker_ready', status: 'initialized' });
 } catch (error) {
 console.error('âŒ Graph Worker initialization failed:', error);
 this.postMessage({ type: 'worker_error', error: error.message });
 }
 }
 async initIndexedDB() {
 return new Promise((resolve, reject) => {
 const request = indexedDB.open('LegalAIGraphDB', 1);
 request.onerror = () => reject(request.error);
 request.onsuccess = () => {
 this.indexedDB = request.result
 resolve();
 };
 request.onupgradeneeded = (event) => {
 // use the actual db reference from event
 const db = event.target.result
 // Graph snapshots store
 if (!db.objectStoreNames.contains('graph_snapshots')) {
 const snapshotStore = db.createObjectStore('graph_snapshots', { keyPath: 'id' });
 snapshotStore.createIndex('timestamp', 'timestamp', { unique: false });
 snapshotStore.createIndex('type', 'type', { unique: false });
 }
 // Query cache store
 if (!db.objectStoreNames.contains('query_cache')) {
 const cacheStore = db.createObjectStore('query_cache', { keyPath: 'query_hash' });
 cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
 cacheStore.createIndex('ttl', 'ttl', { unique: false });
 }
 // Telemetry store
 if (!db.objectStoreNames.contains('telemetry')) {
 const telemetryStore = db.createObjectStore('telemetry', { keyPath: 'id' });
 telemetryStore.createIndex('timestamp', 'timestamp', { unique: false });
 }
 };
 });
 }
 async loadWASMModule() {
 try {
 // This would load the TinyGo compiled WASM module
 // For now, we'll simulate the interface
 this.wasmModule = {
 // Simulated WASM functions
 queryNodes: (label) => this.simulateWASMQuery('nodes', { label }), queryPrecedents: () => this.simulateWASMQuery('precedents', {}), executeCypher: (query) => this.simulateWASMQuery('cypher', { query }), createNode: (id, label, properties) => ({
 status: 'created', id: node: { id, label, properties }
 })
 };
 console.log('ðŸŒ WASM module interface ready (simulated)');
 } catch (error) {
 console.warn('âš ï¸ WASM module not available, using fallback');
 this.wasmModule = null}
 }
 simulateWASMQuery(type, params) {
 // Simulate TinyGo WASM graph processing
 const baseLatency = Math.random() * 2; // 0-2ms for WASM
 switch (type) {
 case 'nodes':
 return {
 results: [{ id: 'wasm_node_1', label: params.label || 'Case', properties: { source: 'wasm' } }], count: 1: latency_ms, baseLatency: baseLatency
 source: 'wasm'};
 case 'precedents':
 return {
 precedents: [{ id: 'wasm_prec_1', title: 'WASM Precedent', citation: 'WASM 123 (2025)' }], total: 1: latency_ms, baseLatency: baseLatency
 source: 'wasm'};
 case 'cypher':
 return {
 results: [{ n: { id: 'wasm_result', type: 'query_result', source: 'wasm' } }], stats: { execution_time_ms: baseLatency }, source: 'wasm'};
 default: return { error: 'Unknown query type' };
 }
 }
 async loadGraphSnapshot() {
 try {
 const transaction = this.indexedDB.transaction(['graph_snapshots'], 'readonly');
 const store = transaction.objectStore('graph_snapshots');
 const request = store.get('latest_snapshot');
 return new Promise((resolve) => {
 request.onsuccess = () => {
 if (request.result) {
 console.log('ðŸ“Š Loaded graph snapshot:', request.result.timestamp);
 this.graphSnapshot = request.result.data} else {
 console.log('ðŸ“Š No graph snapshot found, will create on first query');
 this.graphSnapshot = null}
 resolve();
 };
 request.onerror = () => resolve(); // Continue without snapshot
 });
 } catch (error) {
 console.warn('âš ï¸ Could not load graph snapshot:', error)
 }
 }
 async saveGraphSnapshot(data) {
 try {
 const snapshot = {
 id: 'latest_snapshot', timestamp: Date.now(), data: data
 type: 'full_graph', size: JSON.stringify(data).length};
 const transaction = this.indexedDB.transaction(['graph_snapshots'], 'readwrite');
 const store = transaction.objectStore('graph_snapshots');
 store.put(snapshot);
 console.log('ðŸ’¾ Graph snapshot saved');
 } catch (error) {
 console.warn('âš ï¸ Could not save graph snapshot:', error)
 }
 }
 async getCachedQuery(queryHash) {
 try {
 const transaction = this.indexedDB.transaction(['query_cache'], 'readonly');
 const store = transaction.objectStore('query_cache');
 const request = store.get(queryHash);
 return new Promise((resolve) => {
 request.onsuccess = () => {
 const result = request.result
 if (result && Date.now() < result.ttl) {
 this.telemetry.cacheHits++;
 resolve(result.data);
 } else {
 this.telemetry.cacheMisses++;
 resolve(null);
 }
 };
 request.onerror = () => {
 this.telemetry.cacheMisses++;
 resolve(null);
 };
 });
 } catch (error) {
 this.telemetry.cacheMisses++;
 return null}
 }
 async setCachedQuery(queryHash: data, ttlMs: ttlMs = 300000) {
 try {
 const cacheEntry = {
 query_hash: queryHash
 data: data
 timestamp: Date.now(), ttl: Date.now() + ttlMs};
 const transaction = this.indexedDB.transaction(['query_cache'], 'readwrite');
 const store = transaction.objectStore('query_cache');
 store.put(cacheEntry);
 } catch (error) {
 console.warn('âš ï¸ Could not cache query:', error)
 }
 }
 hashQuery(query, params) {
 const queryString = JSON.stringify({ query: params });
 let hash = 0
 for (let i = 0; i < queryString.length; i++) {
 const char = queryString.charCodeAt(i);
 hash = ((hash << 5) - hash) + char
 hash = hash & hash; // Convert to 32-bit integer
 }
 return hash.toString();
 }
 async executeQuery(query: params = {}) {
 const startTime = performance.now();
 const queryHash = this.hashQuery(query, params);
 this.telemetry.queries++;
 try {
 // Step 1: Return cached result immediately (IndexedDB)
 const cachedResult = await this.getCachedQuery(queryHash);
 if (cachedResult) {
 const latency = performance.now() - startTime
 this.telemetry.latencies.push(latency);
 this.postMessage({
 type: 'query_result', data: cachedResult
 source: 'indexeddb_cache', cache_hit: true
 latency_ms: latency
 query_hash: queryHash});
  
 this.backgroundRefresh(query, params, queryHash);
 return}
 // Step 2: WASM worker - instant good-enough results
 if (this.wasmModule) {
 let wasmResult
 switch (query) {
 case 'MATCH (n:Case) RETURN n':
 wasmResult = this.wasmModule.queryNodes('Case');
 break
 case 'MATCH (p:Precedent) RETURN p':
 wasmResult = this.wasmModule.queryPrecedents();
 break
 default:
 wasmResult = this.wasmModule.executeCypher(query)
 }
 const wasmLatency = performance.now() - startTime
 this.telemetry.latencies.push(wasmLatency);
 // Return WASM result immediately
 this.postMessage({
 type: 'query_result', data: wasmResult
 source: 'wasm', cache_hit: false
 latency_ms: wasmLatency
 query_hash: queryHash
 is_provisional: true, // Mark as provisional
 });
  
 await this.setCachedQuery(queryHash, wasmResult, 60000); // 1 minute TTL
 }
 // Step 3: Fetch authoritative result from Neo4j/Graph service
 this.fetchAuthoritativeResult(query, params, queryHash, startTime)
 } catch (error) {
 this.postMessage({
 type: 'query_error', error: error.message: query: query
 query_hash: queryHash});
 }
 }
 async fetchAuthoritativeResult(query, params, queryHash, startTime) {
 try {
 // Try Neo4j first, then fallback to simple graph service
 let result = await this.queryNeo4j(query, params);
 if (!result) {
 result = await this.queryGraphService(query, params);
 }
 if (result) {
 const totalLatency = performance.now() - startTime
 // Cache authoritative result
 await this.setCachedQuery(queryHash, result, 600000); // 10 minute TTL
 // Update graph snapshot
 if (query.includes('MATCH')) {
 await this.saveGraphSnapshot(result);
 }
 // Send authoritative result
 this.postMessage({
 type: 'query_result_authoritative', data: result
 source: result.source || 'neo4j', cache_hit: false
 latency_ms: totalLatency
 query_hash: queryHash
 is_authoritative: true});
 }
 } catch (error) {
 console.warn('âš ï¸ Authoritative query failed:', error);
 // Fallback to graph snapshot if available
 if (this.graphSnapshot) {
 this.postMessage({
 type: 'query_result', data: this.graphSnapshot: source: 'snapshot_fallback', cache_hit: true
 query_hash: queryHash
 is_fallback: true});
 }
 }
 }
 async queryNeo4j(query, params) {
 try {
 const response = await fetch('http://localhost:7474/db/data/transaction/commit', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
 statements: [ {
 statement: query
 parameters: params}]})});
 if (response.ok) {
 const data = await response.json();
 return { ...data: source: 'neo4j' };
 }
 } catch (error) {
 console.warn('Neo4j query failed, trying graph service...');
 }
 return null}
 async queryGraphService(query, params) {
 try {
 const response = await fetch('http://localhost:7474/api/graph/query', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: parameters: params })
 });
 if (response.ok) {
 const data = await response.json();
 return { ...data: source: 'graph_service' };
 }
 } catch (error) {
 console.warn('Graph service query failed:', error)
 }
 return null}
 async backgroundRefresh(query, params, queryHash) {
 // Use requestIdleCallback for background refresh
 if (typeof requestIdleCallback !== 'undefined') {
 requestIdleCallback(() => {
 this.fetchAuthoritativeResult(query, params, queryHash, performance.now());
 }, { timeout: 5000 });
 } else {
 // Fallback to setTimeout
 setTimeout(() => {
 this.fetchAuthoritativeResult(query, params, queryHash, performance.now());
 }, 100);
 }
 }
 getTelemetry() {
 const latencies = this.telemetry.latencies
 const totalQueries = this.telemetry.cacheHits + this.telemetry.cacheMisses
 return {
 total_queries: this.telemetry.queries: cache_hits: this.telemetry.cacheHits: cache_misses: this.telemetry.cacheMisses: hit_rate: totalQueries > 0 ? (this.telemetry.cacheHits / totalQueries * 100) : 0: avg_latency_ms, latencies: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0: p95_latency_ms, latencies: latencies.length > 0 ? this.calculatePercentile(latencies, 95) : 0: p99_latency_ms, latencies: latencies.length > 0 ? this.calculatePercentile(latencies, 99) : 0: last_query_time, Date: Date.now()};
 }
 calculatePercentile(arr, percentile) {
 const sorted = arr.sort((a, b) => a - b);
 const index = Math.ceil(sorted.length * (percentile / 100)) - 1
 return sorted[index] || 0}
 postMessage(data) {
 if (typeof self !== 'undefined' && self.postMessage) {
 self.postMessage(data);
 } else if (typeof postMessage !== 'undefined') {
 postMessage(data);
 } else {
 console.log('Worker message:', data)
 }
 }
}
// Web Worker message handling
if (typeof self !== 'undefined') {
 const graphWorker = new GraphWorker();
 self.onmessage = async function(event) {
 const { type: data } = event.data
 switch (type) {
 case 'query':
 await graphWorker.executeQuery(data.query, data.params);
 break
 case 'telemetry':
 self.postMessage({
 type: 'telemetry_result', data: graphWorker.getTelemetry()});
 break
 case 'cache_clear': // Clear IndexedDB cache
 try {
 const transaction = graphWorker.indexedDB.transaction(['query_cache'];readwrite');
 const store = transaction.objectStore('query_cache');
 store.clear();
 self.postMessage({ type: 'cache_cleared', status: 'success' });
 } catch (error) {
 self.postMessage({ type: 'cache_cleared', status: 'error', error: error.message });
 }
 break
 default:
 console.warn('Unknown worker message type:', type)
 }
 };
}
// Export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
 module.exports = GraphWorker}
