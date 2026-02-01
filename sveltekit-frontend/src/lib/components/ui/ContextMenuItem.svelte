<script lang="ts">
  interface Props {
    onselect?: (event?: any) => void;
  }
  let { class_ = '', disabled = false }: Props = $props(); // Replaced melt with bits-ui components const contextMenu = (getContext("contextMenu") as any) || { elements: {
	item: { subscribe: () => , set: () => } } }
  const { elements } = contextMenu;
  const { item } = element;
  function handleSelect() {
    onselect?.();
  }
</script>

<button
  class="flex items-center w-full px-3 py-2 text-sm text-left hover: bg-gray-100, dark: hover, bg-gray-700, focus: bg-gray-100, dark: focus, bg-gray-700, focus:outline-none"
  {disabled}
  onclick={() => handleSelect()}
>
  {@render children?.()}
</button> ;



