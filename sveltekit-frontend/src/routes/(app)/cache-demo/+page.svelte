<script lang="ts">
	import { CacheStrategies, useCache } from '$lib/cache/cache-service.svelte';
	import CacheMonitor from '$lib/components/cache/CacheMonitor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index';
	import Activity from 'lucide-svelte/icons/activity';
	import Database from 'lucide-svelte/icons/database';
	import Download from 'lucide-svelte/icons/download';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Upload from 'lucide-svelte/icons/upload';
	import Zap from 'lucide-svelte/icons/zap';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

	const cache = useCache();

	let testKey = $state('test-key-1');
	let testValue = $state('Hello from cache!');
	let retrievedValue = $state<string | null>(null);
	let healthStatus = $state(cache.healthCheck());
	let cacheStats = $derived(cache.stats);

	async function testMemoryCache() {
		await cache.set(testKey, testValue, CacheStrategies.MEMORY_ONLY);
		console.log('✅ Saved to memory cache');
	}

	async function testPersistentCache() {
		await cache.set(testKey, testValue, CacheStrategies.PERSISTENT_ONLY);
		console.log('✅ Saved to persistent cache');
	}

	async function testTwoLayerCache() {
		await cache.set(testKey, testValue, CacheStrategies.TWO_LAYER);
		console.log('✅ Saved to both caches');
	}

	async function retrieveFromCache() {
		const result = await cache.get<string>(testKey);
		retrievedValue = result;
		console.log('📦 Retrieved:', result);
	}

	async function clearAllCaches() {
		await cache.clearAll();
		retrievedValue = null;
		console.log('🗑️ All caches cleared');
	}

	async function persistSnapshot() {
		const success = await cache.persistSnapshot();
		console.log(success ? '✅ Snapshot persisted' : '❌ Snapshot failed');
	}

	async function restoreSnapshot() {
		const success = await cache.restoreSnapshot();
		console.log(success ? '✅ Snapshot restored' : '❌ Snapshot not found');
	}

	function refreshHealth() {
		healthStatus = cache.healthCheck();
	}

	// Auto-refresh health every 5 seconds
	$effect(() => {
		const interval = setInterval(refreshHealth, 5000);
		return () => clearInterval(interval);
	});
</script>

<div class="container mx-auto p-6 space-y-6">
	<div class="flex items-center gap-3 mb-8">
		<Database class="w-8 h-8 text-blue-500" />
		<h1 class="text-3xl font-bold">Cache System Demo</h1>
	</div>

	<!-- Health Status -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Activity class="w-5 h-5" />
				System Health
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-3 gap-4">
				<div class="flex flex-col">
					<span class="text-sm text-muted-foreground">Memory Cache</span>
					<span class="text-lg font-semibold" class:text-green-500={healthStatus.memory} class:text-red-500={!healthStatus.memory}>
						{healthStatus.memory ? '✅ Ready' : '❌ Offline'}
					</span>
				</div>
				<div class="flex flex-col">
					<span class="text-sm text-muted-foreground">Persistent Cache</span>
					<span class="text-lg font-semibold" class:text-green-500={healthStatus.persistent} class:text-red-500={!healthStatus.persistent}>
						{healthStatus.persistent ? '✅ Ready' : '❌ Offline'}
					</span>
				</div>
				<div class="flex flex-col">
					<span class="text-sm text-muted-foreground">Overall</span>
					<span class="text-lg font-semibold" class:text-green-500={healthStatus.healthy} class:text-yellow-500={!healthStatus.healthy}>
						{healthStatus.healthy ? '✅ Healthy' : '⚠️ Degraded'}
					</span>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Cache Statistics -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Zap class="w-5 h-5" />
				Performance Statistics
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-2 md:grid-cols-5 gap-4">
				<div>
					<div class="text-sm text-muted-foreground">Memory Hits</div>
					<div class="text-2xl font-bold text-green-500">{cacheStats.memoryHits}</div>
				</div>
				<div>
					<div class="text-sm text-muted-foreground">Persistent Hits</div>
					<div class="text-2xl font-bold text-blue-500">{cacheStats.persistentHits}</div>
				</div>
				<div>
					<div class="text-sm text-muted-foreground">Misses</div>
					<div class="text-2xl font-bold text-red-500">{cacheStats.misses}</div>
				</div>
				<div>
					<div class="text-sm text-muted-foreground">Writes</div>
					<div class="text-2xl font-bold text-purple-500">{cacheStats.writes}</div>
				</div>
				<div>
					<div class="text-sm text-muted-foreground">Hit Rate</div>
					<div class="text-2xl font-bold text-cyan-500">{cacheStats.hitRate}</div>
				</div>
			</div>

			<div class="mt-6 p-4 bg-muted rounded-lg">
				<h3 class="font-semibold mb-2">Memory Cache Details</h3>
				<div class="grid grid-cols-3 gap-4 text-sm">
					<div>
						<span class="text-muted-foreground">Collections:</span>
						<span class="ml-2 font-semibold">{cacheStats.memoryStats.collections}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Documents:</span>
						<span class="ml-2 font-semibold">{cacheStats.memoryStats.documents}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Memory:</span>
						<span class="ml-2 font-semibold">{(cacheStats.memoryStats.memoryUsage / 1024).toFixed(2)} KB</span>
					</div>
				</div>
			</div>

			<div class="mt-4 p-4 bg-muted rounded-lg">
				<h3 class="font-semibold mb-2">IndexedDB Details</h3>
				<div class="grid grid-cols-3 gap-4 text-sm">
					<div>
						<span class="text-muted-foreground">Keys:</span>
						<span class="ml-2 font-semibold">{cacheStats.persistentStats.size}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Hits:</span>
						<span class="ml-2 font-semibold">{cacheStats.persistentStats.hits}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Misses:</span>
						<span class="ml-2 font-semibold">{cacheStats.persistentStats.misses}</span>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Test Controls -->
	<Card>
		<CardHeader>
			<CardTitle>Cache Operations</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="text-sm font-medium">Key</label>
					<input
						type="text"
						bind:value={testKey}
						class="w-full px-3 py-2 border rounded-md"
						placeholder="test-key-1"
					/>
				</div>
				<div>
					<label class="text-sm font-medium">Value</label>
					<input
						type="text"
						bind:value={testValue}
						class="w-full px-3 py-2 border rounded-md"
						placeholder="Hello from cache!"
					/>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button onclick={testMemoryCache}>
					<Zap class="w-4 h-4 mr-2" />
					Memory Only
				</Button>
				<Button onclick={testPersistentCache}>
					<Database class="w-4 h-4 mr-2" />
					Persistent Only
				</Button>
				<Button onclick={testTwoLayerCache}>
					<Zap class="w-4 h-4 mr-2" />
					<Database class="w-4 h-4 mr-2" />
					Two-Layer
				</Button>
			</div>

			<div class="flex gap-2">
				<Button onclick={retrieveFromCache} variant="outline">
					Retrieve
				</Button>
				<Button onclick={clearAllCaches} variant="destructive">
					<Trash2 class="w-4 h-4 mr-2" />
					Clear All
				</Button>
			</div>

			{#if retrievedValue !== null}
				<div class="p-4 bg-green-50 border border-green-200 rounded-md">
					<div class="text-sm font-semibold text-green-700">Retrieved Value:</div>
					<div class="text-green-900 font-mono">{retrievedValue}</div>
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Snapshot Operations -->
	<Card>
		<CardHeader>
			<CardTitle>Snapshot Operations</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Persist LokiJS in-memory state to IndexedDB for warm restarts
			</p>
			<div class="flex gap-2">
				<Button onclick={persistSnapshot}>
					<Download class="w-4 h-4 mr-2" />
					Persist Snapshot
				</Button>
				<Button onclick={restoreSnapshot} variant="outline">
					<Upload class="w-4 h-4 mr-2" />
					Restore Snapshot
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Cache Monitor -->
	<div class="col-span-full">
		<CacheMonitor />
	</div>
</div>
