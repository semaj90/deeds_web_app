<script lang="ts">
  import type { Document } from '$lib/types';
  
  interface Props { r: any; onclick?: () => void; }
  let { r, onclick }: Props = $props();
</script>

<div class="vector-card" role="button" tabindex="0" {onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()}>
  <div class="title">{r?.meta?.title ?? r?.id ?? 'Document'}</div>
  <div class="snippet">{r?.meta?.snippet ?? r?.text?.slice(0, 200)}</div>
  <div class="meta">Score: {r?.score ?? r?.distance ?? 'n/a'}</div>
</div>

<style>
  .vector-card {
    padding: 0.5rem;
	border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }
  .title {
    font-weight: 600;
  }
  .snippet {
    color: #6b7280;
    font-size: 0.9rem;
  }
  .meta {
    font-size: 0.8rem;
	color: #9ca3af;
  }
</style>



