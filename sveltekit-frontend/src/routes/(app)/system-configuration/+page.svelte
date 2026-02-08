<script lang="ts">
 // Migrated to $effect

 let activeTab = $state<'general' | 'ai' | 'database' | 'gpu' | 'security'>('general');

 // Configuration settings
 let config = $state({ general: { theme: 'yorha',
   language: 'en',
   timezone: 'UTC',
   autoSave: true,
   notifications: true
  },
	ai: {
   model: 'gemma3-legal',
   temperature: 0.7,
   maxTokens: 2048,
   ollamaEndpoint: 'http://localhost:11434',
   embeddingModel: 'embeddinggemma',
   enableFallback: true
  },
	database: {
   type: 'postgresql',
   host: 'localhost',
   port: 5432,
   database: 'legal_ai_db',
   ssl: false,
   connectionPool: 10
  },
	gpu: {
   enableWebGPU: true,
   enableCUDA: true,
   memoryLimit: 80,
   batchSize: 32,
   precision: 'fp16'
  },
	security: {
  , encryption: 'AES256',
   sessionTimeout: 3600,
   twoFactor: false,
   auditLogging: true,
   backupFrequency: 'daily'
  }
 });

 let systemInfo = $state({
  version: '2.0.0',
  uptime: '0d 0h 0m',
  memory: { used: 0, total: 0, percentage: 0 },
	disk: { used: 0, total: 0, percentage: 0 },
	cpu: { usage: 0, cores: 0 }
 });

 let webgpuCapabilities = $state({ hasWebGPU: false });

 $effect(() => {
  (async () => {

  // Simulate system info updates
  const updateInfo = () => {
   systemInfo.uptime = '2d 14h 32m';
   systemInfo.memory = { used: 8192, total: 16384, percentage: 50 };
   systemInfo.disk = { used: 256, total: 512, percentage: 50 };
   systemInfo.cpu = { usage: 45, cores: 8 };
  };

  updateInfo();
  const interval = setInterval(updateInfo, 5000);

  // Check WebGPU
  if (navigator.gpu) {
   webgpuCapabilities.hasWebGPU = true;
  }

  return () => clearInterval(interval);
 
  })();
});

 function saveConfig() {
  console.log('Saving configuration...', config);
  // Implementation for saving config
 }
</script>

<div class="config-container">
 <header class="config-header">
  <div class="header-content">
   <h1>SYSTEM_CONFIGURATION</h1>
   <div class="status-badge">ONLINE</div>
  </div>
  <p class="subtitle">System parameters and environment variables</p>
 </header>

 <div class="dashboard-grid">
  <!-- Sidebar Navigation -->
  <nav class="config-sidebar">
   <button
    class="nav-item {activeTab === 'general' ? 'active' : ''}"
    onclick={() => activeTab = 'general'}
   >
    <span class="icon">⚙️</span>
    GENERAL
   </button>

   <button
    class="nav-item {activeTab === 'ai' ? 'active' : ''}"
    onclick={() => activeTab = 'ai'}
   >
    <span class="icon">🧠</span>
    AI_ENGINE
   </button>

   <button
    class="nav-item {activeTab === 'database' ? 'active' : ''}"
    onclick={() => activeTab = 'database'}
   >
    <span class="icon">💾</span>
    DATABASE
   </button>

   <button
    class="nav-item {activeTab === 'gpu' ? 'active' : ''}"
    onclick={() => activeTab = 'gpu'}
   >
    <span class="icon">⚡</span>
    GPU_ACCEL
   </button>

   <button
    class="nav-item {activeTab === 'security' ? 'active' : ''}"
    onclick={() => activeTab = 'security'}
   >
    <span class="icon">🛡️</span>
    SECURITY
   </button>
  </nav>

  <!-- Main Content Area -->
  <main class="config-content">
   {#if activeTab === 'general'}
    <section class="config-section">
     <h2>GENERAL_SETTINGS</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="theme">Theme System</label>
       <select id="theme" bind:value={config.general.theme}>
        <option value="yorha">YoRHa (Dark)</option>
        <option value="light">Resistance (Light)</option>
        <option value="high-contrast">Machine (High Contrast)</option>
       </select>
      </div>

      <div class="form-group">
       <label for="language">System Language</label>
       <select id="language" bind:value={config.general.language}>
        <option value="en">English (US)</option>
        <option value="ja">Japanese</option>
        <option value="es">Spanish</option>
       </select>
      </div>

      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.general.autoSave}>
        Enable Auto-Save
       </label>
      </div>
     </div>
    </section>
   {/if}

   {#if activeTab === 'ai'}
    <section class="config-section">
     <h2>AI_MODEL_CONFIGURATION</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="model">Primary Model</label>
       <select id="model" bind:value={config.ai.model}>
        <option value="gemma3-legal">Gemma 3 Legal (Fine-tuned)</option>
        <option value="gpt-4o">GPT-4o (OpenAI)</option>
        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
       </select>
      </div>

      <div class="form-group">
       <label for="temp">Temperature ({config.ai.temperature})</label>
       <input
        type="range"
        id="temp"
        min="0"
        max="1"
        step="0.1"
        bind:value={config.ai.temperature}
       >
      </div>

      <div class="form-group">
       <label for="endpoint">Ollama Endpoint</label>
       <input type="text" id="endpoint" bind:value={config.ai.ollamaEndpoint}>
      </div>
     </div>
    </section>
   {/if}

   {#if activeTab === 'gpu'}
    <section class="config-section">
     <h2>GPU_ACCELERATION</h2>

     <div class="status-card {webgpuCapabilities.hasWebGPU ? 'success' : 'warning'}">
      <h3>WebGPU Status</h3>
      <p>{webgpuCapabilities.hasWebGPU ? 'Hardware Acceleration Available' : 'Not Detected / Unsupported'}</p>
     </div>

     <div class="form-grid">
      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.gpu.enableCUDA}>
        Enable CUDA via Python Bridge
       </label>
      </div>
     </div>
    </section>
   {/if}

   <!-- Save Actions -->
   <div class="action-bar">
    <button class="btn-secondary">RESET</button>
    <button class="btn-primary" onclick={saveConfig}>APPLY CHANGES</button>
   </div>
  </main>

  <!-- System Status Sidebar -->
  <aside class="system-status">
   <h3>SYSTEM_METRICS</h3>

   <div class="metric-card">
    <div class="metric-header">
     <span>CPU LOAD</span>
     <span>{systemInfo.cpu.usage}%</span>
    </div>
    <div class="progress-bar">
     <div class="fill" style="width: {systemInfo.cpu.usage}%"></div>
    </div>
   </div>

   <div class="metric-card">
    <div class="metric-header">
     <span>MEMORY</span>
     <span>{systemInfo.memory.percentage}%</span>
    </div>
    <div class="progress-bar">
     <div class="fill" style="width: {systemInfo.memory.percentage}%"></div>
    </div>
    <small>{(systemInfo.memory.used / 1024).toFixed(1)}GB / {(systemInfo.memory.total / 1024).toFixed(1)}GB</small>
   </div>

   <div class="metric-card">
    <div class="metric-header">
     <span>UPTIME</span>
    </div>
    <div class="value">{systemInfo.uptime}</div>
   </div>
  </aside>
 </div>
</div>

<style>
 :global(body) {
  background-color: #0f172a;
  color: #f8fafc;
  font-family: 'Inter', system-ui, sans-serif;
 }

 .config-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2rem;
 }

 .config-header h1 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 2rem;
  margin: 0;
  color: #e2e8f0;
  letter-spacing: -0.05em;
 }

 .status-badge { background: #059669; color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  font-family: 'JetBrains Mono', monospace;
 }

 .dashboard-grid {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  gap: 2rem;
  flex: 1;
  min-height: 0;
 }

 /* Sidebar Naivgation */
 .config-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #1e293b;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #334155;
 }

 .nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  border-radius: 4px;
  transition: all 0.2s;
 }

 .nav-item:hover { background: #334155; color: #f1f5f9;
 }

 .nav-item.active { background: #2563eb; color: white;
 }

 /* Main Content */
 .config-content {
  background: #1e293b;
  border-radius: 8px;
  border: 1px solid #334155;
  padding: 2rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
 }

 .config-section {
  flex: 1;
 }

 h2 {
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  border-bottom: 2px solid #334155;
  padding-bottom: 0.5rem;
  margin-top: 0;
  margin-bottom: 2rem;
 }

 .form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
 }

 .form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
 }

 .form-group label {
  font-size: 0.875rem;
  color: #cbd5e1;
 }

 select, input[type="text"], input[type="number"] { background: #0f172a; border: 1px solid #475569;
  color: white;
  padding: 0.5rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
 }

 .checkbox {
  flex-direction: row;
  align-items: center;
 }

 .action-bar {
  margin-top: auto;
  padding-top: 2rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  border-top: 1px solid #334155;
 }

 .btn-primary, .btn-secondary {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s;
 }

 .btn-primary { background: #2563eb; color: white;
  border: none;
 }

 .btn-primary:hover {
  background: #1d4ed8;
 }

 .btn-secondary { background: transparent; color: #94a3b8;
  border: 1px solid #475569;
 }

 .btn-secondary:hover { background: #334155; color: white;
 }

 /* System Status */
 .system-status { background: #0f172a; border: 1px solid #334155;
  padding: 1.5rem;
  border-radius: 8px;
 }

 .system-status h3 {
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  margin-top: 0;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
 }

 .metric-card {
  margin-bottom: 1.5rem;
 }

 .metric-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: #cbd5e1;
 }

 .progress-bar { height: 4px; background: #334155;
  border-radius: 2px;
  overflow: hidden;
 }

 .fill { background: #10b981; height: 100%;
 }

 .value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.25rem;
  color: white;
 }

 .status-card {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
 }

 .status-card.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid #059669;
  color: #34d399;
 }

 .status-card.warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid #d97706;
  color: #fbbf24;
 }
</style>
