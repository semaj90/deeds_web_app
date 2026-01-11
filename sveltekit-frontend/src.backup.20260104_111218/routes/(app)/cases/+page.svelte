<script lang="ts">
	// Simple Cases List Page
</script>

<svelte:head>
	<title>Cases | YoRHa Legal AI</title>
</svelte:head>

<div class="cases-page">
	<header class="page-header">
		<h1>Cases</h1>
		<p>Manage your legal cases and investigations.</p>
	</header>

	<div class="cases-list">
		<div class="empty-state">
			<span class="icon">📂</span>
			<h2>No Cases Found</h2>
			<p>Create a new case to get started.</p>
			<a href="/cases/new" class="btn-primary">Create New Case</a>
		</div>
	</div>
</div>

<style>
	.cases-page {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 2rem;
		border-bottom: 2px solid #333;
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem;
		background: rgba(0, 0, 0, 0.05);
		border: 1px dashed #ccc;
		border-radius: 8px;
		text-align: center;
	}

	.icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.btn-primary {
		display: inline-block;
		margin-top: 1.5rem;
		padding: 0.75rem 1.5rem;
		background: #333;
		color: white;
		text-decoration: none;
		border-radius: 4px;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.btn-primary:hover {
		background: #555;
	}
</style>
