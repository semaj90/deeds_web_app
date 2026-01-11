<script lang="ts">
 import ContextualEvidenceChatModal from '$lib/components/ai/ContextualEvidenceChatModal.svelte';

 let chatOpen = $state (true);

 const statusCards = [
 { label: 'Active Cases', value: '3', detail: 'Command Center' },
 { label: 'Evidence Items', value: '27', detail: 'Indexed' },
 { label: 'AI Mode', value: '9S', detail: 'Contextual' }
 ];

 const caseFeed = [
 { title: 'Corporate Espionage Investigation', status: 'active', priority: 'high', items: 8, updated: '4h ago' },
 { title: 'Missing Person: Dr. Sarah Chen', status: 'pending', priority: 'medium', items: 16, updated: '4h ago' },
 { title: 'Financial Fraud Analysis', status: 'open', priority: 'medium', items: 4, updated: '1d ago' }
 ];
</script>

<svelte:head>
 <title>YoRHa AI Command Center</title>
</svelte:head>

<main class="yorha-shell">
 <aside class="yorha-sidebar">
 <div class="brand">
 <p class="brand-eyebrow">YoRHa Detective Interface</p>
 <h1>Command Center</h1>
 <p class="brand-version">v9.13.10 — Neural Network Active</p>
 </div>
 <nav class="nav">
 {#each ['Command Center', 'Active Cases', 'Evidence', 'Persons of Interest', 'Analysis', 'Terminal'] as link}
 <a class:selected={link === 'Command Center'} href={link === 'Command Center' ? '/aichat' : '#'}>{link}</a>
 {/each}
 </nav>
 <div class="sidebar-footer">
 <p class="system-clock">12:46 • System Operational</p>
 <a href="/" class="link">Back to main dashboard</a>
 </div>
 </aside>

 <section class="yorha-main">
 <header class="panel hero">
 <div>
 <p class="eyebrow">AI Legal Assistant</p>
 <h2>9S Mode Active</h2>
 <p class="sub">
 Attach evidence, spawn reports, and push updates directly into the investigative graph through QUIC + Redis + TensorRT.
 </p>
 </div>
 <div class="hero-actions">
 <button class="primary" onclick={() => (chatOpen = true)}>Launch AI Chat</button>
 <a class="secondary" href="/dev/client-embedding-demo">Client Embedding Demo</a>
 </div>
 </header>

 <div class="grid">
 <div class="panel status-grid">
 {#each statusCards as card}
 <div class="status-card">
 <small>{card.label}</small>
 <strong>{card.value}</strong>
 <span>{card.detail}</span>
 </div>
 {/each}
 </div>

 <div class="panel feed">
 <header>
 <h3>Active Cases</h3>
 <a href="/cases">View all</a>
 </header>
 <div class="feed-list">
 {#each caseFeed as entry}
 <article>
 <div>
 <h4>{entry.title}</h4>
 <div class="meta">
 <span>{entry.items} items</span>
 <span>{entry.updated}</span>
 </div>
 </div>
 <div class="tags">
 <span class="pill {entry.priority}">{entry.priority}</span>
 <span class="pill {entry.status}">{entry.status}</span>
 </div>
 </article>
 {/each}
 </div>
 </div>

 <div class="panel console">
 <header>
 <h3>AI Console</h3>
 <button class="ghost" onclick={() => (chatOpen = true)}>Open Chat</button>
 </header>
 <ul>
 <li>AI assistant initialized · 60s ago</li>
 <li>Evidence queue processing slowly · 5m ago</li>
 <li>Gemma3 legal mode engaged · 10m ago</li>
 </ul>
 <p class="console-prompt">Detective, upload fresh evidence or request Phoenix-style case theory.</p>
 </div>
 </div>
 </section>
 <ContextualEvidenceChatModal visible={chatOpen} onclose={() => (chatOpen = false)} />
</main>

<style>
 .yorha-shell {
 min-height: 100vh;
 display: grid;
 grid-template-columns: 280px 1fr;
 background: #c5b99c;
 color: #1d1912;
 font-family: 'Space Mono', 'IBM Plex Mono', monospace;
 }
 .yorha-sidebar {
 background: #d6c9a9;
 border-right: 3px solid #16130f;
 padding: 1.5rem;
 display: flex;
 flex-direction: column;
 gap: 1.25rem;
 }
 .brand h1 {
 margin: 0.25rem 0;
 font-size: 1.6rem;
 }
 .brand-eyebrow {
 letter-spacing: 0.3em;
 text-transform: uppercase;
 font-size: 0.65rem;
 }
 .brand-version {
 font-size: 0.8rem;
 color: #4f463b;
 }
 .nav {
 display: flex;
 flex-direction: column;
 gap: 0.35rem;
 margin-top: 1rem;
 }
 .nav a {
 padding: 0.45rem 0.4rem;
 border: 1px solid #1d1912;
 text-decoration: none;
 color: inherit;
 background: #e3d6b5;
 }
 .nav a.selected,
 .nav a:hover {
 background: #1d1912;
 color: #f3e9ce;
 }
 .sidebar-footer {
 margin-top: auto;
 font-size: 0.75rem;
 }
 .link {
 color: inherit;
 text-decoration: underline;
 }
 .yorha-main {
 padding: 2rem;
 display: flex;
 flex-direction: column;
 gap: 1.5rem;
 }
 .panel {
 background: #f7f0dc;
 border: 2px solid #1d1912;
 padding: 1.25rem;
 box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.35);
 }
 .hero {
 display: flex;
 align-items: center;
 justify-content: space-between;
 gap: 1rem;
 }
 .eyebrow {
 text-transform: uppercase;
 letter-spacing: 0.25em;
 font-size: 0.75rem;
 }
 .hero-actions {
 display: flex;
 gap: 0.75rem;
 flex-wrap: wrap;
 }
 button.primary {
 background: #1d1912;
 color: #f5f5f5;
 border: 2px solid #1d1912;
 padding: 0.5rem 1.5rem;
 cursor: pointer;
 }
 a.secondary {
 border: 2px solid #1d1912;
 padding: 0.45rem 1rem;
 text-decoration: none;
 color: inherit;
 }
 .grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
 gap: 1.25rem;
 }
 .status-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
 gap: 0.75rem;
 }
 .status-card {
 border: 1px solid #1d1912;
 padding: 0.75rem;
 background: #fff8ea;
 display: flex;
 flex-direction: column;
 gap: 0.15rem;
 }
 .status-card strong {
 font-size: 1.4rem;
 }
 .feed header,
 .console header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 }
 .feed-list {
 display: flex;
 flex-direction: column;
 gap: 0.85rem;
 margin-top: 1rem;
 }
 .feed-list article {
 border: 1px solid #1d1912;
 padding: 0.75rem;
 background: #fffdf4;
 }
 .meta {
 font-size: 0.8rem;
 color: #4d4437;
 display: flex;
 gap: 1rem;
 }
 .tags {
 display: flex;
 gap: 0.4rem;
 margin-top: 0.6rem;
 }
 .pill {
 border: 1px solid #1d1912;
 padding: 0.15rem 0.5rem;
 font-size: 0.75rem;
 text-transform: uppercase;
 }
 .pill.high {
 background: #b91c1c;
 color: white;
 }
 .pill.medium {
 background: #d97706;
 color: white;
 }
 .pill.active {
 background: #15803d;
 color: white;
 }
 .pill.pending {
 background: #ca8a04;
 color: white;
 }
 .console ul {
 list-style: square;
 padding-left: 1.2rem;
 margin: 1rem 0;
 }
 .console-prompt {
 font-size: 0.9rem;
 color: #2d2a25;
 border-top: 1px dashed #1d1912;
 padding-top: 0.75rem;
 }
 .ghost {
 background: transparent;
 border: 1px solid #1d1912;
 padding: 0.35rem 0.8rem;
 cursor: pointer;
 }
 @media (max-width: 960px) {
 .yorha-shell {
 grid-template-columns: 1fr;
 }
 .yorha-sidebar {
 border-right: none;
 border-bottom: 3px solid #16130f;
 }
 .hero {
 flex-direction: column;
 align-items: flex-start;
 }
 }
</style>
