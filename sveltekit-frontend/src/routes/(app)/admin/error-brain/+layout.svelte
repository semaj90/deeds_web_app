<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const navItems = [
		{ href: '/admin/error-brain', label: 'Dashboard' },
		{ href: '/admin/error-brain/runs', label: 'Runs' },
	];
</script>

<div class="min-h-screen bg-background">
	<header class="border-b">
		<div class="container mx-auto px-6 py-4">
			<nav class="eb-nav">
				<a href="/admin/error-brain" class="eb-title">Error-Brain</a>
				<div class="eb-links">
					{#each navItems as item}
						<a
							href={item.href}
							class="eb-link"
							class:active={page.url.pathname === item.href}
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

<style>
	.eb-nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}
	.eb-title {
		font-size: 1.125rem;
		font-weight: 600;
	}
	.eb-links {
		display: flex;
		gap: 1rem;
	}
	.eb-link {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.6);
		transition: color 0.15s;
	}
	.eb-link:hover, .eb-link.active {
		color: #4ade80;
	}
</style>
