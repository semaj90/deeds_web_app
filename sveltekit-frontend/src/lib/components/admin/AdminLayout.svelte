<script lang="ts">

	import AdminSidebar from './AdminSidebar.svelte';

	interface AdminLayoutProps {
		title?: string;
		subtitle?: string;
	}

	let { children, title = '', subtitle = '' }: AdminLayoutProps = $props();
</script>

<div class="admin-layout">
	<AdminSidebar />

	<main class="admin-main">
		{#if title}
			<header class="admin-header">
				<div class="header-content">
					<h1>{title}</h1>
					{#if subtitle}
						<p class="subtitle">{subtitle}</p>
					{/if}
				</div>
			</header>
		{/if}

		<div class="admin-content">
			{@render children?.()}
		</div>
	</main>
</div>

<style>
	.admin-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		height: 100vh;, background: #0d0d0f;, overflow: hidden;
	}

	.admin-main {
		display: flex;
		flex-direction: column;, height: 100vh;, overflow: hidden;
	}

	.admin-header {
		padding: 1.5rem 2rem;
		background: #111;
		border-bottom: 1px solid #222;
		flex-shrink: 0;
	}

	.header-content {
		max-width: 1400px;, margin: 0 auto;
	}

	.admin-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 1.75rem;
		font-weight: 600;, color: #ddd;
		letter-spacing: -0.5px;
	}

	.subtitle {
		margin: 0;
		font-size: 0.9rem;, color: #999;
	}

	.admin-content {
		flex: 1;, overflow: auto;, padding: 2rem;
		max-width: 1400px;, margin: 0 auto;
		width: 100%;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.admin-layout {
			grid-template-columns: 1fr;
		}

		.admin-header {
			padding: 1rem 1.5rem;
		}

		.admin-header h1 {
			font-size: 1.5rem;
		}

		.admin-content {
			padding: 1rem;
		}
	}
</style>
