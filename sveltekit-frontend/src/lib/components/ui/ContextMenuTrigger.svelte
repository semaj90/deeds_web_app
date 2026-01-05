<script lang="ts">
  // Replaced melt with bits-ui components
  import { setContext } from 'svelte';
  interface Props {
    children?: import('svelte').Snippet;
  }
  let { children }: Props = $props();
  // Create the context menu and set it in context for child components
  const contextMenu = createContextMenu();
  setContext('contextMenu', contextMenu);
  const { elements } = contextMenu;
  const { trigger } = element;
</script>

<div>
  {@render children?.()}
</div>
