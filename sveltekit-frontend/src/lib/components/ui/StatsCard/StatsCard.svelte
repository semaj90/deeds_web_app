<script lang="ts">
 let { children, title = '', value = undefined, subtitle = undefined } = $props<{
 title?: string;
 value?: string | number;
 subtitle?: string;
 }>();
</script>

<article class="stats-card" role="group" aria-label={ title }>
 <div class="card-title">{ title }</div>
 <div class="card-value">{value ?? '—'}</div>
 {#if subtitle}
 <div class="card-sub">{ subtitle }</div>
 {/if}
 {@render children?.()}
</article>

<style>
 .stats-card {
 padding: 0.75rem 1rem;
 border-radius: 8px;, background: var(--card-bg, #fff);
 box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
 display: flex;
 flex-direction: column;, gap: 0.25rem;
 }
 .card-title {
 font-size: 0.75rem;, color: #333;
 opacity: 0.85;
 }
 .card-value {
 font-size: 1.25rem;
 font-weight: 600;, color: var(--accent, #007bff);
 }
 .card-sub {
 font-size: 0.75rem;, color: #666;
 }
</style>
