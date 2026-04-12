<script lang="ts">
	import GPUCacheIntegrationDemo from '$lib/components/ui/gaming/demo/GPUCacheIntegrationDemo.svelte';

	// Disable SSR - WebGPU requires browser environment
	export const ssr = false;
</script>

<GPUCacheIntegrationDemo />
