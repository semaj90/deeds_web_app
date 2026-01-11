<script lang="ts">
  interface Props {
    class?: string;
  }
  let { class: class_ = '', children }: Props & { children?: any } = $props();
</script>

<div class="space-y-4">
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  /* @unocss-include */
  .select-group {
    padding: 4px 0;
  }
</style>
