<script lang="ts">
 import { onMount } from 'svelte';

 let activeTab = $state<'general' | 'ai' | 'database' | 'gpu' | 'security'>('general');

 // Configuration settings
 let config = $state({
 general: {
 theme: 'yorha',
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
 encryption: 'AES256',
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

 let performanceMetrics = $state({
 responseTime: 0,
 throughput: 0,
 errorRate: 0,
 gpuUtilization: 0
 });

 const tabs = [
 { id: 'general', label: 'GENERAL', icon: '⚙️' },
 { id: 'ai', label: 'AI CONFIG', icon: '🤖' },
 { id: 'database', label: 'DATABASE', icon: '🗄️' },
 { id: 'gpu', label: 'GPU', icon: '🔋' },
 { id: 'security', label: 'SECURITY', icon: '🔒' }
 ] as const;

 function saveConfig() {
 // Mock save functionality
 console.log('Saving configuration:', config);
 // In real implementation, this would save to backend
 }

 function resetToDefaults() {
 // Reset to default values
 config = {
 general: {
 theme: 'yorha',
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
 encryption: 'AES256',
 sessionTimeout: 3600,
 twoFactor: false,
 auditLogging: true,
 backupFrequency: 'daily'
 }
 };
 }

 function exportConfig() {
 const configJson = JSON.stringify(config, null, 2);
 const blob = new Blob([configJson], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `yorha-config-${new Date().toISOString().split('T')[0]}.json`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function importConfig(event: Event) {
 const file = (event.target as HTMLInputElement).files?.[0];
 if (file) {
 const reader = new FileReader();
 reader.onload = (e) => {
 try {
 const importedConfig = JSON.parse(e.target?.result as string) as Partial<typeof config>;
 config = { ...config, ...importedConfig } as typeof config;
 } catch (error) {
 console.error('Failed to import config:', error);
 }
 };
 reader.readAsText(file);
 }
 }

 function runDiagnostics() {
 // Mock diagnostics
 systemInfo = {
 version: '2.0.0',
 uptime: '2d 14h 32m',
	memory: { used: 8192, total: 16384, percentage: 50 },
	disk: { used: 256, total: 512, percentage: 50 },
	cpu: { usage: 45, cores: 8 }
 };

 performanceMetrics = {
 responseTime: 245,
 throughput: 1250,
 errorRate: 0.02,
 gpuUtilization: webgpuCapabilities?.hasWebGPU ? 67 : 0
 };
 }

 function restartServices() {
 // Mock restart
 console.log('Restarting services...');
 }

 function backupDatabase() {
 // Mock backup
 console.log('Starting database backup...');
 }

 onMount(() => {
 runDiagnostics();
 });
</script>

<main class="system-config">
 <!-- Header -->
 <header class="config-header">
 <div class="header-title">
 <h1>SYSTEM CONFIGURATION</h1>
 <div class="system-info">
 <span class="version">v{systemInfo.version}</span>
 <span class="uptime">UPTIME: {systemInfo.uptime}</span>
 </div>
 </div>
 <div class="config-actions">
 <button class="action-btn secondary" onclick={runDiagnostics}>
 🔍 DIAGNOSTICS
 </button>
 <button class="action-btn primary" onclick={saveConfig}>
 💾 SAVE CONFIG
 </button>
 </div>
 </header>

 <!-- Main Configuration Interface -->
 <div class="config-layout">
 <!-- Tab Navigation -->
 <nav class="config-tabs">
 {#each tabs as tab}
 <button
 class="tab-btn {activeTab === tab.id ? 'active' : ''}"
 onclick={() => activeTab = tab.id}
 >
 <span class="tab-icon">{tab.icon}</span>
 <span class="tab-label">{tab.label}</span>
 </button>
 {/each}
 </nav>

 <!-- Configuration Content -->
 <section class="config-content">
 <!-- General Settings -->
 {#if activeTab === 'general'}
 <div class="config-section">
 <h2>GENERAL SETTINGS</h2>
 <div class="settings-grid">
 <div class="setting-group">
 <label class="setting-label" for="theme-select">Theme</label>
 <select id="theme-select" class="setting-input" bind:value={config.general.theme}>
 <option value="yorha">YoRHa Command Center</option>
 <option value="dark">Dark Professional</option>
 <option value="light">Light Professional</option>
 </select>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="language-select">Language</label>
 <select id="language-select" class="setting-input" bind:value={config.general.language}>
 <option value="en">English</option>
 <option value="es">Spanish</option>
 <option value="fr">French</option>
 <option value="de">German</option>
 </select>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="timezone-select">Timezone</label>
 <select id="timezone-select" class="setting-input" bind:value={config.general.timezone}>
 <option value="UTC">UTC</option>
 <option value="EST">Eastern Time</option>
 <option value="PST">Pacific Time</option>
 <option value="GMT">GMT</option>
 </select>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="auto-save">Auto Save</label>
 <label class="toggle" for="auto-save">
 <input id="auto-save" type="checkbox" bind:checked={config.general.autoSave} />
 <span class="toggle-slider"></span>
 </label>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="notifications">Notifications</label>
 <label class="toggle" for="notifications">
 <input id="notifications" type="checkbox" bind:checked={config.general.notifications} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 </div>
 </div>
 {/if}

 <!-- AI Configuration -->
 {#if activeTab === 'ai'}
 <div class="config-section">
 <h2>AI CONFIGURATION</h2>
 <div class="settings-grid">
 <div class="setting-group">
 <label class="setting-label" for="model-select">Primary Model</label>
 <select id="model-select" class="setting-input" bind:value={config.ai.model}>
 <option value="gemma3-legal">Gemma 3 Legal</option>
 <option value="llama2-legal">Llama 2 Legal</option>
 <option value="mistral-legal">Mistral Legal</option>
 </select>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="temperature-slider">Temperature</label>
 <input
 id="temperature-slider"
 type="range"
 class="setting-slider"
 min="0"
 max="2"
 step="0.1"
 bind:value={config.ai.temperature}
 />
 <span class="slider-value">{config.ai.temperature}</span>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="max-tokens">Max Tokens</label>
 <input
 id="max-tokens"
 type="number"
 class="setting-input"
 bind:value={config.ai.maxTokens}
 min="512"
 max="8192"
 step="512"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="ollama-endpoint">Ollama Endpoint</label>
 <input
 id="ollama-endpoint"
 type="url"
 class="setting-input"
 bind:value={config.ai.ollamaEndpoint}
 placeholder="http://localhost:11434"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="embedding-model">Embedding Model</label>
 <select id="embedding-model" class="setting-input" bind:value={config.ai.embeddingModel}>
 <option value="embeddinggemma">Embedding Gemma</option>
 <option value="all-minilm">All MiniLM</option>
 <option value="text-embedding-ada">OpenAI Ada</option>
 </select>
 </div>

 <div class="setting-group">
 <label class="setting-label" for="enable-fallback">Enable Fallback</label>
 <label class="toggle" for="enable-fallback">
 <input id="enable-fallback" type="checkbox" bind:checked={config.ai.enableFallback} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 </div>
 </div>
 {/if}

 <!-- Database Configuration -->
 {#if activeTab === 'database'}
 <div class="config-section">
 <h2>DATABASE CONFIGURATION</h2>
 <div class="settings-grid">
 <div class="setting-group">
 <label class="setting-label" for="db-type">Database Type</label>
 <select id="db-type" class="setting-input" bind:value={config.database.type}>
 <option value="postgresql">PostgreSQL</option>
 <option value="mysql">MySQL</option>
 <option value="mongodb">MongoDB</option>
 </select>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="db-host">Host</label>
 <input
 id="db-host"
 type="text"
 class="setting-input"
 bind:value={config.database.host}
 placeholder="localhost"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="db-port">Port</label>
 <input
 id="db-port"
 type="number"
 class="setting-input"
 bind:value={config.database.port}
 min="1"
 max="65535"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="db-name">Database Name</label>
 <input
 id="db-name"
 type="text"
 class="setting-input"
 bind:value={config.database.database}
 placeholder="legal_ai_db"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="db-ssl">SSL Enabled</label>
 <label class="toggle" for="db-ssl">
 <input id="db-ssl" type="checkbox" bind:checked={config.database.ssl} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="db-pool">Connection Pool Size</label>
 <input
 id="db-pool"
 type="number"
 class="setting-input"
 bind:value={config.database.connectionPool}
 min="1"
 max="100"
 />
 </div>
 </div>
 </div>
 {/if}

 <!-- GPU Configuration -->
 {#if activeTab === 'gpu'}
 <div class="config-section">
 <h2>GPU CONFIGURATION</h2>
 <div class="gpu-status">
 <div class="status-card">
 <h3>WebGPU Status</h3>
 <span class="status {webgpuCapabilities?.hasWebGPU ? 'active' : 'inactive'}">
 {webgpuCapabilities?.hasWebGPU ? 'ENABLED' : 'DISABLED'}
 </span>
 </div>
 <div class="status-card">
 <h3>CUDA Status</h3>
 <span class="status active">AVAILABLE</span>
 </div>
 <div class="status-card">
 <h3>GPU Utilization</h3>
 <span class="status active">{performanceMetrics.gpuUtilization}%</span>
 </div>
 </div>
 <div class="settings-grid">
 <div class="setting-group">
 <label class="setting-label" for="enable-webgpu">Enable WebGPU</label>
 <label class="toggle" for="enable-webgpu">
 <input id="enable-webgpu" type="checkbox" bind:checked={config.gpu.enableWebGPU} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="enable-cuda">Enable CUDA</label>
 <label class="toggle" for="enable-cuda">
 <input id="enable-cuda" type="checkbox" bind:checked={config.gpu.enableCUDA} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="memory-limit">Memory Limit (%)</label>
 <input
 id="memory-limit"
 type="range"
 class="setting-slider"
 min="10"
 max="95"
 bind:value={config.gpu.memoryLimit}
 />
 <span class="slider-value">{config.gpu.memoryLimit}%</span>
 </div>
          <div class="setting-group">
            <label class="setting-label" for="batch-size">Batch Size</label>
            <input
              id="batch-size"
              type="number"
              class="setting-input"
              bind:value={config.gpu.batchSize}
              min="1"
              max="256"
            />
          </div>
          <div class="setting-group">
            <label class="setting-label" for="precision-select">Precision</label>
            <select id="precision-select" class="setting-input" bind:value={config.gpu.precision}>
              <option value="fp32">FP32 (High Precision)</option>
              <option value="fp16">FP16 (Balanced)</option>
              <option value="int8">INT8 (Fast)</option>
              <option value="int4">INT4 (Fastest)</option>
            </select>
          </div>
        </div>
      </div>
    {/if}

 <!-- Security Configuration -->
 {#if activeTab === 'security'}
 <div class="config-section">
 <h2>SECURITY CONFIGURATION</h2>
 <div class="settings-grid">
 <div class="setting-group">
 <label class="setting-label" for="encryption-select">Encryption</label>
 <select id="encryption-select" class="setting-input" bind:value={config.security.encryption}>
 <option value="AES256">AES-256</option>
 <option value="AES128">AES-128</option>
 <option value="ChaCha20">ChaCha20</option>
 </select>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="session-timeout">Session Timeout (seconds)</label>
 <input
 id="session-timeout"
 type="number"
 class="setting-input"
 bind:value={config.security.sessionTimeout}
 min="300"
 max="86400"
 />
 </div>
 <div class="setting-group">
 <label class="setting-label" for="two-factor">Two-Factor Authentication</label>
 <label class="toggle" for="two-factor">
 <input id="two-factor" type="checkbox" bind:checked={config.security.twoFactor} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="audit-logging">Audit Logging</label>
 <label class="toggle" for="audit-logging">
 <input id="audit-logging" type="checkbox" bind:checked={config.security.auditLogging} />
 <span class="toggle-slider"></span>
 </label>
 </div>
 <div class="setting-group">
 <label class="setting-label" for="backup-frequency">Backup Frequency</label>
 <select id="backup-frequency" class="setting-input" bind:value={config.security.backupFrequency}>
 <option value="hourly">Hourly</option>
 <option value="daily">Daily</option>
 <option value="weekly">Weekly</option>
 <option value="monthly">Monthly</option>
 </select>
 </div>
 </div>
 </div>
 {/if}
 </section>

 <!-- System Information Panel -->
 <aside class="system-panel">
 <div class="panel-section">
 <h3>SYSTEM METRICS</h3>
 <div class="metrics-grid">
 <div class="metric-card">
 <span class="metric-label">CPU Usage</span>
 <span class="metric-value">{systemInfo.cpu.usage}%</span>
 <div class="metric-bar">
 <div class="metric-fill cpu" style="width: {systemInfo.cpu.usage}%"></div>
 </div>
 </div>

 <div class="metric-card">
 <span class="metric-label">Memory</span>
 <span class="metric-value">{systemInfo.memory.percentage}%</span>
 <div class="metric-bar">
 <div class="metric-fill memory" style="width: {systemInfo.memory.percentage}%"></div>
 </div>
 </div>

 <div class="metric-card">
 <span class="metric-label">Disk Usage</span>
 <span class="metric-value">{systemInfo.disk.percentage}%</span>
 <div class="metric-bar">
 <div class="metric-fill disk" style="width: {systemInfo.disk.percentage}%"></div>
 </div>
 </div>

 <div class="metric-card">
 <span class="metric-label">Response Time</span>
 <span class="metric-value">{performanceMetrics.responseTime}ms</span>
 </div>

 <div class="metric-card">
 <span class="metric-label">Throughput</span>
 <span class="metric-value">{performanceMetrics.throughput}/s</span>
 </div>

 <div class="metric-card">
 <span class="metric-label">Error Rate</span>
 <span class="metric-value">{(performanceMetrics.errorRate * 100).toFixed(2)}%</span>
 </div>
 </div>
 </div>

 <div class="panel-section">
 <h3>QUICK ACTIONS</h3>
        <label class="quick-action file-input" for="import-config">
          📥 IMPORT CONFIG
          <input id="import-config" type="file" accept=".json" onchange={importConfig} style="display: none;" />
        </label>
        <button class="quick-action" onclick={exportConfig}>
          📤 EXPORT CONFIG
        </button>
 <button class="quick-action" onclick={restartServices}>
 🔄 RESTART SERVICES
 </button>
 <button class="quick-action" onclick={backupDatabase}>
 💾 BACKUP DATABASE
 </button>
 </div>
 </aside>
 </div>
</main>

<style>
 .system-config {
 background: linear-gradient(135deg, #0d1117, #161b22);
 min-height: 100vh;
 color: #f0f6fc;
 font-family: 'JetBrains Mono', monospace;
 position: relative;
 }

 .system-config::before {
 content: '';
 position: fixed;
 top: 0;
 left: 0;
 width: 100%;
 height: 100%;
 background:
 linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px),
 linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px);
 background-size: 20px 20px;
 pointer-events: none;
 z-index: -1;
 }

 .config-header {
 background: rgba(0, 0, 0, 0.8);
 border-bottom: 2px solid #10b981;
 padding: 1rem 2rem;
 box-shadow: 0 2px 10px rgba(16, 185, 129, 0.2);
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .header-title h1 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 2rem;
 margin: 0;
 text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
 }

 .system-info {
 display: flex;
 gap: 1rem;
 align-items: center;
 }

 .version,
 .uptime {
 padding: 0.25rem 0.75rem;
 font-size: 0.75rem;
 border-radius: 4px;
 font-weight: bold;
 }

 .version {
 background: rgba(16, 185, 129, 0.2);
 color: #10b981;
 border: 1px solid #10b981;
 }

 .uptime {
 background: rgba(6, 182, 212, 0.2);
 color: #06b6d4;
 border: 1px solid #06b6d4;
 }

 .config-actions {
 display: flex;
 gap: 0.5rem;
 }

 .action-btn {
 padding: 0.5rem 1rem;
 border-radius: 4px;
 border: 1px solid transparent;
 cursor: pointer;
 font-size: 0.875rem;
 font-weight: bold;
 transition: all 0.3s ease;
 }

 .action-btn.primary {
 background: linear-gradient(90deg, #10b981, #34d399);
 color: #0d1117;
 }

 .action-btn.secondary {
 background: linear-gradient(90deg, #6b7280, #9ca3af);
 color: #0d1117;
 }

 .action-btn:hover {
 filter: brightness(0.95);
 }

 .config-layout {
 display: grid;
 grid-template-columns: 200px 1fr 300px;
 height: calc(100vh - 120px);
 gap: 1rem;
 padding: 1rem;
 }

 .config-tabs {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }

 .tab-btn {
 display: flex;
 flex-direction: column;
 align-items: center;
 gap: 0.25rem;
 padding: 1rem 0.5rem;
 background: rgba(30, 41, 59, 0.8);
 border: 1px solid #6b7280;
 color: #f0f6fc;
 border-radius: 8px;
 cursor: pointer;
 transition: all 0.3s ease;
 font-size: 0.75rem;
 text-align: center;
 }

 .tab-btn:hover,
 .tab-btn.active {
 background: rgba(16, 185, 129, 0.2);
 border-color: #10b981;
 box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
 }

 .tab-icon {
 font-size: 1.5rem;
 }

 .config-content {
 background: rgba(13, 17, 23, 0.9);
 border: 2px solid #10b981;
 border-radius: 8px;
 padding: 1.5rem;
 box-shadow: 0 4px 20px rgba(16, 185, 129, 0.1);
 overflow-y: auto;
 }

 .config-section h2 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 1.25rem;
 margin: 0 0 1.5rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129, 0.3);
 }

 .settings-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 1rem;
 }

 .setting-group {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }

 .setting-label {
 color: #f0f6fc;
 font-weight: bold;
 font-size: 0.875rem;
 }

 .setting-input,
 .setting-slider {
 padding: 0.5rem;
 background: rgba(30, 41, 59, 0.8);
 border: 1px solid #6b7280;
 border-radius: 4px;
 color: #f0f6fc;
 font-family: 'JetBrains Mono', monospace;
 }

 .setting-slider {
 -webkit-appearance: none;
 appearance: none;
 height: 6px;
 border-radius: 3px;
 background: rgba(107, 114, 128, 0.5);
 outline: none;
 }
 .setting-slider {
 -webkit-appearance: none;
 appearance: none;
 height: 6px;
 border-radius: 3px;
 background: rgba(107, 114, 128, 0.5);
 outline: none;
 }

 .setting-slider::-webkit-slider-thumb {
 -webkit-appearance: none;
 width: 16px;
 height: 16px;
 border-radius: 50%;
 background: #10b981;
 cursor: pointer;
 box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
 }

 .slider-value {
 color: #10b981;
 font-weight: bold;
 text-align: center;
 margin-top: 0.25rem;
 }

 .toggle {
 position: relative;
 display: inline-block;
 width: 50px;
 height: 24px;
 }

 .toggle input {
 opacity: 0;
 width: 0;
 height: 0;
 }

 .toggle-slider {
 position: absolute;
 cursor: pointer;
 top: 0;
 left: 0;
 right: 0;
 bottom: 0;
 background: rgba(107, 114, 128, 0.5);
 border-radius: 24px;
 transition: 0.3s;
 }

 .toggle-slider:before {
 position: absolute;
 content: "";
 height: 18px;
 width: 18px;
 left: 3px;
 bottom: 3px;
 background: #f0f6fc;
 border-radius: 50%;
 transition: 0.3s;
 }

 .toggle input:checked + .toggle-slider {
 background: #10b981;
 }

 .toggle input:checked + .toggle-slider:before {
 transform: translateX(26px);
 }

 .gpu-status {
 display: grid;
 grid-template-columns: repeat(3, 1fr);
 gap: 1rem;
 margin-bottom: 2rem;
 }

 .status-card {
 background: rgba(30, 41, 59, 0.5);
 border: 1px solid #6b7280;
 border-radius: 8px;
 padding: 1rem;
 text-align: center;
 }

 .status-card h3 {
 color: #f0f6fc;
 font-size: 0.875rem;
 margin: 0 0 0.5rem 0;
 }

 .status.active {
 color: #10b981;
 font-weight: bold;
 }

 .status.inactive {
 color: #dc2626;
 font-weight: bold;
 }

 .system-panel {
 background: rgba(13, 17, 23, 0.9);
 border: 2px solid #10b981;
 border-radius: 8px;
 padding: 1rem;
 box-shadow: 0 4px 20px rgba(16, 185, 129, 0.1);
 overflow-y: auto;
 }

 .panel-section {
 margin-bottom: 2rem;
 }

 .panel-section h3 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 0.875rem;
 margin: 0 0 1rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129, 0.3);
 }

 .metrics-grid {
 display: grid;
 gap: 1rem;
 }

 .metric-card {
 background: rgba(30, 41, 59, 0.5);
 border: 1px solid #6b7280;
 border-radius: 8px;
 padding: 1rem;
 }

 .metric-label {
 color: #9ca3af;
 font-size: 0.75rem;
 display: block;
 margin-bottom: 0.25rem;
 }

 .metric-value {
 color: #f0f6fc;
 font-weight: bold;
 font-size: 1rem;
 display: block;
 margin-bottom: 0.5rem;
 }

 .metric-bar {
 width: 100%;
 height: 8px;
 background: rgba(107, 114, 128, 0.3);
 border-radius: 4px;
 overflow: hidden;
 }

 .metric-fill {
 height: 100%;
 border-radius: 4px;
 transition: width 0.3s ease;
 }

 .metric-fill.cpu {
 background: linear-gradient(90deg, #10b981, #34d399);
 }

 .metric-fill.memory {
 background: linear-gradient(90deg, #06b6d4, #0891b2);
 }

 .metric-fill.disk {
 background: linear-gradient(90deg, #f59e0b, #d97706);
 }

 .quick-action {
 padding: 0.75rem;
 background: rgba(30, 41, 59, 0.8);
 border: 1px solid #6b7280;
 color: #f0f6fc;
 border-radius: 4px;
 cursor: pointer;
 transition: all 0.3s ease;
 font-size: 0.875rem;
 text-align: center;
 }

 .quick-action:hover {
 background: rgba(16, 185, 129, 0.2);
 border-color: #10b981;
 }

 .file-input {
 cursor: pointer;
 }
</style>
