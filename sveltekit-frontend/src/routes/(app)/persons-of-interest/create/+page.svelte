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
		padding: 2rem;
		background: #0f0f23;
		min-height: 100vh;
	}

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
