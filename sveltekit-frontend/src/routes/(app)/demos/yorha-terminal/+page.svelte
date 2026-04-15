<script lang="ts">
	import YoRHaTerminal from '$lib/components/yorha/_simulations/YoRHaTerminal.svelte';
	import SystemStatus from '$lib/components/yorha/_simulations/SystemStatus.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">YoRHa Terminal + System Status</h1>
		<p class="text-sm opacity-60">Terminal emulator with command handling and history, plus system metrics display with WebGPU and interval-based updates.</p>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<div>
			<h2 class="text-sm font-bold mb-2 opacity-70">Terminal (243L)</h2>
			<div style="height: 400px;">
				<YoRHaTerminal />
			</div>
		</div>
		<div>
			<h2 class="text-sm font-bold mb-2 opacity-70">System Status (131L)</h2>
			<SystemStatus webgpuReady={true} />
		</div>
	</div>
</div>