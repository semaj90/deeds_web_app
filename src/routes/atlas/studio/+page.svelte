<script>
  let info = 'Parent Atlas Studio — preview. Use APIs to inspect cards, redis, and search.';
</script>

<style>
  .panel { padding: 1rem; max-width: 900px; margin: 2rem auto; font-family: system-ui, sans-serif; }
  a { color: #0b5; }
</style>

<div class="panel">
  <h1>Parent Atlas Studio</h1>
  <p>{info}</p>

  <ul>
    <li><a href="/api/atlas/studio/cards">/api/atlas/studio/cards</a> — Postgres RagCard / ClusterCard (read)</li>
    <li><a href="/api/atlas/studio/redis">/api/atlas/studio/redis</a> — Redis hot keys (read-only)</li>
    <li><a href="/api/atlas/studio/search">/api/atlas/studio/search?q=example</a> — Qdrant semantic search</li>
  </ul>

  <p>Notes:</p>
  <ol>
    <li>UI reads Postgres / Redis / Qdrant — it does not read raw OpenCode JSON files.</li>
    <li>Redis access is limited to safe prefixes and scan-based paging.</li>
  </ol>
</div>
