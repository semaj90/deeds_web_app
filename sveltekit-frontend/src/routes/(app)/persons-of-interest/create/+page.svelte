<script lang="ts">
	import POIForm from '$lib/components/poi/POIForm.svelte';

	let { data } = $props();
</script>

<div class="create-page">
	<div class="page-header">
		<h1>Create Person of Interest</h1>
		<a href="/persons-of-interest" class="btn-back">Back</a>
	</div>

	<POIForm formData={data.form} />
</div>

<style>
	.create-page {
		padding: 2rem 2.5rem;
		margin: -2.5rem;
		background: #0f0f23;
		min-height: 100vh;
	}
	.create-page :global(h1), .create-page :global(h2), .create-page :global(h3), .create-page :global(h4), .create-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.create-page :global(a) { color: inherit; border-bottom: none; }
	.create-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.create-page :global(input), .create-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.create-page :global(.panel), .create-page :global(.card), .create-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.page-header h1 {
		color: #ffffff;
		font-size: 2rem;
		margin: 0;
	}

	.btn-back {
		padding: 0.75rem 1.5rem;
		background: #333;
		color: #ffffff;
		text-decoration: none;
		border-radius: 0.375rem;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.btn-back:hover {
		background: #444;
	}
</style>
