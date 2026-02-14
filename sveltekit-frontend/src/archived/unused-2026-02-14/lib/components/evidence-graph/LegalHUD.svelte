<script lang="ts">
  let { showHUD = true }: { showHUD?: boolean } = $props();
</script>

{#if showHUD}
<div class="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-info to-warning/80 animate-pulse opacity-30"></div>
{/if}


