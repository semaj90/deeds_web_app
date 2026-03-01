<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Command Center - YoRHa Legal AI</title>
</svelte:head>

<div style="min-height: 100vh; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); color: white; padding: 2rem;">
	<h1 style="font-size: 2rem; margin-bottom: 1rem;">Command Center</h1>
	<p>Service Health: {JSON.stringify(data.serviceHealth)}</p>
	<p>User: {data.user ? data.user.email : 'No user'}</p>

	<div style="margin-top: 2rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 8px;">
		<h2>Page is rendering!</h2>
		<p>If you can see this, the basic page works.</p>
	</div>
</div>
