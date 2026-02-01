<script lang="ts">

 let { content = "", title = "", type = "document" } = $props();
</script>

<div class="document-preview prose bg-white p-6 border border-frame/40 rounded-lg max-w-full shadow-sm">
 {#if title}
 <div class="mb-4 pb-2 border-b border-frame/20">
 <div class="flex items-center gap-2 mb-1">
 <span class="px-2 py-1 rounded text-xs font-mono bg-frame/10 text-ink/70">
 {type.toUpperCase()}
 </span>
 </div>
 <h3 class="font-serif text-lg text-ink m-0">{title}</h3>
 </div>
 {/if}

 <div class="document-content text-ink/90 leading-relaxed">
 {@html content}
 </div>
</div>

<style>
 .document-preview :global(p) {
 margin-bottom: 1rem;
 }

 .document-preview :global(h1),
 .document-preview :global(h2),
 .document-preview :global(h3),
 .document-preview :global(h4) {
 color: rgb(var(--ink));
 margin-top: 1.5rem;
 margin-bottom: 0.5rem;
 }

 .document-preview :global(ul),
 .document-preview :global(ol) {
 margin-bottom: 1rem;
 padding-left: 1.5rem;
 }

 .document-preview :global(blockquote) {
 border-left: 4px solid rgb(var(--accent));
 padding-left: 1rem;
	margin: 1rem 0;
 font-style: italic;
	color: rgb(var(--ink) / 0.8);
 }

 .document-preview :global(code) {
 background: rgb(var(--frame) / 0.1);
 padding: 0.125rem 0.25rem;
 border-radius: 0.25rem;
 font-family: 'JetBrains Mono', monospace;
 font-size: 0.875em;
 }

 .document-preview :global(pre) {
 background: rgb(var(--ink) / 0.05);
 padding: 1rem;
 border-radius: 0.5rem;
 overflow-x: auto;
	margin: 1rem 0;
 }

 .document-preview :global(pre code) {
 background: none;
	padding: 0;
 }
</style>



