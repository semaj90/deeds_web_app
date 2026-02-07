<script lang="ts">
	// Removed unused pkg

	type RouteHealth = 'green' | 'yellow' | 'red';

	type RouteDetail = {
		path: string;
	kind: 'page' | 'layout' | 'endpoint';
		file: string;
	summary: string;
		category?: string;
		version?: string;
		requiredPackages?: string[];
		relatedRoutes?: string[];
		health?: RouteHealth;
		errorCount?: number;
		lastErrorCode?: string | null;
		lastErrorMessage?: string | null;
	};

	interface Props {
		open?: boolean;
	route?: RouteDetail | null;
	}

	let { open = $bindable(false), route = null }: Props = $props();

	let isOpen = $state(open);

	$effect(() => {
		isOpen = open;
	});

	function close() {
		isOpen = false;
		open = false;
	}

	function visit() {
		if (route?.path) {
			window.location.href = route.path;
		}
	}

	function viewAst() {
		if (route?.path) {
			window.location.href = `/ast?route=${encodeURIComponent(route.path)}`;
		}
	}

	async function runHealthCheck() {
		if (!route?.path) return;

		try {
			const res = await fetch(`/api/phase72/check-route`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	route: route.path })
			});

			if (res.ok) {
				console.log('Health check completed');
			}
		} catch (e) {
			console.error('health check failed', e);
		}
	}

	function healthLabel(health: RouteHealth | undefined) {
		if (!health) return 'unknown';
		if (health === 'green') return 'Healthy';
		if (health === 'yellow') return 'Warnings';
		return 'Broken';
	}
</script>

{#if isOpen && route}
	<div
		class="route-modal-backdrop"
		onclick={close}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="button"
		tabindex="0"
	>
		<div
			class="route-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
			tabindex="-1"
		>
			<header class="route-modal__header">
				<div class="route-modal__title-block">
					<span class="route-modal__kind-chip">
						{route.kind.toUpperCase()}
					</span>
					<h2 class="route-modal__title">{route.path}</h2>
				</div>

				<button class="route-modal__close" onclick={close} aria-label="Close">
					✕
				</button>
			</header>

			<section class="route-modal__summary">
				<h3>Summary</h3>
				<p>{route.summary}</p>
			</section>

			<section class="route-modal__grid">
				<!-- File / location -->
				<div class="route-modal__panel">
					<h3>Files</h3>
					<div class="route-modal__code-chip">
						<span class="route-modal__code-label">Page</span>
						<code>{route.file}</code>
					</div>
				</div>

				<!-- Metadata -->
				<div class="route-modal__panel">
					<h3>Metadata</h3>
					<div class="route-modal__meta-row">
						<span class="meta-label">Category</span>
						<span class="meta-value">{route.category ?? '—'}</span>
					</div>
					<div class="route-modal__meta-row">
						<span class="meta-label">Version</span>
						<span class="meta-value">{route.version ?? 'v1'}</span>
					</div>
					<div class="route-modal__meta-row">
						<span class="meta-label">Health</span>
						<span class={`health-chip health-${route.health ?? 'unknown'}`}>
							{healthLabel(route.health)}
							{#if route.errorCount != null}
								<span class="health-chip__count">
									{route.errorCount} error{route.errorCount === 1 ? '' : 's'}
								</span>
							{/if}
						</span>
					</div>
				</div>

				<!-- Dependencies -->
				<div class="route-modal__panel">
					<h3>Required Packages</h3>
					{#if route.requiredPackages && route.requiredPackages.length}
						<div class="route-modal__tag-row">
							{#each route.requiredPackages as pkg}
								<span class="pill">{pkg}</span>
							{/each}
						</div>
					{:else}
						<p class="route-modal__empty">None</p>
					{/if}
				</div>

				<!-- Related routes -->
				<div class="route-modal__panel">
					<h3>Related Routes</h3>
					{#if route.relatedRoutes && route.relatedRoutes.length}
						<div class="route-modal__links">
							{#each route.relatedRoutes as r}
								<button
									type="button"
									class="link-pill"
									onclick={() => {
										window.location.href = r;
									}}
								>
									{r}
								</button>
							{/each}
						</div>
					{:else}
						<p class="route-modal__empty">No direct relations</p>
					{/if}
				</div>
			</section>

			<!-- Last error / Phase72 insight -->
			{#if route.lastErrorMessage}
				<section class="route-modal__errors">
					<h3>Last Phase72 Error</h3>
					<div class="error-block">
						{#if route.lastErrorCode}
							<code class="error-code">{route.lastErrorCode}</code>
						{/if}
						<p>{route.lastErrorMessage}</p>
					</div>
				</section>
			{/if}

			<footer class="route-modal__footer">
				<div class="route-modal__footer-left">
					<button class="yorha-btn primary" onclick={visit}>
						🎮 Visit Page
					</button>
					<button class="yorha-btn secondary" onclick={viewAst}>
						📈 View AST Graph
					</button>
				</div>

				<div class="route-modal__footer-right">
					<button class="yorha-btn ghost" onclick={runHealthCheck}>
						🔍 Run Health Check
					</button>
				</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	.route-modal-backdrop {
		position: fixed;
	inset: 0;
		background: rgba(10, 8, 4, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 80;
	}

	.route-modal {
		width: min(880px, 96vw);
		max-height: 90vh;
	background: var(--yorha-paper, #f8f0d9);
		border-radius: 18px;
	border: 3px solid var(--yorha-ink, #111);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
		padding: 18px 22px 16px;
		display: flex;
		flex-direction: column;
	gap: 12px;
		font-family: var(--yorha-font, 'JetBrains Mono', monospace);
		overflow-y: auto;
	}

	.route-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	gap: 12px;
	}

	.route-modal__title-block {
		display: flex;
		flex-direction: column;
	gap: 4px;
	}

	.route-modal__kind-chip {
		align-self: flex-start;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	padding: 2px 8px;
		border-radius: 999px;
	background: var(--yorha-bg-dark, #2a2016);
		color: var(--yorha-paper, #f8f0d9);
		border: 1px solid var(--yorha-ink, #111);
	}

	.route-modal__title {
		font-size: 18px;
	margin: 0;
		color: var(--yorha-ink, #111);
	}

	.route-modal__close {
		border-radius: 12px;
	border: 2px solid var(--yorha-ink, #111);
		background: var(--yorha-crimson, #a51c30);
		color: #fff;
	width: 30px;
		height: 30px;
		font-weight: 700;
	cursor: pointer;
		transition:all 0.2s ease;
	}

	.route-modal__close:hover {
		transform: scale(1.1);
	}

	.route-modal__summary h3,
	.route-modal__panel h3,
	.route-modal__errors h3 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	margin: 0 0 4px;
		color: var(--yorha-muted, #7c6b4a);
	}

	.route-modal__summary p {
		margin: 0;
		font-size: 13px;
	color: var(--yorha-ink, #111);
	}

	.route-modal__grid {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
	gap: 10px;
		font-size: 13px;
	}

	@media (max-width: 720px) {
		.route-modal__grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.route-modal__panel {
		padding: 8px 10px;
		border-radius: 12px;
	background: var(--yorha-bg-alt, #c4b99a);
		border: 1px solid rgba(0, 0, 0, 0.2);
	}

	.route-modal__code-chip {
		display: flex;
		flex-direction: column;
	gap: 4px;
	}

	.route-modal__code-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
	color: var(--yorha-muted, #7c6b4a);
	}

	.route-modal__code-chip code {
		display: inline-block;
	padding: 4px 6px;
		border-radius: 8px;
	background: #111;
		color: #f8f0d9;
		font-size: 11px;
		overflow-x: auto;
		font-family: var(--yorha-font, 'JetBrains Mono', monospace);
	}

	.route-modal__meta-row {
		display: flex;
		justify-content: space-between;
	gap: 8px;
		font-size: 12px;
		margin-bottom: 4px;
	}

	.meta-label {
		color: var(--yorha-muted, #7c6b4a);
	}

	.meta-value {
		font-weight: 500;
	color: var(--yorha-ink, #111);
	}

	.health-chip {
		display: inline-flex;
		align-items: center;
	gap: 6px;
		padding: 3px 8px;
		border-radius: 999px;
	border: 1px solid #111;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.health-green {
		background: #1e8f3c;
	color: #f8f0d9;
	}

	.health-yellow {
		background: #f6b73c;
	color: #111;
	}

	.health-red {
		background: var(--yorha-crimson, #a51c30);
		color: #f8f0d9;
	}

	.health-unknown {
		background: #555;
	color: #f8f0d9;
	}

	.health-chip__count {
		font-size: 10px;
	opacity: 0.9;
	}

	.route-modal__tag-row,
	.route-modal__links {
		display: flex;
		flex-wrap: wrap;
	gap: 4px;
	}

	.pill {
		padding: 3px 8px;
		border-radius: 999px;
	background: #111;
		color: #f8f0d9;
		font-size: 11px;
	}

	.link-pill {
		padding: 3px 8px;
		border-radius: 999px;
	border: 1px dashed #111;
		background: transparent;
		font-size: 11px;
	cursor: pointer;
		transition:all 0.2s ease;
		color: var(--yorha-ink, #111);
	}

	.link-pill:hover {
		background: var(--yorha-bg-alt, #c4b99a);
	}

	.route-modal__empty {
		margin: 4px 0 0;
		font-size: 12px;
	color: var(--yorha-muted, #7c6b4a);
	}

	.route-modal__errors {
		padding: 6px 10px;
		border-radius: 12px;
	background: #2a2016;
		color: #f8f0d9;
		font-size: 12px;
	}

	.error-block {
		display: flex;
		flex-direction: column;
	gap: 4px;
	}

	.error-code {
		display: inline-block;
	padding: 2px 6px;
		border-radius: 999px;
	border: 1px solid #f8f0d9;
		font-size: 10px;
		font-family: var(--yorha-font, 'JetBrains Mono', monospace);
	}

	.route-modal__footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 4px;
	gap: 8px;
		flex-wrap: wrap;
	}

	.route-modal__footer-left,
	.route-modal__footer-right {
		display: flex;
	gap: 8px;
	}

	.yorha-btn {
		padding: 6px 14px;
		border-radius: 999px;
	border: 2px solid #111;
		font-size: 12px;
		font-family: var(--yorha-font, 'JetBrains Mono', monospace);
		cursor: pointer;
	transition:all 0.2s ease;
	}

	.yorha-btn.primary {
		background: var(--yorha-crimson, #a51c30);
		color: #fff;
	}

	.yorha-btn.primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(165, 28, 48, 0.3);
	}

	.yorha-btn.secondary {
		background: var(--yorha-bg-dark, #2a2016);
		color: var(--yorha-paper, #f8f0d9);
	}

	.yorha-btn.secondary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}

	.yorha-btn.ghost {
		background: transparent;
	color: #111;
	}

	.yorha-btn.ghost:hover {
		background: var(--yorha-bg-alt, #c4b99a);
		transform: translateY(-1px);
	}
</style>




