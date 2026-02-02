<script lang="ts">
	import { browser } from '$app/environment';
	import WifiOff from 'lucide-svelte/icons/wifi-off';

	let isOnline = $state(browser && navigator.onLine);
	let showOfflineBanner = $state(false);

	// Listen for online/offline events
	$effect(() => {
		if (!browser) return;

		function handleOnline() {
			isOnline = true;
			showOfflineBanner = false;
			console.log('✅ Back online');
		}

		function handleOffline() {
			isOnline = false;
			showOfflineBanner = true;
			console.log('📴 You are offline');
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Initial check
		isOnline = navigator.onLine;

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if showOfflineBanner}
	<div
		class="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 px-4 py-3 shadow-lg"
		role="alert"
	>
		<div class="container mx-auto flex items-center gap-3">
			<WifiOff class="w-5 h-5" />
			<div class="flex-1">
				<p class="font-semibold">You are currently offline</p>
				<p class="text-sm">Some features may be limited. Cached data is available.</p>
			</div>
			<button
				onclick={() => (showOfflineBanner = false)}
				class="text-yellow-950 hover:text-yellow-900"
				aria-label="Dismiss"
			>
				✕
			</button>
		</div>
	</div>
{/if}

<!-- Small indicator in corner -->
{#if !isOnline}
	<div
		class="fixed bottom-4 right-4 bg-yellow-500 text-yellow-950 px-3 py-2 rounded-md shadow-lg flex items-center gap-2"
	>
		<WifiOff class="w-4 h-4" />
		<span class="text-sm font-medium">Offline</span>
	</div>
{/if}
