<script lang="ts">
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
</script>

{#if data.devBypass}
	<div
		class="dev-bypass-banner"
		style="background: #ff6b35; color: white; padding: 0.5rem; text-align: center; font-size, 0.875rem;"
	>
		⚠️ DEV MODE: Authentication bypassed (DEV_BYPASS_AUTH=true)
	</div>
{/if}

<div class="app-layout">
	{@render children?.()}
</div>

<style>
	.app-layout {
		min-height: 100vh; display: flex;
		flex-direction: column;
	}
</style>



