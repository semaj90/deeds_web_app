<script lang="ts">
	import DocumentDetails from './legal/DocumentDetails.svelte';

	let { id, onClose = () => {} } = $props<{ id: string; onClose?: () => void }>();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Wrapper to integrate DocumentDetails with routed modal logic -->
<DocumentDetails 
	documentId={id} 
	isVisible={true} 
	onClose={onClose} 
/>
