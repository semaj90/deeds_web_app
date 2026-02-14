<script lang="ts">
	let Search = $state<any>(undefined);
	let User = $state<any>(undefined);
	let Settings = $state<any>(undefined);
	let Home = $state<any>(undefined);
	let Star = $state<any>(undefined);

 import IconContainer from '$lib/components/ui/IconContainer.svelte';
</script>

<div class="p-8 space-y-8">
 <h1 class="text-2xl font-bold mb-6">Container Query Icon Demo</h1>

 <!-- Small Container -->
 <div class="border rounded-lg p-4 w-32">
 <h3 class="text-sm font-semibold mb-2">Small Container (128px)</h3>
 <div class="flex gap-2">
 <IconContainer icon={Search} size="sm" />
 <IconContainer icon={User} size="sm" />
 <IconContainer icon={Settings} size="sm" />
 </div>
 </div>

 <!-- Medium Container -->
 <div class="border rounded-lg p-4 w-64">
 <h3 class="text-sm font-semibold mb-2">Medium Container (256px)</h3>
 <div class="flex gap-2">
 <IconContainer icon={Home} size="md" />
 <IconContainer icon={Star} size="md" />
 <IconContainer icon={Search} size="md" />
 </div>
 </div>

 <!-- Large Container -->
 <div class="border rounded-lg p-4 w-96">
 <h3 class="text-sm font-semibold mb-2">Large Container (384px)</h3>
 <div class="flex gap-3">
 <IconContainer icon={User} size="lg" />
 <IconContainer icon={Settings} size="lg" />
 <IconContainer icon={Home} size="lg" />
 </div>
 </div>

 <!-- Extra Large Container -->
 <div class="border rounded-lg p-4 w-full max-w-lg">
 <h3 class="text-sm font-semibold mb-2">Extra Large Container (512px+)</h3>
 <div class="flex gap-4">
 <IconContainer icon={Star} size="xl" />
 <IconContainer icon={Search} size="xl" />
 <IconContainer icon={User} size="xl" />
 <IconContainer icon={Settings} size="xl" />
 </div>
 </div>

 <!-- Responsive Grid Demo -->
 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
 {#each Array(8) as _, i}
 <div class="border rounded-lg p-4">
 <h4 class="text-xs font-medium mb-2">Card {i + 1}</h4>
 <IconContainer icon={Search} size="md" class="text-info" />
 </div>
 {/each}
 </div>
</div>

