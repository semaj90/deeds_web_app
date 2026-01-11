/**
 * SIMD JSON Integration for Legal AI Platform
 * Connects Node.js frontend with Go SIMD microservices
 */

const SIMD_SERVERS = {
 primary: 'http://localhost:8097', // Main SIMD parser service
 accelerator: 'http://localhost:8095', // SIMD JSON accelerator
 fallback: 'http://localhost:8099' // HTTP fallback server
};

/**
 * Check if SIMD services are available
 */
export async function checkSIMDStatus() {
 const status = {
 primary: false,
 accelerator: false,
 fallback: false,
 available: false
 };

 try {
 // Check primary SIMD service
 const primaryResp = await fetch(`${SIMD_SERVERS.primary}/health`, {
 timeout: 2000,
 headers: { 'Content-Type': 'application/json' }
 });
 status.primary = primaryResp.ok;
 } catch (e) {
 console.warn('Primary SIMD service unavailable:', e.message);
 }

 try {
 // Check accelerator service
 const accelResp = await fetch(`${SIMD_SERVERS.accelerator}/api/v1/benchmark/json`, {
 timeout: 2000,
 headers: { 'Content-Type': 'application/json' }
 });
 status.accelerator = accelResp.ok;
 } catch (e) {
 console.warn('SIMD accelerator unavailable:', e.message);
 }

 try {
 // Check fallback service
 const fallbackResp = await fetch(`${SIMD_SERVERS.fallback}/version`, {
 timeout: 2000,
 headers: { 'Content-Type': 'application/json' }
 });
 status.fallback = fallbackResp.ok;
 } catch (e) {
 console.warn('SIMD fallback service unavailable:', e.message);
 }

 status.available = status.primary || status.accelerator || status.fallback;

 if (status.available) {
 console.log('✅ SIMD JSON services available:', status);
 } else {
 console.warn('⚠️ No SIMD JSON services available, using standard JSON parsing');
 }

 return status;
}

/**
 * Enhanced RabbitMQ message processing with SIMD JSON parsing
 * Automatically detects and parses JSON fields in RabbitMQ messages
 */
export async function enhanceRabbitMQMessage(message) {
 if (!message || typeof message !== 'object') {
 return message;
 }

 const enhanced = { ...message };
 const status = await checkSIMDStatus();

 if (!status.available) {
 // Fallback to standard JSON parsing for JSON string fields
 const jsonFields = ['payload', 'metadata', 'analysis', 'results', 'data'];
 for (const field of jsonFields) {
 if (enhanced[field] && typeof enhanced[field] === 'string') {
 try {
 enhanced[field] = JSON.parse(enhanced[field]);
 enhanced[`${field}_parsed`] = true;
 } catch (e) {
 console.warn(`Failed to parse JSON field ${field}:`, e.message);
 }
 }
 }
 return enhanced;
 }

 // Use SIMD services for enhanced parsing
 try {
 // Determine which service to use
 let serviceUrl = status.primary ? SIMD_SERVERS.primary :
 status.accelerator ? SIMD_SERVERS.accelerator :
 SIMD_SERVERS.fallback;

 // Process JSON fields with SIMD
 const jsonFields = ['payload', 'metadata', 'analysis', 'results', 'data'];

 for (const field of jsonFields) {
 if (enhanced[field] && typeof enhanced[field] === 'string') {
 try {
 const parseResponse = await fetch(`${serviceUrl}/parse`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 text: enhanced[field],
 type: 'rabbitmq_field',
 field: field
 }),
 timeout: 5000
 });

 if (parseResponse.ok) {
 const result = await parseResponse.json();
 if (result.result && !result.error) {
 enhanced[field] = result.result;
 enhanced[`${field}_simd_parsed`] = true;
 enhanced[`${field}_parse_time`] = result.latency;
 console.log(`🚀 SIMD parsed ${field} in ${result.latency}ms`);
 } else {
 // Fallback to standard parsing
 enhanced[field] = JSON.parse(enhanced[field]);
 enhanced[`${field}_parsed`] = true;
 }
 } else {
 // Fallback to standard parsing
 enhanced[field] = JSON.parse(enhanced[field]);
 enhanced[`${field}_parsed`] = true;
 }
 } catch (e) {
 console.warn(`SIMD parsing failed for ${field}, using fallback:`, e.message);
 try {
 enhanced[field] = JSON.parse(enhanced[field]);
 enhanced[`${field}_parsed`] = true;
 } catch (fallbackError) {
 console.error(`Failed to parse ${field} with any method:`, fallbackError.message);
 }
 }
 }
 }

 // Add SIMD processing metadata
 enhanced._simd_processed = true;
 enhanced._simd_timestamp = Date.now();
 enhanced._simd_services = status;

 return enhanced;

 } catch (error) {
 console.error('SIMD enhancement failed, returning original message:', error);
 return message;
 }
}

/**
 * SIMD-accelerated JSON parsing for large payloads
 */
export async function parseLargeJSON(jsonString, options = {}) {
 const status = await checkSIMDStatus();

 if (!status.available) {
 return JSON.parse(jsonString);
 }

 try {
 let serviceUrl = status.primary ? SIMD_SERVERS.primary :
 status.accelerator ? SIMD_SERVERS.accelerator :
 SIMD_SERVERS.fallback;

 const parseResponse = await fetch(`${serviceUrl}/parse`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 text: jsonString,
 type: options.type || 'large_payload',
 ...options
 }),
 timeout: options.timeout || 10000
 });

 if (parseResponse.ok) {
 const result = await parseResponse.json();
 if (result.result && !result.error) {
 console.log(`🚀 SIMD parsed large JSON (${jsonString.length} chars) in ${result.latency}ms`);
 return result.result;
 }
 }

 // Fallback
 return JSON.parse(jsonString);

 } catch (error) {
 console.warn('SIMD large JSON parsing failed, using fallback:', error.message);
 return JSON.parse(jsonString);
 }
}

/**
 * Batch SIMD JSON parsing for multiple documents
 */
export async function parseJSONBatch(jsonStrings, options = {}) {
 const status = await checkSIMDStatus();

 if (!status.available || !status.accelerator) {
 // Fallback to standard parsing
 return jsonStrings.map(str => {
 try {
 return JSON.parse(str);
 } catch (e) {
 console.error('Failed to parse JSON in batch:', e.message);
 return null;
 }
 });
 }

 try {
 // Use accelerator service for batch processing
 const batchPayload = jsonStrings.map((text, index) => ({
 text,
 type: 'batch_item',
 index
 }));

 const batchResponse = await fetch(`${SIMD_SERVERS.accelerator}/api/v1/parse/batch`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(batchPayload),
 timeout: options.timeout || 15000
 });

 if (batchResponse.ok) {
 const results = await batchResponse.json();
 console.log(`🚀 SIMD batch parsed ${jsonStrings.length} documents`);
 return results;
 }

 // Fallback
 return jsonStrings.map(str => {
 try {
 return JSON.parse(str);
 } catch (e) {
 console.error('Failed to parse JSON in batch fallback:', e.message);
 return null;
 }
 });

 } catch (error) {
 console.warn('SIMD batch parsing failed, using fallback:', error.message);
 return jsonStrings.map(str => {
 try {
 return JSON.parse(str);
 } catch (e) {
 console.error('Failed to parse JSON in batch fallback:', e.message);
 return null;
 }
 });
 }
}

/**
 * SIMD JSON serialization (when available)
 */
export async function stringifyFast(obj, options = {}) {
 const status = await checkSIMDStatus();

 if (!status.available) {
 return JSON.stringify(obj, null, options.indent);
 }

 try {
 // For now, use standard stringify but mark as SIMD-capable
 const result = JSON.stringify(obj, null, options.indent);
 console.log(`📝 JSON stringified (${result.length} chars) - SIMD services available for parsing`);
 return result;

 } catch (error) {
 console.error('JSON stringify failed:', error);
 throw error;
 }
}

/**
 * Get SIMD performance metrics
 */
export async function getSIMDMetrics() {
 const status = await checkSIMDStatus();

 if (!status.accelerator) {
 return { available: false, message: 'SIMD accelerator service not available' };
 }

 try {
 const response = await fetch(`${SIMD_SERVERS.accelerator}/api/v1/benchmark/json`, {
 timeout: 5000
 });

 if (response.ok) {
 const metrics = await response.json();
 return {
 available: true,
 ...metrics,
 services: status
 };
 }

 return { available: false, message: 'Failed to get metrics' };

 } catch (error) {
 console.error('Failed to get SIMD metrics:', error);
 return { available: false, message: error.message };
 }
}

// Auto-initialize status check on module load
checkSIMDStatus().catch(e => console.warn('Initial SIMD status check failed:', e));