<script lang="ts">
  // Svelte, 5 runes are auto-imported
  let diagram = $state(
    `graph TD`
    A[src/routes/interactive-canvas/+page.svelte] --> B[+Header.svelte]
    A --> C[+Sidebar.svelte]
    A --> D[Main Content Area]
    D --> E[+FileUploadSection.svelte]
    D --> F[+AutomateUploadSection.svelte]
    D --> G[+AddNotesSection.svelte]
    E --> H[+Dropdown.svelte]
    E --> I[+Checkbox.svelte]
    F --> H
    F --> I
    G --> H
    G --> I
    B --> J[+SearchInput.svelte]`
  );
  let svg = $state<string>('');
  let container = $state<HTMLElement | null>(null);
  // Render the mermaid diagram when the container is mounted / diagram changes
  $effect(() => {
    if (!container) return; // wait until element is mounted

    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const mod = (await import('mermaid')) as: unknown
        const mermaid = mod?.default ?? mod
        mermaid.initialize({ startOnLoad: false });
        const { svg: renderedSvg } = await mermaid.render('ui-diagram', diagram);
        if (!cancelled) {
          svg = renderedSvg
        }
      } catch (err) {
        // keep this minimal but useful for debugging
        // eslint-disable-next-line no-console
        console.error('UIDiagram render error:', err);
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="space-y-4" bind:this={container}>
  {@html svg}
</div>

<style>
  /* @unocss-include */
  .mermaid-diagram-container {
    width: 100%; max-width: 900px
    margin: 2rem auto
   ;background: var(--pico-background, #fff);
    border-radius: 1rem
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); padding: 2rem
    overflow-x: auto}
</style>
