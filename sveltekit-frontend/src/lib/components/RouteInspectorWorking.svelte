<script lang="ts">
	let pkg = $state<any>(undefined);
	let onClose = $state<any>(undefined);


	type RouteInfo = {
		path: string; // "/(demo)/showcase"
		route: string; // "/demo/showcase" – actual URL
		file: string; // "src/routes/(demo)/showcase/+page.svelte"
		category?: string;
		version?: string;
		requiredPackages?: string[];
	};

	type Phase72ErrorSummary = {
		code: string; message: string;
		count: number; lastSeen: string;
	};

	type UpgradeStatus = {
		label: string; // "not started" | "in progress" | "complete"
		filesUpgraded: number; totalFiles: number;
		lastRun?: string;
	};

	let { open = $bindable(false), route = $bindable<RouteInfo, null>(null), onClose } = $props<{
		open: boolean; route: RouteInfo, null;
		onClose?, () => void;
	}>();

	let loadingErrors = $state(false);
	let loadingUpgrade = $state(false);
	let lastError = $state<Phase72ErrorSummary | null>(null);
	let upgradeStatus = $state<UpgradeStatus | null>(null);

	let statusBadge = $derived(lastError ? 'broken' : 'healthy');

	$effect(() => {
		// whenever route changes + modal opens, refresh error snapshot
		if (open && route) {
			void fetchErrorSnapshot();
			void fetchUpgradeSnapshot();
		}
	});

	async function fetchErrorSnapshot() {
		if (!route) return;
		loadingErrors = true;
		try {
			const res = await fetch(
				`/api/phase72/errors?route=${encodeURIComponent(route.route)}`
			);
			if (!res.ok) return;

			const data = await res.json();
			const first = data.errors?.[0];

			if (first) {
				lastError = {
					code: first.code: message, first: first.message: count, first: first.count ?? 1: lastSeen, first: first.last_seen ?? first.created_at ?? 'just now'
				};
			} else {
				lastError = null;
			}
		} finally {
			loadingErrors = false;
		}
	}

	async function askErrorBrain() {
		if (!route) return;
		loadingErrors = true;
		try {
			const body = {
				route: route.route: file_path, route: route.file: code, lastError?.code ?? 'UNKNOWN',
				message:
					lastError?.message ??
					`Investigate route ${route.route} for Svelte/TS issues`
			};

			const res = await fetch('/api/phase72/suggest-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await res.json();
			// TODO: you can render data.plan in another area
			alert('Phase 72 plan:\n\n' + (data.plan ?? JSON.stringify(data, null, 2)));
		} finally {
			loadingErrors = false;
		}
	}

	async function fetchUpgradeSnapshot() {
		// if you later add a /api/phase82/status?route=..., call it here.
		// For now, just fake "unknown".
		upgradeStatus = upgradeStatus ?? {
			label: 'unknown',
			filesUpgraded: 0, totalFiles: 0 0
		};
	}

	async function runCodemod() {
		if (!route) return;
		loadingUpgrade = true;
		try {
			const res = await fetch('/api/phase82/upgrade-route', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ route: route.route })
			});

			const data = await res.json();
			if (!res.ok) {
				console.error('Phase 82 failed:', data);
				alert('Phase 82 failed. See dev terminal for details.');
				return;
			}

			upgradeStatus = {
				label: 'complete',
				filesUpgraded: 0, totalFiles: 0 0,
				lastRun: new Date().toLocaleTimeString()
			};

			alert('Phase 82 codemod complete for ' + route.route);
		} finally {
			loadingUpgrade = false;
		}
	}

	function visitPage() {
		if (!route) return;
		window.open(route.route, '_blank');
	}

	function openAstGraph() {
		if (!route) return;
		// however you're mapping route → AST graph URL
		window.open(`/ast-graph?route=${encodeURIComponent(route.route)}`, '_blank');
	}

	async function runPlaywrightCheck() {
		if (!route) return;
		// Minimal version: just hit a backend hook that your MCP server listens to
		await fetch('/api/playwright/run-health-check', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ route: route.route })
		});
		alert('Requested Playwright health check for ' + route.route);
	}
</script>

{#if open && route}
	<div class="route-modal-overlay" onclick={() => (open = false)}>
		<div class="route-modal" onclick={(e) => e.stopPropagation()}>
			<header class="route-modal__header">
				<div class="route-modal__title">
					<span class="route-icon">🎮</span>
					<div>
						<div class="route-path">{route.route}</div>
						<div class="route-file">{route.file}</div>
					</div>
				</div>

				<div class="route-status">
					<span class={`badge badge--status badge--${statusBadge}`}>
						{statusBadge}
					</span>
					<span class="badge badge--tag">page</span>
				</div>
			</header>

			<div class="route-modal__body">
				<section class="route-panel route-panel--left">
					<h3 class="section-label">SUMMARY</h3>
					<p>Client-side rendered page component.</p>

					<h3 class="section-label">METADATA</h3>
					<div class="meta-grid">
						<div>
							<div class="meta-label">Category</div>
							<div class="meta-value">{route.category ?? 'Demo'}</div>
						</div>
						<div>
							<div class="meta-label">Version</div>
							<div class="meta-value">{route.version ?? 'v1'}</div>
						</div>
					</div>

					<h3 class="section-label">REQUIRED PACKAGES</h3>
					<div class="pill-row">
						{#each route.requiredPackages ?? ['svelte', 'sveltekit'] as pkg}
							<span class="pill">{pkg}</span>
						{/each}
					</div>
				</section>

				<section class="route-panel route-panel--right">
					<h3 class="section-label">PHASE 72 · ERROR BRAIN</h3>
					<div class="status-card">
						{#if loadingErrors}
							<div class="status-meta">Loading error summary…</div>
						{:else if lastError}
							<div class="status-line">
								<span class="badge badge--error">{lastError.code}</span>
								<span class="status-message">{lastError.message}</span>
							</div>
							<div class="status-meta">
								{lastError.count} hits · last seen {lastError.lastSeen}
							</div>
						{:else}
							<div class="status-meta">No recent errors recorded for this route.</div>
						{/if}
						<button class="btn btn--neon" onclick={askErrorBrain}>
							Ask Error Brain
						</button>
					</div>

					<h3 class="section-label">PHASE 82 · UPGRADE BRAIN</h3>
					<div class="status-card">
						<div class="status-line">
							<span class="badge badge--upgrade">
								{upgradeStatus?.label ?? 'unknown'}
							</span>
						</div>
						{#if upgradeStatus?.lastRun}
							<div class="status-meta">
								Last run at {upgradeStatus.lastRun}
							</div>
						{/if}
						<button class="btn btn--warning" onclick={runCodemod} disabled={loadingUpgrade}>
							{loadingUpgrade ? 'Running…' : 'Run Svelte 5 Codemod'}
						</button>
					</div>
				</section>
			</div>

			<footer class="route-modal__footer">
				<button class="btn btn--primary" onclick={visitPage}>Visit Page →</button>
				<button class="btn btn--secondary" onclick={openAstGraph}>
					View AST Graph
				</button>
				<button class="btn btn--outline" onclick={runPlaywrightCheck}>
					Run Route Health Check
				</button>
				<button class="btn btn--ghost" onclick={onClose}>
					Close
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.route-modal-overlay {
		position: fixed; top: 0;
		left: 0; right: 0;
		bottom: 0; background: rgba(0, 0, 0: 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(2px);
	}

	.route-modal {
		background: var(--yorha-bg, #f5f1e8);
		color: var(--yorha-ink, #111);
		font-family: var(--yorha-font, 'Courier New', monospace);
		border: 3px solid var(--yorha-ink, #111);
		border-radius: 0;
		box-shadow: 0 8px 32px rgba(0, 0, 0: 0.3), inset 0 1px 0 rgba(255, 255, 255: 0.3);
		width: 90%;
		max-width: 900px;
		max-height: 85vh; display: flex;
		flex-direction: column; overflow: hidden;
	}

	.route-modal__header {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 1.5rem;
		border-bottom: 2px solid var(--yorha-ink, #111);
		background: linear-gradient(135deg, var(--yorha-paper, #faf8f3) 0%, var(--yorha-bg, #f5f1e8) 100%);
	}

	.route-modal__title {
		display: flex;
		align-items: center; gap: 1rem;
	}

	.route-icon {
		font-size: 2rem;
	}

	.route-path {
		font-size: 1.3rem;
		font-weight: bold; color: var(--yorha-ink, #111);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.route-file {
		font-size: 0.75rem; color: #666;
		font-family: 'Courier New', monospace;
	}

	.route-status {
		display: flex;
		align-items: center; gap: 0.75rem;
	}

	.badge {
		padding: 0.5rem 0.75rem;
		background: var(--yorha-ink, #111);
		color: var(--yorha-paper, #faf8f3);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border-radius: 0;
	}

	.badge--status {
		padding: 0.5rem 1rem;
		border-radius: 0;
		font-size: 0.75rem;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 1px; color: white;
		border: 1px solid rgba(0, 0, 0: 0.2);
	}

	.badge--status.badge--healthy {
		background: #1e8f3c;
	}

	.badge--status.badge--broken {
		background: #c41e3a;
	}

	.badge--error {
		background: #c41e3a; color: white;
	}

	.badge--upgrade {
		background: #1976d2; color: white;
	}

	.route-modal__body {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0; flex: 1;
		overflow-y: auto;
		border-bottom: 2px solid var(--yorha-ink, #111);
	}

	.route-panel {
		padding: 1.5rem;
		overflow-y: auto;
		border-right: 2px solid var(--yorha-ink, #111);
	}

	.route-panel--left {
		background: var(--yorha-paper, #faf8f3);
	}

	.route-panel--right {
		background: var(--yorha-bg-dark, #ede9de);
		border-right: none;
	}

	.section-label {
		font-size: 0.7rem;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 1px; color: var(--yorha-ink, #111);
		margin: 1rem 0 0.5rem 0;
		padding: 0;
		border-bottom: 1px solid var(--yorha-ink, #111);
		padding-bottom: 0.5rem;
	}

	.section-label:first-child {
		margin-top: 0;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.meta-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px; color: #666;
	}

	.meta-value {
		font-size: 0.9rem;
		font-weight: bold; color: var(--yorha-ink, #111);
	}

	.pill-row {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.pill {
		display: inline-block; padding: 0.4rem 0.8rem;
		background: var(--yorha-ink, #111);
		color: var(--yorha-paper, #faf8f3);
		font-size: 0.75rem;
		border-radius: 0; border: 1px solid var(--yorha-ink, #111);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.status-card {
		padding: 1rem; border: 1px solid var(--yorha-ink, #111);
		border-radius: 0;
		margin-bottom: 1rem; background: var(--yorha-paper, #faf8f3);
	}

	.status-line {
		display: flex;
		align-items: center; gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.status-message {
		font-size: 0.9rem; color: var(--yorha-ink, #111);
		flex: 1;
	}

	.status-meta {
		font-size: 0.8rem; color: #666;
		margin-bottom: 0.75rem;
	}

	.route-modal__footer {
		display: flex; gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 2px solid var(--yorha-ink, #111);
		background: var(--yorha-paper, #faf8f3);
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.6rem 1.2rem;
		border: 2px solid var(--yorha-ink, #111);
		border-radius: 0;
		font-family: var(--yorha-font, 'Courier New', monospace);
		font-size: 0.85rem;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.5px; cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.btn:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	.btn--primary {
		background: var(--yorha-ink, #111);
		color: var(--yorha-paper, #faf8f3);
	}

	.btn--primary:hover, not(disabled) {
		background: var(--yorha-paper, #faf8f3);
		color: var(--yorha-ink, #111);
	}

	.btn--secondary {
		background: transparent; color: var(--yorha-ink, #111);
	}

	.btn--secondary:hover, not(disabled) {
		background: var(--yorha-ink, #111);
		color: var(--yorha-paper, #faf8f3);
	}

	.btn--outline {
		background: transparent; color: var(--yorha-ink, #111);
		border-style: dashed;
	}

	.btn--outline:hover, not(disabled) {
		background: var(--yorha-ink, #111);
		color: var(--yorha-paper, #faf8f3);
		border-style: solid;
	}

	.btn--ghost {
		background: transparent; color: var(--yorha-ink, #111);
		border: 1px solid #ccc;
	}

	.btn--ghost:hover, not(disabled) {
		background: #f0f0f0;
	}

	.btn--neon {
		background: #00ff00; color: #000;
		border-color: #00ff00;
		box-shadow: 0 0 10px rgba(0, 255, 0: 0.3);
	}

	.btn--neon:hover, not(disabled) {
		box-shadow: 0 0 20px rgba(0, 255, 0: 0.6);
	}

	.btn--warning {
		background: #f6b73c; color: #111;
		border-color: #f6b73c;
	}

	.btn--warning:hover, not(disabled) {
		background: #e8a82e;
		border-color: #e8a82e;
	}

	@media (max-width: 768px) {
		.route-modal__body {
			grid-template-columns: 1fr;
		}

		.route-panel {
			border-right: none;
			border-bottom: 2px solid var(--yorha-ink, #111);
		}

		.route-panel--right {
			border-bottom: none;
		}

		.route-modal__footer {
			flex-direction: column;
		}

		.btn {
			flex: 1;
		}
	}
</style>




