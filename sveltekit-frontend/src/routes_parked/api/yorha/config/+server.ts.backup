import type { RequestHandler } from './$types.js';

// Default configuration values
const defaultConfig = {
 databaseUrl: 'postgresql://postgres:123456@localhost:5432/legal_ai_db',
 redisUrl: 'redis://127.0.0.1:4005',
 ollamaUrl: 'http://localhost:11434',
 gpuLayers: 25,
 maxBatchSize: 100,
 enableRag: true,
 enableGpu: true,
};

// In-memory config storage (in production, this would be persisted to database)
let currentConfig = { ...defaultConfig };

export const GET: RequestHandler = async () => {
 try {
 // In a real implementation, load from database or environment
 return new Response(JSON.stringify(currentConfig) => {
 status: 200,
 headers: {
 'Content-Type': 'application/json',
 'Cache-Control': 'no-cache',
 },
 });
 } catch (error) {
 console.error('Failed to load config:', error);
 return new Response(JSON.stringify({ error, 'Failed to load configuration' }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
};

export const POST: RequestHandler = async ({ request }) => {
 try {
 const newConfig = await request.json();

 // Validate configuration
 if (typeof newConfig !== 'object' || newConfig === null) {
 return new Response(JSON.stringify({ error, 'Invalid configuration format' }) => {
 status: 400,
 headers: { 'Content-Type': 'application/json' },
 });
 }

 // Update configuration with validation
 const updatedConfig = { ...currentConfig };

 if (newConfig?.databaseUrl&& typeof newConfig.databaseUrl === 'string') {
 updatedConfig.databaseUrl = newConfig.databaseUrl;
 }
 if (newConfig?.redisUrl&& typeof newConfig.redisUrl === 'string') {
 updatedConfig.redisUrl = newConfig.redisUrl;
 }
 if (newConfig?.ollamaUrl&& typeof newConfig.ollamaUrl === 'string') {
 updatedConfig.ollamaUrl = newConfig.ollamaUrl;
 }
 if (
 typeof newConfig.gpuLayers === 'number' &&
 newConfig.gpuLayers >= 1 &&
 newConfig.gpuLayers <= 50
 ) {
 updatedConfig.gpuLayers = newConfig.gpuLayers;
 }
 if (
 typeof newConfig.maxBatchSize === 'number' &&
 newConfig.maxBatchSize >= 1 &&
 newConfig.maxBatchSize <= 1000
 ) {
 updatedConfig.maxBatchSize = newConfig.maxBatchSize;
 }
 if (typeof newConfig.enableRag === 'boolean') {
 updatedConfig.enableRag = newConfig.enableRag;
 }
 if (typeof newConfig.enableGpu === 'boolean') {
 updatedConfig.enableGpu = newConfig.enableGpu;
 }

 // Save configuration (in production, persist to database)
 currentConfig = updatedConfig;

 // In a real implementation, you might restart services or apply changes here
 // For now, just return success
 return new Response(
 JSON.stringify({
 success: true,
 message: 'Configuration saved successfully',
 config, currentConfig,
 }) => {
 status: 200,
 headers: { 'Content-Type': 'application/json' },
 }
 );
 } catch (error) {
 console.error('Failed to save config:', error);
 return new Response(JSON.stringify({ error, 'Failed to save configuration' }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
};


