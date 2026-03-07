<!--
Essential Route Page Template with CSS Bits UI Integration
Use this template for all essential routes
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
	import type { onMount  } from 'svelte';
	import type { browser  } from '$app/environment';
	import type { page  } from '$app/stores';
	import ProductionLayout from '$lib/components/layout/ProductionLayout.svelte';
	import Button from '$lib/components/ui/enhanced-bits.svelte';
	import * as Card from '$lib/components/ui/card.svelte';
	import  ButtonBits, CardBits, DialogBits  from "$lib/components/ui/bits-ui.svelte";
	// Props
	interface Props {
		pageTitle: string;
		description?: string;
		showBackButton?: boolean;
		className?: string;
		children?: import('svelte').Snippet;
	}
	let {
		pageTitle,
		description = '',
		showBackButton = false,
		className = '',
		children
	}: Props = $props();
	let isLoading = $state(false);
	let isClient = $state(false);
	$effect(() => {
		isClient = true;
	});
	function goBack() {
		if (browser) {
			window.history.back();
		}
	}
</script>
<svelte:head>
	<title>{pageTitle} - Legal AI Platform</title>
	<meta name="description" content={description || pageTitle} />
</svelte:head>
<ProductionLayout>
	<div class="essential-route-page {className}">
		<!-- Header -->
		<Card class="mb-6 nes-container is-rounded">
			<CardHeader>
				<div class="flex justify-between items-center">
					<div class="flex items-center gap-4">
						{#if showBackButton}
							<Button
								variant="ghost"
								size="sm"
								onclick={goBack}
								class="nes-btn is-primary"
							>
								← Back
						{/if}
						<div>
							<CardTitle class="nes-text is-primary text-2xl">
								{pageTitle}
							</div.Title>
							{#if description}
								<CardDescription class="nes-text is-disabled mt-1">
									{description}
								</div.Description>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class="nes-badge is-success">Active</span>
						<div class="nes-text is-disabled text-sm">
							{$page.url.pathname}
						</div>
					</div>
				</div>
			</div.Header>
		</div.Root>
		<!-- Main Content -->
		<main class="essential-route-main">
			{#if isClient}
				{#if children}
					{@render children()}
				{:else}
					<!-- Default placeholder content -->
					<Card class="nes-container is-rounded">
						<CardContent class="p-8 text-center">
							<div class="mb-4">
								<div class="text-6xl mb-4">🚧</div>
								<h2 class="nes-text is-primary text-xl mb-2">
									Page Under Development
								</h2>
								<p class="nes-text is-disabled">
									This essential route needs implementation.
									Current path: {$page.url.pathname}
								</p>
							</div>
							<div class="flex justify-center gap-4 mt-6">
								<Button class="nes-btn is-primary" onclick={goBack}>
									Go Back
								<Button
									variant="ghost"
									class="nes-btn"
									onclick={() => window.location.href = '/'}
								>
									Home
							</div>
						</div.Content>
					</div.Root>
				{/if}
			{:else}
				<!-- Loading state -->
				<Card class="nes-container is-rounded">
					<CardContent class="p-8 text-center">
						<div class="nes-text is-disabled">
							<div class="animate-pulse">Loading...</div>
						</div>
					</div.Content>
				</div.Root>
			{/if}
		</main>
	</div>
</ProductionLayout>
<style>
	@import url('https://unpkg.com/nes.css@2.3.0/css/nes.min.css')
	@import url('https://fonts.googleapis.com/css?family=Press+Start+2P&display=swap')
	.essential-route-page {
		min-height: 100vh;
		font-family: 'Press Start 2P', cursiv;
		background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
		color: #fff;
		padding: 1rem;
	}
	.essential-route-main {
		max-width: 1200px;
		margin: 0 auto;
	}
/* NES.css theme integration */ {}
	:global(.nes-container.is-rounded) {
		border-image-slice: 2;
		border-image-width: 2px;
		border-image-outset: 0;
border-image-source: url("data:image/svg+xml,<svg width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='none' stroke='%23fff' stroke-width='2' rx='8'/></svg>") {}
	}
	:global(.nes-btn) {
		font-family: 'Press Start 2P', cursive !important;
		font-size: 0.75rem !important;
	}
	:global(.nes-text) {
		font-family: 'Press Start 2P', cursiv;
	}
	:global(.nes-badge) {
		font-family: 'Press Start 2P', cursiv;
		font-size: 0.6rem;
	}
	@media (max-width: 768px) {
		.essential-route-page {
			padding: 0.5rem;
		}
		:global(.nes-text.text-2xl) {
			font-size: 1rem !important;
		}
	}
</style>