<script lang="ts">
  import Dialog from './Dialog.svelte';

  let { children, ...rest } = $props();
</script>

<Dialog
  entranceAnimation="portal"
  enableAtmosphere={true}
  {...rest}
>
    {#if children}
        {@render children()}
    {/if}
</Dialog>
