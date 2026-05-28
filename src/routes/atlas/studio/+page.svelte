<script>
  import { onMount } from 'svelte';

  let loading = true;
  let error = '';
  let cards = [];
  let selected = 0;
  let redisStatus = { ok: false, note: '' };
  let postgresDegraded = false;

  function shortHash(str) {
    // simple non-cryptographic hash for display
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16).slice(-8);
  }

  async function load() {
    loading = true; error = '';
    try {
      const [cRes, rRes] = await Promise.all([
        fetch('/api/atlas/studio/cards'),
        fetch('/api/atlas/studio/redis')
      ]);

      if (!rRes.ok) {
        redisStatus = { ok: false, note: 'Redis unavailable' };
      } else {
        redisStatus = await rRes.json();
      }

      if (!cRes.ok) {
        postgresDegraded = true;
        cards = [];
      } else {
        const body = await cRes.json();
        cards = Array.isArray(body.cards) ? body.cards : [];
        postgresDegraded = !!body.note && body.cards?.length === 0;
      }
    } catch (err) {
      error = String(err);
      cards = [];
    } finally {
      loading = false;
    }
  }

  function prev() { if (cards.length) selected = (selected - 1 + cards.length) % cards.length; }
  function next() { if (cards.length) selected = (selected + 1) % cards.length; }

  function onKey(e) {
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) copyJSON();
  }

  async function copyJSON() {
    if (!cards[selected]) return;
    await navigator.clipboard.writeText(JSON.stringify(cards[selected], null, 2));
    // tiny visual cue could be added later
  }

  onMount(() => {
    load();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<style>
  .panel { padding: 1rem; max-width: 980px; margin: 2rem auto; font-family: system-ui, sans-serif; }
  .card { border: 1px solid #ddd; padding: 0.75rem; margin: 0.5rem 0; border-radius: 6px; background: #fff; }
  .banner { padding: 0.5rem; background: #fff4e5; border: 1px solid #ffd8a8; margin-bottom: 0.75rem; }
  .muted { color: #666; font-size: 0.9rem; }
  .toolbar { display:flex; gap:8px; margin-bottom:8px; }
  button { padding:6px 8px; border-radius:4px; border:1px solid #ccc; background:#f7f7f7; }
  .empty { text-align:center; color:#777; padding:2rem 0; }
</style>

<div class="panel">
  <h1>Parent Atlas Studio</h1>

  {#if loading}
    <div class="banner">Loading atlas cards and cache status…</div>
  {:else}
    {#if error}
      <div class="banner">Error loading Studio data: {error}</div>
    {/if}
  {/if}

  {#if redisStatus && !redisStatus.ok}
    <div class="banner">Redis degraded: {redisStatus.note || 'unknown'}</div>
  {/if}

  {#if postgresDegraded}
    <div class="banner">Postgres appears degraded — showing cached/empty results.</div>
  {/if}

  <div class="toolbar">
    <button on:click={prev} aria-label="Previous">◀</button>
    <button on:click={next} aria-label="Next">▶</button>
    <button on:click={copyJSON} aria-label="Copy JSON">Copy JSON</button>
    <button on:click={load} aria-label="Reload">Reload</button>
    <div class="muted">Keyboard: ← → to navigate, Ctrl/Cmd+C to copy</div>
  </div>

  {#if !loading && cards.length === 0}
    <div class="empty">No cards found — try different query or check ingestion status.</div>
  {/if}

  {#each cards as card, i}
    <div class="card" style="outline: {i===selected ? '2px solid #0b5' : 'none'};" tabindex={i===selected ? 0 : -1}>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>{card.title || card.id || 'Untitled Card'}</strong>
          <div class="muted">type: {card.type || 'card'} • version: {card.version || shortHash(JSON.stringify(card))}</div>
        </div>
        <div>
          {#if card.sourceRef}
            <a href={card.sourceRef} target="_blank">source</a>
          {/if}
        </div>
      </div>
      <p>{card.summary || card.description || ''}</p>
      <div class="muted">hash: {shortHash(JSON.stringify(card))}</div>
    </div>
  {/each}

</div>
