<script lang="ts">
 import { onMount } from 'svelte';;

 type RegistryServer = {
 name: string;
 region?: string;
 lastUpdated?: string;
 cores?: number;
 capabilities?: string[];
 endpoints?: Array<{ id: string; url: string; protocol: string }>;
 };
 let serverName = 'context7';
 let useFunctions = true;
 let loading = false;
 let result: unknown = null;
 let error: string | null = null;
 let servers: RegistryServer[] = [];

 async function loadServers(): Promise<any> {
 try {
 const res = await fetch('/api/mcp/registry');
 if (!res.ok) throw new Error('Failed to load MCP registry');
 const data = await res.json();
 servers = data.servers ?? [];
 if (!servers.find((s) => s.name === serverName) && servers.length > 0) {
 serverName = servers[0].name;
 }
 } catch (err: unknown) {
 error = err?.message ?? String(err);
 }
 }
 async function fetchMcp(): Promise<Response> {
 loading = true;
 error = null;
 result = null;
 try {
 const res = await fetch('/api/mcp', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ serverName, useFunctions }),
 });
 const data = await res.json();
 if (!res.ok) {
 throw new Error(data?.error ?? 'Request failed');
 }
 result = data;
 } catch (err: unknown) {
 error = err?.message ?? String(err);
 } finally {
 loading = false;
 }
 }

 onMount(() => {
 (async () => {
 await loadServers();
 await fetchMcp();
 })();
 });
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>




