<script lang="ts">
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Dashboard - YoRHa Legal AI</title>
</svelte:head>

<div class="dashboard-container">
	<h1>🛡️ Protected Dashboard</h1>

	{#if data.devBypass}
		<div class="dev-info">
			<h2>Development Mode</h2>
			<p>Authentication is bypassed. Set <code>DEV_BYPASS_AUTH=false</code> to test auth flow.</p>
		</div>
	{:else if data.user}
		<div class="user-info">
			<h2>Welcome, {data.user.email}!</h2>
			<p>User ID: {data.user.id}</p>
		</div>
	{/if}

	<div class="quick-actions">
		<h2>Quick Actions</h2>
		<nav>
			<a href="/cases">📂 View Cases</a>
			<a href="/cases/new">➕ New Case</a>
			<a href="/evidence">🔍 Evidence Library</a>
			<a href="/legal/documents">📄 Legal Documents</a>
			<a href="/all-routes">🗺️ All Routes</a>
		</nav>
	</div>

	<div class="phase14-info">
		<h2>Phase 14 Configuration</h2>
		<ul>
			<li>✅ .env.phase14 master config established</li>
			<li>✅ Lucia auth integration complete</li>
			<li>✅ (app) route group created</li>
			<li>✅ Auth guard active on protected routes</li>
		</ul>
	</div>
</div>

<style>
	.dashboard-container {
		max-width: 1200px;
	margin: 2rem auto;
		padding: 0 1rem;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 2rem;
	color: var(--text-primary, #1a1a1a);
	}

	h2 {
		font-size: 1.5rem;
		margin-top: 2rem;
		margin-bottom: 1rem;
	color: var(--text-secondary, #444);
	}

	.dev-info,
	.user-info,
	.quick-actions,
	.phase14-info {
		background: var(--surface, #f8f9fa);
		border: 1px solid var(--border, #e0e0e0);
		border-radius: 8px;
	padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.dev-info {
		background: #fff3cd;
		border-color: #ffc107;
	}

	code {
		background: #e9ecef;
	padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: 'Courier New', monospace;
		font-size: 0.9em;
	}

	nav {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	nav a {
		display: block;
	padding: 1rem;
		background: white;
	border: 2px solid #007bff;
		border-radius: 6px;
		text-decoration: none;
	color: #007bff;
		font-weight: 500;
		text-align: center;
	transition: all 0.2s;
	}

	nav a:hover {
		background: #007bff;
	color: white;
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 123, 255, 0.2);
	}

	ul {
		list-style: none;
	padding: 0;
	}

	ul li {
		padding: 0.5rem 0;
		font-size: 1rem;
	}
</style>




