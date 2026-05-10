<script lang="ts">
  import { superForm } from 'sveltekit-superforms/client';
  import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import type { PageData } from './$types';
  import type { SearchResult } from './+page.server';

  let { data }: { data: PageData & { results?: SearchResult[]; query?: string; collection?: string; elapsedMs?: number; error?: string } } = $props();

  const searchSchema = z.object({
    query: z.string().min(1).max(1000),
    limit: z.number().int().min(1).max(100).default(30),
    case_id: z.string().optional(),
    collection: z.enum(['evidence', 'legal_documents', 'kb_notecards']).default('evidence'),
  });

  const { form, errors, enhance, submitting } = superForm(data.form, {
    validators: zodClient(searchSchema),
    dataType: 'json',
  });

  let results: SearchResult[] = $derived((data as any).results ?? []);
  let expandedDocs = $state<Set<string>>(new Set());

  function toggleDoc(id: string) {
    const next = new Set(expandedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedDocs = next;
  }

  function scoreBadge(score: number) {
    if (score >= 0.85) return 'bg-green-100 text-green-800';
    if (score >= 0.70) return 'bg-blue-100 text-blue-800';
    if (score >= 0.55) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-600';
  }
</script>

<div class="max-w-5xl mx-auto p-6 space-y-6">
  <div>
    <h1 class="text-2xl font-bold text-gray-900">Document Search</h1>
    <p class="text-sm text-gray-500 mt-1">
      Semantic search across uploaded documents — inverse of upload pipeline.
      Query → embed → Qdrant → results grouped by document.
    </p>
  </div>

  <!-- Search form -->
  <form method="POST" action="?/search" use:enhance class="space-y-3">
    <div class="flex gap-2">
      <input
        type="text"
        name="query"
        bind:value={$form.query}
        placeholder="Search uploaded documents…  e.g. 'hearsay objection' or 'chain of custody'"
        class="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={$submitting}
        class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {$submitting ? 'Searching…' : 'Search'}
      </button>
    </div>

    {#if $errors.query}
      <p class="text-xs text-red-600">{$errors.query}</p>
    {/if}

    <div class="flex gap-4 items-center flex-wrap">
      <label class="flex items-center gap-1.5 text-sm text-gray-600">
        Collection:
        <select
          name="collection"
          bind:value={$form.collection}
          class="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="evidence">Evidence uploads</option>
          <option value="legal_documents">Legal documents</option>
          <option value="kb_notecards">KB notecards</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5 text-sm text-gray-600">
        Max results:
        <input
          type="number"
          name="limit"
          bind:value={$form.limit}
          min="1" max="100"
          class="border border-gray-300 rounded px-2 py-1 text-sm w-16"
        />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-gray-600">
        Case ID (optional):
        <input
          type="text"
          name="case_id"
          bind:value={$form.case_id}
          placeholder="uuid"
          class="border border-gray-300 rounded px-2 py-1 text-sm w-48 font-mono"
        />
      </label>
    </div>
  </form>

  <!-- Error -->
  {#if (data as any).error}
    <div class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {(data as any).error}
    </div>
  {/if}

  <!-- Results -->
  {#if results.length > 0}
    <div class="space-y-1">
      <p class="text-xs text-gray-500">
        {results.length} document{results.length !== 1 ? 's' : ''} matched
        "{(data as any).query}"
        in <strong>{(data as any).collection}</strong>
      </p>

      {#each results as doc (doc.evidence_id)}
        {@const isExpanded = expandedDocs.has(doc.evidence_id)}
        <div class="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <!-- Document header row -->
          <button
            type="button"
            onclick={() => toggleDoc(doc.evidence_id)}
            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <span class="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm text-gray-900 truncate">{doc.file_name}</span>
                {#if doc.case_id}
                  <span class="text-xs text-gray-400 font-mono">{doc.case_id.slice(0, 8)}…</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-gray-500">{doc.chunk_count} matching chunk{doc.chunk_count !== 1 ? 's' : ''}</span>
                {#if doc.chunks[0]?.content}
                  <span class="text-xs text-gray-400">—</span>
                  <span class="text-xs text-gray-500 truncate max-w-xs">{doc.chunks[0].content.slice(0, 80)}…</span>
                {/if}
              </div>
            </div>

            <span class={`text-xs px-2 py-0.5 rounded-full font-mono ${scoreBadge(doc.top_score)}`}>
              {(doc.top_score * 100).toFixed(0)}%
            </span>
          </button>

          <!-- Expanded chunks -->
          {#if isExpanded}
            <div class="border-t border-gray-100 divide-y divide-gray-100">
              {#each doc.chunks as chunk (chunk.chunk_index)}
                <div class="px-5 py-3 space-y-1">
                  <div class="flex items-center gap-2">
                    {#if chunk.heading}
                      <span class="text-xs font-medium text-gray-700">{chunk.heading}</span>
                    {/if}
                    {#if chunk.section_type}
                      <span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{chunk.section_type}</span>
                    {/if}
                    <span class="ml-auto text-xs text-gray-400 font-mono">chunk {chunk.chunk_index} · {(chunk.score * 100).toFixed(0)}%</span>
                  </div>
                  <p class="text-sm text-gray-700 leading-relaxed">{chunk.content}</p>
                </div>
              {/each}

              <div class="px-5 py-2 bg-gray-50">
                <a
                  href="/api/evidence/{doc.evidence_id}"
                  class="text-xs text-blue-600 hover:underline"
                >View full document →</a>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if (data as any).query}
    <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
      No documents matched "{(data as any).query}" in {(data as any).collection}.
      <br/><span class="text-xs mt-1 block">Try a broader query or check that documents have been uploaded and indexed.</span>
    </div>
  {/if}
</div>
