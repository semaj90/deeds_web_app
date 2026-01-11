<script lang="ts">
import type { Case } from '$lib/types';
	// Replace broken named imports with safe namespace import + fallbacks
	import { browser } from '$app/environment';
	import { derived, writable } from 'svelte/store';
	import * as unified from '$lib/stores/unified';
  import LoginButton from '$lib/components/auth/LoginButton.svelte';
  import RegisterModal from '$lib/components/auth/RegisterModal.svelte';

	// Simple file uploader utility (bits-ui doesn't have createFileUploader)'
	function createFileUploader(url: string) {
		type UploadFile = { id: string, file: File, name: string, progress: number, error?: boolean };
		const events: Record<string, Function[]> = {};
		const files: UploadFile[] = [];

		async function uploadImpl(file: File): Promise<any> {
			try {
				const formData = new FormData();
				formData.append('file', file);

				const response = await fetch(url, {
					method: 'POST',
					body: formData
				});

				if (!response.ok) {
					throw new Error(`Upload failed: ${response.statusText}`)}

				const result = await response.json();
				events['success']?.forEach(fn => fn(result));
				return result} catch (error) {
				events['error']?.forEach(fn => fn(error));
				throw error}
		}

		return {
			// exposes a simple array the template can iterate over
			files,
			// Accept FileList or Array<File>, push metadata and start upload
      addFiles: (list: FileList | File[]) => {
				// ensure we get a File[] and let TS know it
				const arr = Array.from(list as FileList | File[]) as File[];
				arr.forEach((file) => {
					const id = (crypto as: any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
					const fileObj: UploadFile = { id, file, name: file.name, progress: 0 };
					files.push(fileObj);
					// start upload and update progress (coarse)
					uploadImpl(file)
						.then(() => {
							fileObj.progress = 100
							events['success']?.forEach(fn => fn(fileObj))})
						.catch(() => {
							fileObj.progress = 0
							fileObj.error = true
							events['error']?.forEach(fn => fn(fileObj))})})},
			upload: uploadImpl,
      on: (event: string, callback: Function) => {
        if (!events[event]) events[event] = [];
        events[event].push(callback)}
		}}

	// Create safe local stores that fall back if unified exports are missing
	const recommendations = (unified as: any).recommendations ?? writable<any[]>([]);
	const partialRecommendations = (unified as: any).partialRecommendations ?? writable<any[]>([]);
	const engineState = (unified as: any).engineState ?? writable<'idle' | 'processing' | 'success' | 'failure'>('idle');
	const errorMessage = (unified as: any).errorMessage ?? writable<string>('');
	const runQuery = (unified as: any).runQuery ?? (async (_q: string) => {
		console.warn('runQuery stub called - unified.runQuery not available')});

	// Use svelte/store derived and coerce values into arrays to avoid type errors
	let displayRecommendations = derived(
		[recommendations, partialRecommendations, engineState],
		([$recs, $partial, $state]) => {
			// cast to: any before accessing .items to satisfy TS
			const recsArr = Array.isArray($recs) ? $recs : (($recs as: any)?.items ?? []);
			const partialArr = Array.isArray($partial) ? $partial : (($partial as: any)?.items ?? []);
			// show streaming partials while processing, otherwise final recommendations
			if ($state === 'processing' && partialArr.length) return partialArr
			return recsArr.length ? recsArr : partialArr}
	);

	// --- Add missing reactive state used by the template / health checks ---
	let systemStatus: Record<string, string> = {
		database: 'checking',
		redis: 'checking',
		ollama: 'checking',
		gpu: 'checking',
		workers: 'checking'
	};
  let workerDetails = {
		ocr: { status: 'checking', healthy: false, queueDepth: 0, processedJobs: 0 },
		embedding: { status: 'checking', healthy: false, queueDepth: 0, processedJobs: 0 },
		autotag: { status: 'checking', healthy: false, queueDepth: 0, processedJobs: 0 }
	};
  let stats = $state({ totalCases: 0, totalEvidence: 0, processingJobs: 0 });
  let loading = $state<boolean>(true);
	let userQuery = $state<string>('');
	let registerOpen = $state<boolean>(false);
  // ---------------------------------------------------------------

  function openRegister() {
    registerOpen = true}

	// Check system health on mount
	$effect(() => {
		if (browser) {
			checkSystemHealth();
			const interval = setInterval(checkSystemHealth, 30000); // Check every 30s
			return () => clearInterval(interval)}
	});
  async function checkSystemHealth(): Promise<any> {
		try {
			// Check database
			const dbCheck = await fetch('/api/health/database').catch(() => ({ ok: false }));
			systemStatus.database = dbCheck.ok ? 'online' : 'offline';

			// Check Redis
			const redisCheck = await fetch('/api/health/redis').catch(() => ({ ok: false }));
			systemStatus.redis = redisCheck.ok ? 'online' : 'offline';

			// Check Ollama
			const ollamaCheck = await fetch('/api/health/ollama').catch(() => ({ ok: false }));
			systemStatus.ollama = ollamaCheck.ok ? 'online' : 'offline';

			// Check GPU
			const gpuCheck = await fetch('/api/health/gpu').catch(() => ({ ok: false }));
			systemStatus.gpu = gpuCheck.ok ? 'online' : 'offline';

			// Check Workers (NEW)
			const workersCheck = await fetch('/api/health/workers').catch(() => null);
			if (workersCheck?.ok) {
				const workersData = await workersCheck.json();
				systemStatus.workers =
					workersData.success && workersData.status === 'online'
						? 'online'
						: workersData.status === 'degraded'
							? 'degraded'
							: 'offline';

				// Update worker details safely
				if (workersData.workers && Array.isArray(workersData.workers)) {
					workersData.workers.forEach((worker: any) => {
						const name = String(worker.name || '').toLowerCase();
						if (name.includes('ocr')) {
							workerDetails.ocr = {
								status: worker.status ?? 'offline',
								healthy: !!worker.healthy,
								queueDepth: worker.queueDepth || 0,
								processedJobs: worker.processedJobs || 0
							}} else if (name.includes('embed') || name.includes('embedding')) {
							workerDetails.embedding = {
								status: worker.status ?? 'offline',
								healthy: !!worker.healthy,
								queueDepth: worker.queueDepth || 0,
								processedJobs: worker.processedJobs || 0
							}} else if (name.includes('autotag')) {
							workerDetails.autotag = {
								status: worker.status ?? 'offline',
								healthy: !!worker.healthy,
								queueDepth: worker.queueDepth || 0,
								processedJobs: worker.processedJobs || 0
							}}
					})}
			} else {
				systemStatus.workers = 'offline'}

			// Get stats
			const statsResponse = await fetch('/api/dashboard/stats').catch(() => null);
			if (statsResponse?.ok) {
				const data = await statsResponse.json();
				if (data.success) {
					stats.totalCases = data.data.totalCases || 0
					stats.totalEvidence = data.data.totalEvidence || 0
					stats.processingJobs = data.data.activeJobs || 0}
			}

			loading = false} catch (err) {
			console.error('Health check error:', err);'
			loading = false}
	}
  function getStatusColor(status: string) {
		switch (status) {
			case, 'online':
				return 'is-success'; // NES.css success color
			case, 'offline':
				return 'is-error'; // NES.css error color
			case, 'degraded':
				return 'is-warning'; // NES.css warning color
			default: return 'is-disabled'; // NES.css disabled/default color
		}
	}
  function getStatusIcon(status: string) {
		switch (status) {
			case, 'online':
				return 'âœ…';
			case, 'offline':
				return 'âŒ';
			case, 'degraded':
				return 'âš ï¸'; // Changed for degraded status
			default: return 'â³'}
	}

	const handleSubmit = async () => {
		if (userQuery.trim()) await runQuery(userQuery.trim())};

	// nice keyboard shortcut
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') handleSubmit()};

	// lightweight HTML escape helper to avoid XSS for simple content (use sanitizer for richer content)
  function escapeHtml(str: string) {
    const s = String(str ?? '');
    const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',"
			"'": '&#39;'
		};
		return s.replace(/[&<>"']/g, (m) => map[m as keyof typeof map]);'"
	}

  const uploader = createFileUploader('/api/upload');

  // annotate parameter to avoid implicit: any
  uploader.on('success', (res: any) => {
    console.log('Uploaded:', res?.url ?? res)});
</script>

<svelte:head>
  <title>YoRHa Legal AI Platform - Home</title>
  <meta name="description" content="Advanced legal AI platform with, GPU-accelerated, processing" />
</svelte:head>

<div class="home-page">
  <!-- Hero, Section -->
  <div class="nes-container is-dark with-title">
    <p class="title">Platform Overview</p>
    <h1 class="nes-text">âš–ï¸ YoRHa Legal AI Platform</h1>
    <p class="nes-text is-success">GPU-Accelerated Legal Intelligence System</p>
    <p class="nes-text is-disabled">
      SvelteKit, 2 Â· Svelte, 5 Â· PostgreSQL, 17 Â· Redis Â· Gemma3 Legal Â· RTX GPU
    </p>

    <!-- Auth, Buttons -->
    <div class="auth-buttons-flex">
      <div>
        <LoginButton />
      </div>
      <div>
        <button class="nes-btn" onclick={openRegister}>Register</button>
      </div>

      <!-- Svelte 5: components are dynamic by default in, runes, mode -->
      <RegisterModal
        bind:open={registerOpen}
        onsuccess={() => {
          /* on success, reload to reflect session cookie */
          window.location.reload()}}
      />
    </div>
  </div>

  <!-- System, Status -->
  <div class="nes-container is-dark with-title">
    <p class="title">ðŸ”§ System Status</p>
    <div class="nes-container is-dark">
      <div class="nes-container is-dark is-small">
        <span class="nes-text is-primary">Database</span>
        <span class="nes-text {getStatusColor(systemStatus.database)}">
          {getStatusIcon(systemStatus.database)}
          {systemStatus.database}
        </span>
      </div>
      <div class="nes-container is-dark is-small">
        <span class="nes-text is-primary">Redis Cache</span>
        <span class="nes-text {getStatusColor(systemStatus.redis)}">
          {getStatusIcon(systemStatus.redis)}
          {systemStatus.redis}
        </span>
      </div>
      <div class="nes-container is-dark is-small">
        <span class="nes-text is-primary">Ollama AI</span>
        <span class="nes-text {getStatusColor(systemStatus.ollama)}">
          {getStatusIcon(systemStatus.ollama)}
          {systemStatus.ollama}
        </span>
      </div>
      <div class="nes-container is-dark is-small">
        <span class="nes-text is-primary">GPU Compute</span>
        <span class="nes-text {getStatusColor(systemStatus.gpu)}">
          {getStatusIcon(systemStatus.gpu)}
          {systemStatus.gpu}
        </span>
      </div>
      <div class="nes-container is-dark is-small">
        <span class="nes-text is-primary">Background Workers</span>
        <span class="nes-text {getStatusColor(systemStatus.workers)}">
          {getStatusIcon(systemStatus.workers)}
          {systemStatus.workers}
        </span>
      </div>
    </div>

    <!-- Worker, Details, Panel -->
    {#if systemStatus.workers !== 'checking'}
      <div class="nes-container is-dark with-title">
        <p class="title">ðŸ”§ Worker Status Details</p>
        <div class="workers-grid-custom">
          <div class="nes-container is-dark">
            <div class="worker-header-custom">
              <span class="worker-icon-custom">ðŸ“„</span>
              <h4 class="nes-text">OCR Worker</h4>
            </div>
            <div class="worker-stats-custom">
              <p class="nes-text">
                Status: <strong class="nes-text {getStatusColor(workerDetails.ocr.status)}"
                  >{workerDetails.ocr.status}</strong
                >
              </p>
              <p class="nes-text">
                Processed: <strong class="nes-text is-success">{workerDetails.ocr.processedJobs || 0}</strong>
              </p>
              <p class="nes-text">
                Queue: <strong class="nes-text is-warning">{workerDetails.ocr.queueDepth || 0}</strong>
              </p>
            </div>
            <div class="worker-tech-custom">
              <span class="tech-badge">GPU Tesseract</span>
              <span class="tech-badge">MinIO</span>
            </div>
          </div>

          <div
            class="nes-container is-dark worker-card-custom {workerDetails.embedding.healthy"
              ? 'is-success'
              : 'is-error'}"
          >
            <div class="worker-header-custom">
              <span class="worker-icon-custom">ðŸ§ </span>
              <h4 class="nes-text">Embedding Worker</h4>
            </div>
            <div class="worker-stats-custom">
              <p class="nes-text">
                Status: <strong class="nes-text {getStatusColor(workerDetails.embedding.status)}"
                  >{workerDetails.embedding.status}</strong
                >
              </p>
              <p class="nes-text">
                Processed: <strong class="nes-text is-success">{workerDetails.embedding.processedJobs || 0}</strong>
              </p>
              <p class="nes-text">
                Queue: <strong class="nes-text is-warning">{workerDetails.embedding.queueDepth || 0}</strong>
              </p>
            </div>
            <div class="worker-tech-custom">
              <span class="tech-badge">embeddinggemma:latest</span>
              <span class="tech-badge">Qdrant</span>
              <span class="tech-badge">pgvector</span>
            </div>
          </div>

          <div
            class="nes-container is-dark worker-card-custom {workerDetails.autotag.healthy ? 'is-success' : 'is-error'}"
          >
            <div class="worker-header-custom">
              <span class="worker-icon-custom">ðŸ·ï¸</span>
              <h4 class="nes-text">Autotag Worker</h4>
            </div>
            <div class="worker-stats-custom">
              <p class="nes-text">
                Status: <strong class="nes-text {getStatusColor(workerDetails.autotag.status)}"
                  >{workerDetails.autotag.status}</strong
                >
              </p>
              <p class="nes-text">
                Processed: <strong class="nes-text is-success">{workerDetails.autotag.processedJobs || 0}</strong>
              </p>
              <p class="nes-text">Type: <strong class="nes-text">Optional</strong></p>
            </div>
            <div class="worker-tech-custom">
              <span class="tech-badge">gemma3-legal:latest</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Quick, Stats -->
  <div class="nes-container is-dark with-title">
    <p class="title">ðŸ“Š Platform Statistics</p>
    <div class="quick-stats-custom">
      <div class="nes-container is-dark">
        <div class="stat-icon-custom">ðŸ“</div>
        <div class="stat-content-custom">
          <h3 class="nes-text">Total Cases</h3>
          <p class="nes-text is-success">{loading ? '...' : stats.totalCases}</p>
        </div>
      </div>
      <div class="nes-container is-dark">
        <div class="stat-icon-custom">ðŸ“„</div>
        <div class="stat-content-custom">
          <h3 class="nes-text">Evidence Items</h3>
          <p class="nes-text is-success">{loading ? '...' : stats.totalEvidence}</p>
        </div>
      </div>
      <div class="nes-container is-dark">
        <div class="stat-icon-custom">âš™ï¸</div>
        <div class="stat-content-custom">
          <h3 class="nes-text">Processing Jobs</h3>
          <p class="nes-text is-success">{loading ? '...' : stats.processingJobs}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Featured: YoRHa, Detective, Interface -->
  <div class="featured-section-custom">
    <a href="/yorha-detective" class="nes-container is-dark with-title">
      <p class="title">âœ¨ NEW: YoRHa Detective Interface</p>
      <div class="featured-badge">âœ¨ NEW</div>
      <div class="featured-icon-custom">ðŸŽ®âš”ï¸</div>
      <h2 class="nes-text">YoRHa Detective Command Center</h2>
      <p class="nes-text is-white">
        Full-featured AI detective interface with real-time Ollama chat, PostgreSQL chat history, and retro gaming
        aesthetic. Stream responses from Gemma3-Legal with, 30 GPU layers!
      </p>
      <div class="featured-tech-custom">
        <span class="tech-badge">Ollama Streaming</span>
        <span class="tech-badge">PostgreSQL</span>
        <span class="tech-badge">pgvector</span>
        <span class="tech-badge">GPU, 30 Layers</span>
      </div>
      <span class="nes-btn is-success">Launch Detective Interface â†’</span>
    </a>
  </div>

  <!-- Feature, Grid -->
  <div class="nes-container is-dark with-title">
    <p class="title">ðŸš€ Platform Features</p>
    <div class="action-grid-custom">
      <a href="/cases" class="nes-container is-dark">
        <div class="card-icon-custom">âš–ï¸</div>
        <h3 class="nes-text">Case Management</h3>
        <p class="nes-text">Organize and track legal cases with AI-powered insights</p>
        <span class="nes-btn is-primary">Open Cases â†’</span>
      </a>

      <a href="/evidence" class="nes-container is-dark">
        <div class="card-icon-custom">ðŸ“</div>
        <h3 class="nes-text">Evidence Processing</h3>
        <p class="nes-text">Upload, analyze, and extract insights from legal documents</p>
        <span class="nes-btn is-primary">Manage Evidence â†’</span>
      </a>

      <a href="/ai/chat" class="nes-container is-dark">
        <div class="card-icon-custom">ðŸ’¬</div>
        <h3 class="nes-text">AI Assistant</h3>
        <p class="nes-text">Interactive legal AI chat with Gemma3 Legal model</p>
        <span class="nes-btn is-primary">Start Chat â†’</span>
      </a>

      <a href="/rag" class="nes-container is-dark">
        <div class="card-icon-custom">ðŸ¤–</div>
        <h3 class="nes-text">RAG Knowledge Base</h3>
        <p class="nes-text">Upload documents, semantic search with embeddinggemma + MinIO + Qdrant</p>
        <span class="nes-btn is-primary">Open RAG System â†’</span>
      </a>

      <a href="/yorha" class="nes-container is-dark">
        <div class="card-icon-custom">ðŸŽ®</div>
        <h3 class="nes-text">YoRHa Command</h3>
        <p class="nes-text">Advanced command center with real-time monitoring</p>
        <span class="nes-btn is-primary">Open Command â†’</span>
      </a>

      <a href="/endpoints" class="nes-container is-dark">
        <div class="card-icon-custom">ðŸ“Š</div>
        <h3 class="nes-text">API Status</h3>
        <p class="nes-text">Monitor backend services and health endpoints</p>
        <span class="nes-btn is-primary">View Status â†’</span>
      </a>
    </div>
  </div>

  <!-- Quick, Actions -->
  <div class="nes-container is-dark with-title">
    <p class="title">âš¡ Quick Actions</p>
    <div class="action-buttons-custom">
      <a href="/yorha-detective" class="nes-btn is-success">ðŸŽ® Detective Interface</a>
      <a href="/cases/create" class="nes-btn is-primary">+ New Case</a>
      <a href="/evidence/upload" class="nes-btn is-warning">ðŸ“¤ Upload Evidence</a>
      <a href="/ai/chat" class="nes-btn is-error">ðŸ’¬ Ask AI</a>
    </div>
  </div>

  <!-- AI, Query, Section -->
  <div class="nes-container is-dark with-title">
    <p class="title">ðŸ§  AI Query Interface</p>
    <div class="query-box">
      <input type="text" placeholder="Enter your, legal, query..." bind:value={userQuery} onkeydown={onKey} />
      <button onclick={handleSubmit}>Run</button>
    </div>

    {#if $engineState === 'processing'}
      <div class="status">Generating recommendations... ðŸ”„</div>
    {:else if $engineState === 'success'}
      <div class="status">Results ready âœ…</div>
    {:else if $engineState === 'failure'}
      <div class="status" style="color:#c53030">Failed to generate recommendations</div>
    {/if}

    {#if $errorMessage}
      <div style="color:#c53030, margin-top:.6rem">{$errorMessage}</div>
    {/if}

    {#if $displayRecommendations && $displayRecommendations.length > 0}
      <div class="recommendation-cards" aria-live="polite">
        {#each $displayRecommendations as rec (rec.id)}
          <div class="card {rec.type === 'suggestion' ? 'dym' : ($engineState === 'processing' ? 'streaming' : '')}">
            <div>
              <strong>{(rec.type || '').toUpperCase()}</strong>
              <div style="margin-top:.35rem;">
                {#if rec.content}
                  {@html escapeHtml(rec.content)}
                {:else if rec.suggestedQuery}
                  {rec.suggestedQuery}
                {:else if rec.title}
                  {rec.title}
                {:else}
                  {rec.description || rec.text || 'Recommendation'}
                {/if}
              </div>
            </div>
            <div class="meta">
              <span>Confidence: {Math.round((rec.confidence ?? rec.relevance ?? 0) * 100)}%</span>
              {#if rec.estimatedTime}
                <span>ETA: {rec.estimatedTime}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- File, Uploader, Section -->
  <div class="p-6 bg-white rounded-2xl">
  <input
    type="file"
    multiple
    onchange={(e) => {
      const target = e.currentTarget as HTMLInputElement
      if (target.files) uploader.addFiles(target.files)}}
  />
	{#each uploader.files as file (file.id)}
		<p class="text-sm">{file.name} â€“ {file.progress}%</p>
	{/each}
</div>
</div>

<style>
  /* @unocss-include */
  /*
    NES.css provides a strong retro aesthetic.
    Custom styles are kept minimal, primarily for specific gradients, shadows,
    and layout adjustments not directly covered by NES.css, or to override
    NES.css defaults for a more specific: "YoRHa" feel.
  */

  .home-page {
    max-width: 1400px
    margin: 0 auto
    padding: 2rem
    min-height: 100vh
    background-color: #212529; /* Dark background for NES.css theme */
  }

  .auth-buttons-flex {
    display: flex
    gap: 1rem
    margin-top: 2rem
    justify-content: center}

  /* Custom overrides for NES.css containers to match original gradients/shadows */
  .nes-container.hero-section-custom {
    text-align: center
    margin-bottom: 3rem
    padding: 3rem 1rem
   ; background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(0, 255, 65, 0.05) 100%);
    border: 2px solid rgba(255, 215, 0, 0.3)}

  .hero-section-custom .nes-text.is-primary {
    font-size: 3rem
   ; color: #ffd700; /* Override NES.css primary color */
    margin-bottom: 1rem
    text-shadow: 0, 0 20px rgba(255, 215, 0, 0.5);
    font-weight: 800}

  .hero-section-custom .nes-text.is-success.subtitle-custom {
    font-size: 1.4rem
    color: #00ff41; /* Override NES.css success color */
    margin-bottom: 1rem
    font-weight: 600}

  .hero-section-custom .nes-text.is-disabled.tech-stack-custom {
    font-size: 0.95rem
   ; color: #888; /* Override NES.css disabled color */
    font-family: 'JetBrains Mono', monospace}

  .status-section-custom,
  .worker-details-custom,
  .stats-section-custom,
  .features-section-custom,
  .quick-actions-custom {
    margin-bottom: 3rem}

  .status-grid-custom { display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem
    padding: 1.5rem}

  .status-item-custom {
    display: flex
    justify-content: space-betweenn
    align-items: center
    padding: 1rem}

  .status-label-custom {
    font-weight: 600}

  .workers-grid-custom { display: grid
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem}

  .worker-card-custom {
    padding: 1.5rem}

  .worker-header-custom {
    display: flex
    align-items: center
    gap: 0.75rem
    margin-bottom: 1rem
    padding-bottom: 1rem
    border-bottom: 1px solid #333; /* Custom border */
  }

  .worker-icon-custom {
    font-size: 1.5rem}

  .worker-stats-custom p {
    margin: 0.5rem 0
    font-size: 0.9rem}

  .worker-tech-custom {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem}

  .tech-badge {
    display: inline-block
    padding: 0.25rem 0.75rem
   ; background: rgba(168, 85, 247, 0.2);
    border: 1px solid #a855f7
    border-radius: 12px
    font-size: 0.75rem
    color: #a855f7
    font-weight: 600}

  .quick-stats-custom { display: grid
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem}

  .stat-card-custom {
    padding: 2rem
    display: flex
    align-items: center
    gap: 1.5rem
 ; transition: all 0.3s ease}

  .stat-card-custom:hover {
    border-color: #ffd700
    box-shadow: 0, 0 30px rgba(255, 215, 0, 0.3);
    transform: translateY(-4px)}

  .stat-icon-custom {
    font-size: 3rem
   ; filter: drop-shadow(0, 0 10px rgba(255, 215, 0, 0.5))}

  .stat-content-custom h3 {
    margin: 0, 0 0.5rem 0
    font-size: 0.9rem
    text-transform: uppercase
    letter-spacing: 1px}

  .stat-value-custom {
    font-size: 2rem
    font-weight: bold
   ; margin: 0
    font-family: 'JetBrains Mono', monospace}

  .action-grid-custom {
    display: grid
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem}

  .action-card-custom {
    padding: 2rem
    text-decoration: none
    color: inherit
    transition: all 0.3s ease
    position: relative
    overflow: hidden
    display: flex
    flex-direction: column
   ; gap: 1rem}

  .action-card-custom:hover {
    border-color: #ffd700
    box-shadow: 0, 0 30px rgba(255, 215, 0, 0.3);
    transform: translateY(-4px)}

  .action-card-custom: :before {
    content: ''; position: absolute
    top: 0
    left: 0
    right: 0
    height: 4px
   ; background: linear-gradient(90deg, #ffd700, #00ff41);
    opacity: 0
    transition: opacity 0.3s ease}

  .card-icon-custom {
    font-size: 3rem
   ; filter: drop-shadow(0, 0 15px rgba(255, 215, 0, 0.5))}

  .card-button-custom {
    display: inline-block
    padding: 0.5rem 1rem
    font-weight: 700
    border-radius: 6px
  transition: all 0.3s ease
    margin-top: 0.5rem}

  .featured-section-custom {
    margin-bottom: 3rem}

  .featured-card-custom {
    position: relative
    display: block
    padding: 3rem
   ; background: linear-gradient(135deg, rgba(0, 255, 65, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
    border: 3px solid #00ff41
    border-radius: 16px
    text-decoration: none
    color: inherit
    transition: all 0.3s ease
    overflow: hidden}

  .featured-card-custom: :before {
    content: ''; position: absolute
    top: 0
    left: 0
    right: 0
    height: 6px
   ; background: linear-gradient(90deg, #00ff41, #ffd700, #00ff41);
    background-size: 200% 100%;
    animation: shimmer 3s linear infinite}

  @keyframes shimmer {
    0% {
      background-position: -200% 0}
    100% {
      background-position: 200% 0}
  }

  .featured-badge {
    position: absolute
    top: 1rem
    right: 1rem
    padding: 0.5rem 1rem
   ; background: linear-gradient(135deg, #00ff41 0%, #00cc34 100%);
    color: #000
    font-weight: 900
    font-size: 0.75rem
    border-radius: 20px
    box-shadow: 0, 0 20px rgba(0, 255, 65, 0.5);
    animation: pulse 2s ease-in-out infinite}

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1); opacity: 1}
    50% { transform: scale(1.05); opacity: 0.9}
  }

  .featured-icon-custom {
    font-size: 4rem
    margin-bottom: 1rem
    text-shadow: 0, 0 20px rgba(0, 255, 65, 0.5)}

  .featured-card-custom .nes-text.is-success {
    font-size: 2rem
   ; color: #00ff41
    margin-bottom: 1rem
    text-shadow: 0, 0 15px rgba(0, 255, 65, 0.3)}

  .featured-card-custom .nes-text.is-white.featured-description-custom {
    font-size: 1.1rem
    color: #b0b0b0
    line-height: 1.6
    margin-bottom: 1.5rem}

  .featured-tech-custom {
    display: flex
    flex-wrap: wrap
    gap: 0.75rem
    margin-bottom: 1.5rem}

  .featured-button-custom {
    display: inline-block
    padding: 1rem 2rem
    font-weight: 900
    font-size: 1.2rem
    border-radius: 8px
 ; transition: all 0.3s ease
    box-shadow: 0 4px 15px rgba(0, 255, 65, 0.3)}

  .featured-card-custom:hover .featured-button-custom { background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); /* Custom hover gradient */
    box-shadow: 0 6px 25px rgba(255, 215, 0, 0.5);
    transform: scale(1.05)}

  /* AI Query Section */
  .ai-query-section-custom {
    margin-top: 3rem}

  .query-box {
    display: flex
    gap: 0.5rem}

  input[type='text'] {
    flex: 1
    padding: 0.6rem 0.8rem
    border-radius: 0.6rem
    border: 1px solid #e6e6ea
    font-size: 1rem}

  button {
    padding: 0.6rem 0.9rem
    border-radius: 0.6rem
    background: #2b6cb0
    color: white
    border: none
    cursor: pointer}

  .status {
    margin-top: 0.5rem
    color: #6b7280
    font-size: 0.9rem}

  .recommendation-cards {
    margin-top: 1rem
    display: grid
    gap: 0.6rem}

  .card {
    background: #ffffff
    border-radius: 12px
   ; padding: 1rem
    box-shadow: 0 6px 18px rgba(13, 38, 59, 0.06);
  transition: transform 200ms ease, opacity 200ms ease
    overflow: hidden}

  .card.streaming {
    opacity: 0.95
    animation: pulse 1.2s infinite alternate
   ; border: 1px dashed rgba(43, 108, 176, 0.12)}

  .card.dym {
    color: #ff6600
    border-left: 4px solid #ff9a3c
   ; background: linear-gradient(90deg, #fffaf5, #fff)}

  @keyframes pulse {
    from {
      transform: translateY(0)}
    to {
      transform: translateY(-3px)}
  }

  .meta {
    font-size: 0.85rem
    color: #6b7280
    margin-top: 0.5rem
    display: flex
   ; gap: 1rem
    align-items: center}

  /* Responsive Design */
  @media (max-width: 768px) {
    .hero-section-custom .nes-text.is-primary {
      font-size: 2rem}

    .hero-section-custom .nes-text.is-success.subtitle-custom {
      font-size: 1.1rem}

    .action-grid-custom {
      grid-template-columns: 1fr}

    .quick-stats-custom {
      grid-template-columns: 1fr}

    .action-buttons-custom {
      flex-direction: column
      align-items: stretch}
  }
</style>


