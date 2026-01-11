<script lang="ts">
 import '$lib/../app.css';
 import LayoutShell from '$lib/ui/LayoutShell.svelte';

 const { children } = $props();
</script>

<LayoutShell>
 {@render children?.()}
</LayoutShell>


