<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
</script>

<svelte:head>
	<title>Citation: {data.label} | Legal Corpus</title>
</svelte:head>

<div class="min-h-screen bg-black flex items-center justify-center p-6">
	<Card class="max-w-md w-full bg-panel border-accent/20">
		<CardContent class="p-8 text-center">
			<div class="mb-4 flex justify-center">
				<div class="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center border border-accent/30">
					<span class="text-2xl text-accent">⚖️</span>
				</div>
			</div>
			
			<h1 class="text-xl font-bold text-sand mb-2">Citation Not Resolved</h1>
			<p class="text-sand/60 text-sm mb-6">
				We couldn't find a direct match for <span class="text-accent font-mono">"{data.label}"</span> in the current legal corpus.
			</p>

			<div class="space-y-3">
				<Button 
					variant="outline" 
					class="w-full border-accent/40 text-accent hover:bg-accent/10" 
					onclick={() => goto('/citations')}
				>
					Return to Corpus Explorer
				</Button>
				<Button 
					variant="ghost" 
					class="w-full text-sand/40 hover:text-sand" 
					onclick={() => window.history.back()}
				>
					Go Back
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
