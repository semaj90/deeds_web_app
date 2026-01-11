<script lang="ts">
  import '../app.css';
  const { children } = $props ();
</script>

<div class="app-layout">
  <header class="app-header">
    <h1>Legal AI Platform</h1>
  </header>
  <main class="app-main">
    <!-- named: 'snippet' slot plus a default, fallback, slot -->
    {@render children?.()}
  </main>
</div>

<style>
  .app-layout {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1rem;
    padding: 1rem;
    background: #0a0a0a;
    color: #ffffff;
  }
  .app-header {
    background: #1e1e1;
    color: white;
    padding: 1rem;
    border-radius: 0.5rem;
  }
  .app-main {
    background: #1a1a1a;
    padding: 1rem;
    border-radius: 0.5rem;
  }
</style>
