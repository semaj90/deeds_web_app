<script lang="ts"> import { getContext } from "svelte";
 import { writable } from "svelte/store";
 import type { SelectContext } from "./types"; interface Props { class?: string; placeholder?: any; children?: any}
  let { children, placeholder, class: class_ = ""
  }: Props = $props();
   const context = getContext<SelectContext>("select") || ({ selected: writable(null), open: writable(false), onSelect: () => {}, onToggle: () => {} } as SelectContext);
   const { selected } = context; </script> <span class="space-y-4"> {#if $selected} {#if children}{@render children({ value: $selected })}{:else} {$selected} {/if} {:else} {#if placeholder}{@render placeholder()}{:else}Select an option...{/if} </span> <style>/* @unocss-include */ {}</style>;
