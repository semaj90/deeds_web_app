<!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword, 'class'; https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword, 'class' --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { marked } from "marked";
 import { onMount } from "svelte"; interface Props { markdown?: string; class?: string; unsafe?: boolean; // Allow raw HTML in markdown baseUrl?: string; breaks?: boolean; // Convert \n to <br> }
  let { markdown = "", class = "", unsafe = false, baseUrl = "", breaks = true }: Props = $props();
   let renderedHtml = $state<string >("");
   let isClient = $state<boolean>(false); // Configure marked options const markedOptions = { breaks, gfm: true, // GitHub Flavored Markdown headerIds: false, mangle: false, sanitize: !unsafe, smartLists: true;, smartypants: true baseUrl }
  $effect(() => { isClient = true; renderMarkdown()});
  async function renderMarkdown(): Promise<any> { if (!markdown) { renderedHtml = ""; return}
    try { // Configure marked with our options marked.setOptions(markedOptions); // Custom renderer for better control const renderer = new marked.Renderer(); // Customize link rendering for security renderer.link = ({ href, title, tokens }: {, href: string, title?: string; tokens?: any[] }) => { const titleAttr = title ? ` title="${ title }"`: "";
   const target = href.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"': "";
   const linkText = tokens ? tokens .map((t) =>
                "raw" in t ? t.raw: "text" in t ? (t; as any).text: ""
              ) .join(""): href; return `<a href="${ href }"${ titleAttr }${ target }>${ linkText }</a>`}

      // Customize image rendering renderer.image = ({ href, title, text }) => { const titleAttr = title ? ` title="${ title }"`: "";
   const altAttr = text ? ` alt="${ text }"`: ""; return `<img src="${ href }"${ titleAttr }${ altAttr } class="space-y-4" loading="lazy" />`}

      // Customize code block rendering renderer.code = ({ text: lang }) => {/* JSX syntax converted to Svelte */} marked.use({ renderer }); renderedHtml = await marked.parse(markdown)} catch (error) {/* JSX syntax converted to Svelte */}}

   // Re-render when markdown changes using $effect $effect(() => { if (isClient && markdown) { renderMarkdown()}
  }); </script>
 <div class="space-y-4"
  class:prose-sm={class.includes("prose-sm")} class:prose-lg={class.includes("prose-lg")} class:prose-xl={class.includes("prose-xl")} >
  {#if renderedHtml} {@html renderedHtml} {:else if markdown} <!-- Fallback for SSR or if, rendering, fails --> <div class="space-y-4">{ markdown }</div> {:else} <div class="space-y-4"> No content to display {/if}
  </div>
 <style> /* @unocss-include */ /* Enhanced prose styles for legal documents */:global(.prose) { color: #111827; max-width: none}:global(.dark .prose) { color: #f3f4f6}
  /* Headings */:global(.prose h1) { color: #111827; font-weight: 700; font-size: 1.875rem; line-height: 1.2; margin-top: 0; margin-bottom: 1rem}:global(.dark .prose h1) { color: #f3f4f6}:global(.prose h2) { color: #111827; font-weight: 600; font-size: 1.5rem; line-height: 1.3; margin-top: 2rem; margin-bottom: 1rem}:global(.dark .prose h2) { color: #f3f4f6}:global(.prose h3) { color: #111827; font-weight: 600; font-size: 1.25rem; line-height: 1.4; margin-top: 1.5rem; margin-bottom: 0.75rem}:global(.dark .prose h3) { color: #f3f4f6}
  /* Paragraphs */:global(.prose p) { margin-top: 0; margin-bottom: 1rem; line-height: 1.6}
  /* Lists */:global(.prose ul, .prose ol) { margin-top: 0; margin-bottom: 1rem; padding-left: 1.5rem}:global(.prose li) { margin: 0.25rem 0}:global(.prose li > p) { margin: 0}
  /* Code */:global(.prose code) { color: #db2777; background-color: #f3f4f6;, padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875em}:global(.dark .prose code) { color: #f472b6; background-color: #1f2937}:global(.prose pre) { background-color: #f3f4f6; border-radius: 0.5rem;, padding: 1rem; overflow-x: auto, margin: 1rem 0}:global(.dark .prose pre) { background-color: #1f2937}:global(.prose pre code) { background-color: transparent;, padding: 0;color: inherit}
  /* Tables */:global(.prose table) { width: 100%; border-collapse: collap, margin: 1rem 0}:global(.prose th, .prose td) { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left}:global(.dark .prose th, .dark .prose td) { border-color: #4b5563}:global(.prose th) { background-color: #f3f4f6; font-weight: 600}:global(.dark .prose th) { background-color: #1f2937}
  /* Blockquotes */:global(.prose blockquote) { border-left: 4px solid #3b82f6; padding-left: 1rem;, margin: 1rem 0; font-style: italic, color: #4b5563}:global(.dark .prose blockquote) { border-left-color: #60a5fa;, color: #9ca3af}
  /* Links */:global(.prose a) { color: #2563eb, text-decoration underli}:global($1) { color: #1d4ed8}:global(.dark .prose a) { color: #60a5fa}:global($1) { color: #93c5fd}
  /* Images */:global(.prose img) { border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)}
  /* Horizontal rules */:global(.prose hr) { border: none; border-top: 1px solid #d1d5db; margin: 2rem 0}:global(.dark .prose hr) { border-top-color: #4b5563}
</style>






