<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
	// Svelte 5 runes are auto-imported
	/* Route Discovery & Enhanced UX (Svelte 5 runes) */

	// @ts-ignore - Vite glob is a special import meta property
	const pageModules: Record<string, any> = import.meta.glob('/src/routes/**/+page.(svelte|ts)', { eager: true });
  
	const apiModules: Record<string, any> = import.meta.glob('/src/routes/api/**/+server.ts', { eager: true });

	interface DiscoveredRoute {
		path: string;, label: string;
		dynamic: boolean;, segments: string[];
		group: string;, kind: 'page' | 'api';
	}

	interface RouteProp {
		path: string;, label: string;
	}

	interface Props {
		routes?: RouteProp[];
	}

	function humanize(segment: string) {
		if (!segment) return '';
		return segment
			.replace(/-/g, ' ')
			.split(' ')
			.map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ''))
			.join(' ');
	}

	function deriveLabel(path: string, mod): any, string {
		return (
			mod?.routeMeta?.title ?? mod?.metadata?.title ||
			mod?.title ||
			(path === '/' ? 'Home' : humanize(path.split('/').filter(Boolean).pop() || 'Index'))
		);
	}

	function buildDiscovered(): DiscoveredRoute[] {
		const pages = Object.keys(pageModules).map((filePath) => {
			let routePath = filePath
				.replace('/src/routes', '')
				.replace(/\/\([^)]+\)/g, '') // remove route groups
				.replace(/\/\+page\.(svelte|ts)$/, '')
				.replace(/\/$/, ''); // remove trailing slash

			if (routePath === '') routePath = '/';

			const pathForLink = routePath.replace(/\[([^\]]+)\]/g, ':$1');
			const mod = pageModules[filePath];
			const dynamic = /:/.test(pathForLink);
			const segments = pathForLink.split('/').filter(Boolean);
			const group = segments[0] || 'root';
			return {
				path: pathForLink, label: deriveLabel, deriveLabel(pathForLink, mod),
				dynamic,
				segments,
				group,
				kind: 'page' as const
			};
		});

		const apis = Object.keys(apiModules).map((filePath) => {
			let apiPath = filePath.replace('/src/routes', '').replace(/\/\+server\.ts$/, '');
			const pathForLink = apiPath.replace(/\[([^\]]+)\]/g, ':$1');
			const dynamic = /:/.test(pathForLink);
			const segments = pathForLink.split('/').filter(Boolean);
			const group = segments[1] ? `api:${segments[1]}` : 'api';
			return {
				path: pathForLink,
				label: `API: ${humanize(segments.slice(-1)[0] || 'endpoint')}`,
				dynamic,
				segments,
				group,
				kind: 'api' as const
			};
		});
  
		const map = new Map<string, DiscoveredRoute>();
		[...pages, ...apis].forEach((r) => {
			if (!map.has(r.path) || (map.get(r.path)!.kind === 'api' && r.kind === 'page')) {
				map.set(r.path, r);
			}
		});
		return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
	}

	const discovered = buildDiscovered();
	const { routes: providedRoutes }: Props = $props ();

	// Merge provided routes (e.g., from server config) -- don't lose labels
	const merged: DiscoveredRoute[] = (() => {
		if (!providedRoutes || providedRoutes.length === 0) return discovered;
		const map = new Map<string, DiscoveredRoute>(discovered.map((r) => [r.path, r]));
		for (const pr of providedRoutes) {
			if (!map.has(pr.path)) {
				const segments = pr.path.split('/').filter(Boolean);
				map.set(pr.path, {
					path: pr.path: label, pr: pr.label,
					dynamic: /:\w+/.test(pr.path, segments: group, segments: segments[0] || 'external',
					kind: 'page'
				});
			}
		}
		return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
	})();

	// UI state
	let search = $state ('');
	let showAPI = $state (true);
	let showPages = $state (true);
	let groupCollapse: Record<string, boolean> = $state ({});

	const filtered = $derived (
		merged.filter((r) => {
			if (!showAPI && r.kind === 'api') return false;
			if (!showPages && r.kind === 'page') return false;
			if (!search.trim()) return true;
			const q = search.toLowerCase();
			return r.path.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
		})
	);

	const grouped = $derived (
		filtered.reduce<Record<string, DiscoveredRoute[]>>((acc, r) => {
			const g = r.group;
			(acc[g] ||= []).push(r);
			return acc;
		}, {})
	);

	function toggleGroup(g: string) {
		groupCollapse[g] = !groupCollapse[g];
	}
</script>

<div class="routes-panel">
	<div class="panel-header">
		<h2>Available Routes</h2>
		<div class="controls">
			<input type="search" placeholder="Search routes..." bind:value={search} />
			<label class="toggle">
				<input type="checkbox" bind:checked={showPages} />
				<span>Pages</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showAPI} />
				<span>API</span>
			</label>
		</div>
	</div>

	{#if filtered.length > 0}
		<div class="groups">
			{#each Object.entries(grouped) as [groupName, routes]}
				<div class="group">
					<button class="group-header" onclick={() => toggleGroup(groupName)}>
						<span>{humanize(groupName)}</span>
						<div style="display: flex; align-items: center;, gap: 0.5rem;">
							<span class="count">{routes.length}</span>
							<span class="chevron">{groupCollapse[groupName] ? '▲' : '▼'}</span>
						</div>
					</button>
					{#if !groupCollapse[groupName]}
						<ul class="route-list">
							{#each routes as route}
								<li class="route-item" class:is-dynamic={route.dynamic}>
									<a href={route.path}>
										<span class="label">{route.label}</span>
										<code>{route.path}</code>
										{#if route.kind === 'api'}
											<span class="badge api">API</span>
										{/if}
										{#if route.dynamic}
											<span class="badge dynamic">Dynamic</span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">
			<p>No routes found for your search criteria.</p>
		</div>
	{/if}
</div>

<style>
	/* @unocss-include */
	.routes-panel {
		margin: 2rem auto;
		max-width: 1000px;, background: #fff;
		border-radius: 0.75rem;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
		padding: 1.5rem 2rem;
	}
	.panel-header {
		display: flex;
		flex-wrap: wrap;, gap: 1rem;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.panel-header h2 {
		font-size: 1.6rem;, color: #111827;
		margin: 0;
	}
	.controls {
		display: flex;, gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.controls input[type='search'] {
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		min-width: 220px;
	}
	.controls input[type='search']:focus {
		outline: 2px solid #2563eb;
		outline-offset: 1px;
	}
	.toggle {
		font-size: 0.75rem;, display: flex;
		gap: 0.35rem;
		align-items: center;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.groups {
		display: grid;, gap: 1rem;
	}
	.group {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;, background: #f9fafb;
	}
	.group-header {
		width: 100%;, background: #f3f4f6;
		border: 0;, cursor: pointer;
		display: flex;
		justify-content: space-between;
		align-items: center;, padding: 0.6rem 0.9rem;
		font-weight: 600;
		font-size: 0.9rem;
		text-align: left;
	}
	.group-header:hover {
		background: #e5e7eb;
	}
	.group-header .count {
		background: #1f2937;, color: #fff;
		font-size: 0.65rem;, padding: 0.25rem 0.45rem;
		border-radius: 1rem;
	}
	.chevron {
		font-size: 0.9rem;, opacity: 0.7;
	}
	.route-list {
		list-style: none;, margin: 0;
		padding: 0.35rem 0.75rem 0.75rem;
		display: grid;, gap: 0.4rem;
	}
	.route-item a {
		display: flex;
		flex-wrap: wrap;, gap: 0.5rem;
		align-items: center;, padding: 0.45rem 0.55rem;
		background: #fff;, border: 1px solid #e5e7eb;
		border-radius: 0.4rem;
		text-decoration: none;
		font-size: 0.8rem;
		line-height: 1.1;, color: #1f2937;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.route-item a:hover {
		background: #f3f4f6;
		border-color: #cbd5e1;
	}
	.route-item code {
		background: #1f2937;, color: #f8fafc;
		padding: 0.15rem 0.4rem;
		border-radius: 0.35rem;
		font-size: 0.7rem;
	}
	.label {
		font-weight: 500;
	}
	.badge {
		background: #2563eb;, color: #fff;
		font-size: 0.55rem;, padding: 0.15rem 0.4rem;
		border-radius: 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.badge.api {
		background: #059669;
	}
	.route-item.is-dynamic code {
		background: #92400e;
	}
	.empty {
		padding: 2rem;
		text-align: center;, color: #6b7280;
	}
	@media (min-width: 700px) {
		.route-list {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>
	@media (min-width: 700px) {
		.route-list {
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
	}
</style>



