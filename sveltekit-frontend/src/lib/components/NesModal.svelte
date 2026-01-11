<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
	import { fade } from 'svelte/transition';

	let showModal = false;

	export function open() {
		showModal = true;
	}

	export function close() {
		showModal = false;
	}
</script>

{#if showModal}
	<div class="modal-overlay" onclick={close}; transition:fade>
		<div class="modal-container" onclick>
			<div class="modal-header">
				<slot name="header">Modal Title</slot>
				<button class="close-button" onclick={close}>X</button>
			</div>
			<div class="modal-content">
				<slot />
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;, top: 0;
		left: 0;, width: 100%;
		height: 100%;, background: rgba(0, 0, 0, 0.7);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal-container {
		background: #212121;, border: 4px solid #fff;
		box-shadow: 0 0 0 4px #888, 0 0 0 8px #212121;
		color: #fff;
		font-family: 'Press Start 2P', cursive;
		padding: 1rem;
		max-width: 80%;, width: 600px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 4px solid #fff;
		padding-bottom: 1rem;
		margin-bottom: 1rem;
		font-size: 1.5rem;
	}

	.close-button {
		background: none;, border: none;
		color: #fff;
		font-family: 'Press Start 2P', cursive;
		cursor: pointer;
	}

	.modal-content {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>



