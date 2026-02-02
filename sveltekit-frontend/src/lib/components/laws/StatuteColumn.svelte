<script lang="ts">
  // Migrated to $effect

  interface Props {
    title: string;
	section: string;
    body: string;
	statuteId: string;
  }

  let { title, section, body, statuteId }: Props = $props();

  let context: {
    prefetchToken?: string;
    relatedStatutes?: Array<{
	id: string; title: string }>;
    semanticKeywords?: string[];
  } | null = $state(null);
  let isExplaining = $state(false);
  let explanation = $state('');

  $effect(() => {

    (async () => {
      try {
        const response = await fetch(`/api/laws/prefetch-context?sectionId=${statuteId}`);
        if (response.ok) {
          context = await response.json();
        }
      } catch (error) {
        console.error('Prefetch failed:', error);
      }
    
});();
  });

  async function explainSection() {
    isExplaining = true;
    try {
      const response = await fetch('/api/chat/explain-statute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	sectionId: statuteId,
          prefetchToken: context?.prefetchToken,
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        explanation = data.explanation;
      }
    } catch (error) {
      console.error('Explanation failed:', error);
    } finally {
      isExplaining = false;
    }
  }
</script>

<article class="column">
  <header class="column-header">
    <h1 class="column-title">{title}</h1>
    <p class="column-section">{section}</p>
  </header>

  <div class="column-body">
    <div class="statute-text">
      {@html body}
    </div>

    <div class="column-actions">
      <button
        class="btn btn-primary"
        onclick={explainSection}
        disabled={isExplaining}
      >
        {isExplaining ? '⏳ Explaining...' : '💡 Explain this section'}
      </button>

      {#if context?.relatedStatutes && context.relatedStatutes.length > 0}
        <div class="related-statutes">
          <h3>Related Statutes</h3>
          <ul>
            {#each context.relatedStatutes as statute}
              <li>
                <a href="/laws/{statute.id}">
                  {statute.title}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if context?.semanticKeywords && context.semanticKeywords.length > 0}
        <div class="keywords">
          <h3>Key Concepts</h3>
          <div class="keyword-tags">
            {#each context.semanticKeywords as keyword}
              <span class="keyword-tag">{keyword}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    {#if explanation}
      <div class="explanation-box">
        <h3>📖 Explanation</h3>
        <div class="explanation-content">
          {@html explanation}
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  .column {
    max-width: 700px;
	padding: 2rem 1.5rem;
    background-color: #fff;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 2rem;
  }

  .column-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 2px solid #f0f0f0;
  }

  .column-title {
    margin: 0 0 0.5rem 0;
    font-family: 'IBM Plex Serif', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
	color: #222;
    line-height: 1.3;
  }

  .column-section {
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.95rem;
	color: #666;
    font-weight: 600;
  }

  .column-body {
    display: flex;
    flex-direction: column;
	gap: 1.5rem;
  }

  .statute-text {
    font-size: 1rem;
    line-height: 1.7;
	color: #333;
    word-break: break-word;
  }

  :global(.statute-text p) {
    margin: 0.75rem 0;
  }

  :global(.statute-text strong) {
    font-weight: 700;
	color: #222;
  }

  .column-actions {
    display: flex;
    flex-direction: column;
	gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #f0f0f0;
  }

  .btn {
    padding: 0.75rem 1.25rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    background-color: #fff;
	color: #333;
    font-size: 0.95rem;
    font-weight: 600;
	cursor: pointer;
    transition:all 0.2s ease;
    text-align: left;
  }

  .btn:hover:not(:disabled) {
    background-color: #f5f5f5;
    border-color: #999;
  }

  .btn:disabled {
    opacity: 0.6;
	cursor: not-allowed;
  }

  .btn-primary {
    background-color: #faf1a0;
    border-color: #f0e080;
	color: #333;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #f5e880;
    border-color: #e0d060;
  }

  .related-statutes {
    padding: 1rem;
    background-color: #f9f9f9;
    border-left: 4px solid #faf1a0;
    border-radius: 2px;
  }

  .related-statutes h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    font-weight: 700;
	color: #333;
  }

  .related-statutes ul {
    margin: 0;
    padding-left: 1.25rem;
    list-style: disc;
  }

  .related-statutes li {
    margin: 0.5rem 0;
    font-size: 0.9rem;
	color: #555;
  }

  .related-statutes a {
    color: #0066cc;
    text-decoration: none;
  }

  .related-statutes a:hover {
    text-decoration: underline;
  }

  .keywords {
    padding: 1rem;
    background-color: #f9f9f9;
    border-radius: 2px;
  }

  .keywords h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    font-weight: 700;
	color: #333;
  }

  .keyword-tags {
    display: flex;
    flex-wrap: wrap;
	gap: 0.5rem;
  }

  .keyword-tag {
    display: inline-block;
	padding: 0.4rem 0.75rem;
    background-color: #fff;
	border: 1px solid #d0d0d0;
    border-radius: 3px;
    font-size: 0.8rem;
	color: #555;
    font-family: 'JetBrains Mono', monospace;
  }

  .explanation-box {
    padding: 1.25rem;
    background-color: #fffbf0;
	border: 1px solid #fae8d0;
    border-radius: 4px;
  }

  .explanation-box h3 {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    font-weight: 700;
	color: #333;
  }

  .explanation-content {
    font-size: 0.95rem;
    line-height: 1.6;
	color: #444;
  }

  :global(.explanation-content p) {
    margin: 0.75rem 0;
  }

  :global(.explanation-content strong) {
    font-weight: 700;
	color: #222;
  }

  :global(.explanation-content ul) {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }

  :global(.explanation-content li) {
    margin: 0.5rem 0;
  }
</style>
