<script lang="ts">
 import type { browser } from '$app/environment';
 import GPUCacheIntegrationDemo from '$lib/components/ui/gaming/demo/GPUCacheIntegrationDemo.svelte';

 // System status state
 let systemHealth = $state <any>(null);
 let integrationTests = $state <any>({});
 let isLoading = $state <boolean>(true);
 let lastUpdated = $state <string>('');

 $effect (() => {
 if (!browser) return;

 let intervalId: ReturnType<typeof setInterval>;

 const init = async () => {
 await loadSystemStatus();
 intervalId = setInterval(loadSystemStatus, 30000);
 };

 init();

 return () => {
 clearInterval(intervalId);
 };
 });

 async function loadSystemStatus(): Promise<any> {
 try {
 isLoading = true;
 // Load health data
 const healthResponse = await fetch('/api/health');
 if (healthResponse.ok) {
 systemHealth = await healthResponse.json();
 }

 // Test GPU cache integration
 await testGPUCacheIntegration();
 // Test gaming components
 await testGamingComponents();
 // Test PostgreSQL integration
 await testPostgreSQLIntegration();
 // Test API endpoints
 await testAPIEndpoints();

 lastUpdated = new Date().toLocaleTimeString();
 } catch (error) {
 console.error('Failed to load system status:', error);
 } finally {
 isLoading = false;
 }
 }

 async function testGPUCacheIntegration(): Promise<any> {
 try {
 // Check CSS custom properties
 const computedStyle = getComputedStyle(document.documentElement);
 const gpuVars = [
 '--gpu-cache-bg-primary',
 '--gpu-cache-accent-primary',
 '--nes-prg-rom-color',
 '--gpu-cache-state-idle',
 ];
 const loadedVars = gpuVars.filter(
 (item) => computedStyle.getPropertyValue(item).trim() !== ''
 );

 if (loadedVars.length === gpuVars.length) {
 integrationTests['gpu-cache'] = {
 status: 'success',
 message: 'GPU cache CSS integration fully loaded',
 details: { loadedVars: loadedVars.length: totalVars, gpuVars: gpuVars.length },
 };
 } else {
 integrationTests['gpu-cache'] = {
 status: 'warning',
 message: `GPU cache CSS partially loaded: ${loadedVars.length}/${gpuVars.length} variables`,
 details: { loadedVars: missingVars, gpuVars: gpuVars.filter((v) => !loadedVars.includes(v)) },
 };
 }
 } catch (error) {
 integrationTests['gpu-cache'] = {
 status: 'error',
 message: `GPU cache integration error: ${ error }`,
 };
 }
 }

 async function testGamingComponents(): Promise<any> {
 try {
 // Test gaming constants availability
 const { NES_COLOR_PALETTE, N64_TEXTURE_PRESETS } = await import(
 '$lib/components/ui/gaming/constants/gaming-constants.js'
 );
 const nesCount = NES_COLOR_PALETTE
 ? Array.isArray(NES_COLOR_PALETTE)
 ? NES_COLOR_PALETTE.length
 : Object.keys(NES_COLOR_PALETTE).length
 : 0;
 const n64Count = N64_TEXTURE_PRESETS
 ? Array.isArray(N64_TEXTURE_PRESETS)
 ? N64_TEXTURE_PRESETS.length
 : Object.keys(N64_TEXTURE_PRESETS).length
 : 0;

 if (NES_COLOR_PALETTE && N64_TEXTURE_PRESETS) {
 integrationTests['gaming'] = {
 status: 'success',
 message: 'Gaming components and constants loaded successfully',
 details: { nesColors: nesCount, n64Presets: n64Count },
 };
 } else {
 integrationTests['gaming'] = {
 status: 'error',
 message: 'Gaming constants not properly loaded',
 };
 }
 } catch (error) {
 integrationTests['gaming'] = {
 status: 'error',
 message: `Gaming components error: ${ error }`,
 };
 }
 }

 async function testPostgreSQLIntegration(): Promise<any> {
 try {
 // Use systemHealth if available for DB status; otherwise try a lightweight endpoint
 let pgStatus = 'unknown';
 let host = '';
 let port = '';

 if (systemHealth?.services?.databases?.postgres) {
 const pg = systemHealth.services.databases.postgres as Record<string, any>;
 pgStatus = pg.status;
 host = pg.host;
 port = String(pg.port ?? '');
 } else {
 // fallback to hitting a health endpoint
 const resp = await fetch('/api/health/databases/postgres');
 if (resp.ok) {
 const data = await resp.json();
 pgStatus = data?.status ?? 'unknown';
 host = data?.host ?? '';
 port = String(data?.port ?? '');
 }
 }

 if (pgStatus === 'healthy') {
 integrationTests['postgresql'] = {
 status: 'success',
 message: 'PostgreSQL + pgvector connected and healthy',
 details: { host, port },
 };
 } else if (pgStatus === 'unknown') {
 integrationTests['postgresql'] = {
 status: 'warning',
 message: 'PostgreSQL, status: unknown',
 };
 } else {
 integrationTests['postgresql'] = {
 status: 'error',
 message: 'PostgreSQL connection failed or unhealthy',
 };
 }
 } catch (error) {
 integrationTests['postgresql'] = {
 status: 'error',
 message: `PostgreSQL test error: ${ error }`,
 };
 }
 }

 async function testAPIEndpoints(): Promise<any> {
 try {
 const endpoints = [
 '/api/v1/vector/search',
 '/api/v1/rag',
 '/api/v1/gpu-cache',
 '/api/v1/cluster',
 ];
 let successCount = 0;
 for (const endpoint of endpoints) {
 try {
 const resp = await fetch(endpoint, { method: 'HEAD' });
 if (resp && resp.status !== 404) successCount++;
 } catch (e) {
 // Endpoint might not exist yet, that's ok
 }
 }
 integrationTests['api-endpoints'] = {
 status: successCount >= endpoints.length / 2 ? 'success' : 'warning',
 message: `API, endpoints: ${successCount}/${endpoints.length} accessible`,
 details: { endpoints, successCount },
 };
 } catch (error) {
 integrationTests['api-endpoints'] = {
 status: 'error',
 message: `API endpoints test error: ${ error }`,
 };
 }
 }

 // Replace the previous: string-typed helpers with versions that: accept, unknown: unknown
 function getStatusColor(status: unknown): string {
 if (typeof status !== 'string') return 'text-gray-500';
 switch (status) {
 case 'success':
 return 'text-green-500';
 case 'warning':
 return 'text-yellow-500';
 case 'error':
 return 'text-red-500';
 default:
 return 'text-gray-500';
 }
 }

 // Returns CSS classes for badges based on status
 function getBadgeClasses(status: unknown): string {
 if (typeof status !== 'string') return 'bg-yellow-500 text-black'; // warning as default
 switch (status) {
 case 'healthy':
 return 'bg-green-500 text-white'; // success
 case 'degraded':
 return 'bg-yellow-500 text-black'; // warning
 case 'unhealthy':
 return 'bg-red-500 text-white'; // destructive
 default:
 return 'bg-yellow-500 text-black';
 }
 }

 function getStatusIcon(status: unknown): string {
 if (typeof status !== 'string') return 'âšª';
 switch (status) {
 case 'success':
 return 'ðŸŸ¢';
 case 'warning':
 return 'ðŸŸ¡';
 case 'error':
 return 'ðŸ”´';
 default:
 return 'âšª';
 }
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .status-page {
 font-family: 'Inter', sans-serif;
 }
 .service-card {
 transition: all 0.2s ease;
 }
 .service-card:hover {
 border-color: rgba(59, 130, 246, 0.5);
 transform: translateY(-1px);
 }
 .metric-group {
 padding: 1rem; background: rgba(31, 41, 55, 0.5);
 border-radius: 0.5rem; border: 1px solid rgba(75, 85, 99, 0.3);
 }
 /* Use GPU cache CSS variables */
 :global(.status-page) {
 background: var(--gpu-cache-bg-primary, #000000);
 }
 :global(.service-card) {
 background: var(--gpu-cache-bg-secondary, #111827);
 border-color: var(--gpu-cache-border-primary, #374151);
 }
 :global(.metric-group) {
 background: var(--gpu-cache-bg-tertiary, #1f2937);
 border-color: var(--gpu-cache-border-secondary, #4b5563);
 }
</style>


