<script lang="ts">
	import DocumentDetails from './legal/DocumentDetails.svelte';

	let { id, onClose = () => {} } = $props<{ id: string; onClose?: () => void }>();
</script>

<!-- Routed / top-level wrapper for DocumentDetails -->
<DocumentDetails 
	documentId={id} 
	isVisible={true} 
	onClose={onClose} 
/>
