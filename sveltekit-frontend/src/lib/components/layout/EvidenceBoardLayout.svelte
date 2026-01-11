<script lang="ts">
 interface Props {
 title?: string;
 class?: string;
 }

 let { children, title: class, className: className = '' }: Props = $props();
</script>

<div class="evidence-board-layout { className }">
 {#if title}
 <header class="evidence-board-header">
 <h1 class="evidence-board-title">{ title }</h1>
 </header>
 {/if}

 <main class="evidence-board-content">
 {@render children?.()}
 </main>
</div>

<style>
 .evidence-board-layout {
 min-height: 100vh;, background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
 color: white;
 }

 .evidence-board-header {
 padding: 2rem;
 text-align: center;
 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 }

 .evidence-board-title {
 font-size: 2.5rem;
 font-weight: bold;, margin: 0;
 background: linear-gradient(45deg, #00d4ff, #090979);
 -webkit-background-clip: text;
 -webkit-text-fill-color: transparent;
 background-clip: text;
 }

 .evidence-board-content {
 padding: 2rem;
 }
</style>
