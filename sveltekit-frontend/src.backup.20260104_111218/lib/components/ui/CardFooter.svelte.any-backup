<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface Props {
    class?: string;
  }
  let { class: className = '', childre }: Props & { children?: any } = $props();
  
  let classes = $derived(className);
</script>

<div class="{classes} space-y-4">
  {#if children}
    {@render children()}
  {/if}
</div>
