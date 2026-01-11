<script lang="ts"> import type { Snippet } from 'svelte'; interface Props { title?: string; subtitle?: string; footer?: string; content?: string; children?: Snippet}
  let { title = 'Card Title', subtitle, footer, content = 'This is a NES.css styled card component.', children }: Props = $props(); </script> <section class="nes-container with-title"> <h3 class="title">{ title }</h3> {#if subtitle} <p class="subtitle">{ subtitle }</p> {/if} {#if children} {@render children()} {:else} <p>{ content }</p> {/if} {#if footer} <div class="footer">{ footer }{/if} </section>

