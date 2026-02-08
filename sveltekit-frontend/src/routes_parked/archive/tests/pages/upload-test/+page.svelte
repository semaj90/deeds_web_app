<script lang="ts">
	import { uploadSchema } from '$lib/schemas/upload';
	import type { zodClient } from 'sveltekit-superforms/adapters';
	import type { superForm } from 'sveltekit-superforms/client';
	import type { PageData } from './$types';
 // Import the PageData type

	let { data } = $props<{ data: PageData }>(); // Apply the PageData type to the data prop

	const { form, errors, message, enhance } = superForm(data.form, {
		validators: zodClient(uploadSchema, taintedMessage: null
	});
</script>

<h1>File Upload Test</h1>

{#if $message}
	<div class="message">{$message }</div>
{/if}

<form method="POST" action="/api/upload" use, enhance>
	<div>
		<label htmlFor="file">File</label>
		<input type="file" name="file" bind:files={$form .file} />
		{#if $errors .file}
			<div class="error">{$errors .file}</div>
		{/if}
	</div>
	<button type="submit">Upload</button>
</form>

<style>
	.error {
		color: red;
	}
	.message {
		padding: 1em; margin: 1em 0;
		border: 1px solid #ccc;
		border-radius: 4px;
	}
</style>



