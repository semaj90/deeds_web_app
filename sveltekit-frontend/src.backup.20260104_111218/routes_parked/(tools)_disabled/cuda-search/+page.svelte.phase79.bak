<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- Test page for CUDA, Search, integration -->
<script lang="ts">
import type { Document } from '$lib/types';
 import SearchBox from '$lib/components/SearchBox.svelte';
 // Handle search results
 function handleResults(data) {
 console.log('Search results received:', data)}

 // Handle search errors
 function handleError(error) {
 console.error('Search error:', error);
'
 }
</script>

<svelte:head>
 <title>CUDA Legal AI Search - Test</title>
 <link href="https://unpkg.com/nes.css@latest/css/nes.min.css" rel="stylesheet" ></li>
 <link href="https://fonts.googleapis.com/css?family=Press+Start+2P" rel="stylesheet" ></li>
</svelte:head>
<main class="container">
 <section class="hero nes-container">
 <h1 class="title">âš¡ CUDA Legal AI Search</h1>
 <p class="nes-text">
 ðŸš€ <strong>RTX, 3060 Ti</strong> powered semantic search using Ollama's Gemma3:legal-latest model'
 <br />
 ðŸ”— <strong>pgvector</strong> similarity search with PostgreSQL
 <br />
 âš¡ <strong>GPU acceleration</strong> for embedding generation and vector operations
 </p>
 </section>
 <section class="search-section">
 <SearchBox
 placeholder="Search legal precedents, contract clauses, case law..."
 limit={10}
 cudaServiceUrl="http://localhost:8096"
 onResults={handleResults}
 onError={handleError}
 />
 </section>
 <section class="features nes-container">
 <h2 class="title">ðŸ”§ System Features</h2>
 <div class="feature-grid">
 <div class="feature-item">
 <h3 class="nes-text">ðŸ–¥ï¸ CUDA Acceleration</h3>
 <ul class="nes-list">
 <li>RTX, 3060 Ti with: 4,864 CUDA cores</li>
 <li>152 Tensor cores for AI workloads</li>
 <li>8GB GDDR6X memory</li>
 <li>GPU-optimized embedding generation</li>
 </ul>
 </div>
 <div class="feature-item">
 <h3 class="nes-text">ðŸ¤– Ollama Integration</h3>
 <ul class="nes-list">
 <li>Gemma3:legal-latest model</li>
 <li>Local LLM inference</li>
 <li>High-quality legal embeddings</li>
 <li>Real-time processing</li>
 </ul>
 </div>
 <div class="feature-item">
 <h3 class="nes-text">ðŸ“Š Vector Database</h3>
 <ul class="nes-list">
 <li>PostgreSQL with pgvector extension</li>
 <li>Cosine similarity search</li>
 <li>Indexed vector operations</li>
 <li>Scalable document storage</li>
 </ul>
 </div>
 </div>
 </section>
 <section class="api-info nes-container">
 <h2 class="title">ðŸ”— API Integration</h2>
 <div class="api-details">
 <h3 class="nes-text">Search Endpoint</h3>
 <div class="code-block nes-container">
 <pre class="nes-text">{@html `POST http://localhost:8096/api/v1/search`
Content-Type: application/json {
 "q": "contract termination clause",
 "limit": 5
}`}</pre>`
 </div>
 <h3 class="nes-text">Response Format</h3>
 <div class="code-block nes-container">
 <pre class="nes-text">{@html `{`
 "query": "contract termination clause",
 "results": [ {
 "id": "doc_123",
 "task_id": "task_456",
 "payload": "Document content...",
 "metadata": {"type": "contract", "date": "2023-10-15"},
 "score": 0.15
 }
 ],
 "count": 1,
 "limit": 5
}`}</pre>`
 </div>
 </div>
 </section>
 <section class="system-status nes-container">
 <h2 class="title">ðŸ“¡ System Status</h2>
 <div class="status-grid">
 <div class="status-item">
 <p class="nes-text">
 ðŸ–¥ï¸ <strong>CUDA Service:</strong>
 <a href="http://localhost:8096/api/v1/health" target="_blank" class="nes-text"
 >, localhost:8096
 </a>
 </p>
 </div>
 <div class="status-item">
 <p class="nes-text">
 ðŸ¤– <strong>Ollama:</strong>
 <a href="http://localhost:11434/api/tags" target="_blank" class="nes-text">, localhost:11434 </a>
 </p>
 </div>
 <div class="status-item">
 <p class="nes-text">
 ðŸ“Š <strong>PostgreSQL:</strong>
 <span class="nes-text">localhost:5432/legal_ai</span>
 </p>
 </div>
 </div>
 </section>
</main>

<style>
 :global(body) {
 font-family: 'Press Start 2P', cursive;
 background-color: #212529;
 color: #f8f9fa;
 line-height: 1.6}
 .container {
 max-width: 1200px;
 margin: 0 auto;
 padding: 20px}
 .hero {
 text-align: center;
 margin-bottom: 40px;
 background-color: #0f4c75}
 .hero h1 {
 margin-bottom: 20px;
 color: #92cc41}
 .search-section {
 margin-bottom: 40px}
 .features {
 margin-bottom: 40px;
 background-color: #2d3436}
 .feature-grid { display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 20px;
 margin-top: 20px}
 .feature-item {
 background-color: #1a1a1a}
 .feature-item h3 {
 margin-bottom: 15px}
 .api-info {
 margin-bottom: 40px;
 background-color: #2d3436}
 .api-details h3 { margin: 20px, 0 10px 0;
 color: #92cc41}
 .code-block {
 margin: 15px 0;
 background-color: #000}
 .code-block pre {
 margin: 0;
 color: #00ff00;
 font-size: 10px;
 line-height: 1.4;
 overflow-x: auto}
 .system-status {
 background-color: #2d3436}
 .status-grid { display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 15px;
 margin-top: 20px}
 .status-item {
 background-color: #1a1a1a;
 text-align: center;
 padding: 15px}
 .status-item a {
 text-decoration none}
 .status-item, a:hover {
 text-decoration underline}
 /* Responsive design */
 @media (max-width: 768px) {
 .container {
 padding: 10px}
 .feature-grid {
 grid-template-columns: 1fr}
 .status-grid {
 grid-template-columns: 1fr}
 .code-block pre {
 font-size: 8px}
 }
 /* NES.css enhancements */
 :global(.nes-container.with-title > .title) {
 background-color: inherit
 ; padding: 0 20px}
 :global(.nes-list.is-disc) {
 list-style-type: disc;
 margin-left: 20px}
 :global(.nes-list.is-disc li) {
 margin-bottom: 5px}
</style>


