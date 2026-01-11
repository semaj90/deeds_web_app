<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const navItems = [
		{ href: '/error-brain', label: 'Dashboard' },
		{ href: '/error-brain/runs', label: 'Runs' },
		{ href: '/error-brain/config', label: 'Configuration' }
	];
</script>

<div class="min-h-screen bg-background">
	<header class="border-b">
		<div class="container mx-auto px-6 py-4">
			<nav class="flex items-center gap-6">
				<a href="/error-brain" class="text-lg font-semibold">Error-Brain</a>
				<div class="flex gap-4">
					{#each navItems as item}
						<a
							href={item.href}
							class:text-primary={page.url.pathname === item.href}
							class:text-muted-foreground={page.url.pathname !== item.href}
							class="text-sm font-medium hover:text-primary transition-colors"
						>
							{item.label}
						</a>
					{/each}
				</div>
			</nav>
		</div>
	</header>

	<main class="container mx-auto py-6">
		{@render children()}
	</main>
</div>
