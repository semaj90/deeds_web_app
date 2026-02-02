<script lang="ts">
	import { page } from '$app/state';

	interface NavSection {
		label: string;
	path: string;
	icon: string;
	}

	const sections: NavSection[] = [
		{ label: 'Evidence', path: '/admin/evidence', icon: '📄' },
	{ label: 'Chunks', path: '/admin/chunks', icon: '🔗' },
	{ label: 'Embeddings', path: '/admin/embeddings', icon: '🧠' },
	{ label: 'Citations', path: '/admin/citations', icon: '⚖️' },
	{ label: 'KAG Links', path: '/admin/kag', icon: '🕸️' },
	{ label: 'Audit', path: '/admin/audit', icon: '📋' }
	];

	function isActive(path: string): boolean {
		return page.url.pathname.startsWith(path);
	}
</script>

<nav class="admin-sidebar">
	<div class="sidebar-header">
		<h2>⚖️ Legal Admin</h2>
	</div>

	<div class="nav-sections">
		{#each sections as section (section.path)}
			<a
				href={section.path}
				class="nav-item"
				class:active={isActive(section.path)}
				title={section.label}
			>
				<span class="icon">{section.icon}</span>
				<span class="label">{section.label}</span>
			</a>
		{/each}
	</div>

	<div class="sidebar-footer">
		<div class="status-indicator">
			<span class="dot"></span>
			<span class="text">Connected</span>
		</div>
	</div>
</nav>

<style>
	.admin-sidebar {
		display: flex;
		flex-direction: column;
	height: 100vh;
	width: 240px;
	background: #0d0d0f;
		border-right: 1px solid #222;
		padding: 0;
		overflow-y: auto;
	position: sticky;
	top: 0;
	left: 0;
	}

	.sidebar-header {
		padding: 1.5rem 1rem;
		border-bottom: 1px solid #222;
		background: #111;
	}

	.sidebar-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	color: #ddd;
		letter-spacing: 0.5px;
	}

	.nav-sections {
		flex: 1;
	display: flex;
		flex-direction: column;
	padding: 0.5rem 0;
		gap: 0;
	}

	.nav-item {
		display: flex;
		align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
		color: #999;
		text-decoration: none;
	transition:all 0.2s ease;
		border-left: 2px solid transparent;
		font-size: 0.9rem;
	}

	.nav-item:hover {
		background: #16161a;
	color: #bbb;
	}

	.nav-item.active {
		background: #1a1a1f;
	color: #9df;
		border-left-color: #9df;
	}

	.icon {
		font-size: 1.1rem;
	width: 1.5rem;
		text-align: center;
	}

	.label {
		flex: 1;
		white-space: nowrap;
	overflow: hidden;
		text-overflow: ellipsis;
	}

	.sidebar-footer {
		padding: 1rem;
		border-top: 1px solid #222;
		background: #111;
	}

	.status-indicator {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		font-size: 0.8rem;
	color: #666;
	}

	.dot {
		display: inline-block;
	width: 6px;
	height: 6px;
		border-radius: 50%;
	background: #4a4;
	animation: pulse 2s infinite;
	}

	.text {
		flex: 1;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Scrollbar styling */
	::-webkit-scrollbar {
		width: 6px;
	}

	::-webkit-scrollbar-track {
		background: #0d0d0f;
	}

	::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #444;
	}
</style>
