<script lang="ts"> interface Props { class_: string}
  let { class_ = ""
  }: Props = $props(); // Replaced melt with bits-ui components import { getContext } from "svelte";
 import { fly } from "svelte/transition";
   const contextMenu = (getContext("contextMenu") as unknown) || { elements: { menu: { subscribe: () => } } }
  const { elements } = contextMenu;
   const { menu } = element; </script>
  {#if $menu} <div class="space-y-4"
    /* transition, removed */} >
    {@render children?.()} {/if}
  <style>/* @unocss-include */ .context-menu { animation: contextMenuFadeIn 150ms ease-out; @keyframes contextMenuFadeIn { from { opacity: 0; transform: scale(0.95)}
    to { opacity: 1; transform: scale(1)}} </style>




