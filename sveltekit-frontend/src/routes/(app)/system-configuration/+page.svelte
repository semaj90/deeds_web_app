<script lang="ts">
 // Migrated to $effect

 import { browser } from '$app/environment';

 import AccessibilitySettings from '$lib/components/ui/AccessibilitySettings.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
 import ThemeSelector from '$lib/components/ui/ThemeSelector.svelte';
 import ThemeGallery from '$lib/components/ui/ThemeGallery.svelte';
 import StyleSettings from '$lib/components/ui/StyleSettings.svelte';
 import SystemStatusCard from '$lib/components/ui/SystemStatusCard.svelte';
 import SystemStatusPanel from '$lib/components/dashboard/SystemStatusPanel.svelte';
 import SystemOverview from '$lib/components/yorha/dashboard/SystemOverview.svelte';
 import YoRHaSystemStatus from '$lib/components/yorha/_simulations/YoRHaSystemStatus.svelte';
 import CacheMonitoringWidget from '$lib/components/monitoring/CacheMonitoringWidget.svelte';

  const ONBOARDING_OPEN_EVENT = 'deeds:onboarding:open';

 let activeTab = $state<'general' | 'appearance' | 'ai' | 'database' | 'gpu' | 'security' | 'accessibility' | 'status'>('general');

  const CONFIG_STORAGE_KEY = 'system-configuration:v1';

  function createDefaultConfig() {
    return {
      general: {
        theme: 'yorha',
        language: 'en',
        timezone: 'UTC',
        autoSave: true,
        notifications: true
      },
      ai: {
        model: 'gemma4-legal',
        temperature: 0.7,
        maxTokens: 2048,
        ollamaEndpoint: '/api/embed',
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

  type ConfigState = ReturnType<typeof createDefaultConfig>;

  function mergeStoredConfig(value: unknown): ConfigState {
    const defaults = createDefaultConfig();
    if (!value || typeof value !== 'object') return defaults;

    const stored = value as Partial<ConfigState>;
    return {
      general: { ...defaults.general, ...(stored.general ?? {}) },
      ai: { ...defaults.ai, ...(stored.ai ?? {}) },
      database: { ...defaults.database, ...(stored.database ?? {}) },
      gpu: { ...defaults.gpu, ...(stored.gpu ?? {}) },
      security: { ...defaults.security, ...(stored.security ?? {}) }
    };
  }

 // Configuration settings
 let config = $state<ConfigState>(createDefaultConfig());

 let systemInfo = $state({
  version: '2.0.0',
  uptime: '0d 0h 0m',
  memory: { used: 0, total: 0, percentage: 0 },
	disk: { used: 0, total: 0, percentage: 0 },
	cpu: { usage: 0, cores: 0 }
 });

 let webgpuCapabilities = $state({ hasWebGPU: false });

  type VlmMode = 'OFF' | 'TEXT' | 'VISION' | 'SWITCHING' | 'GPU_WORK';
  let vlmMode = $state<VlmMode | null>(null);
  let vlmTurboQuantPid = $state<number | null>(null);
  let vlmHealthy = $state(false);
  let vlmSwitching = $state(false);
  let vlmError = $state('');

  async function fetchVlmStatus() {
    try {
      const res = await fetch('/api/vlm/status');
      if (!res.ok) return;
      const data = await res.json() as { mode: VlmMode; turboQuant: { pid: number | null; healthy: boolean } };
      vlmMode = data.mode;
      vlmTurboQuantPid = data.turboQuant.pid;
      vlmHealthy = data.turboQuant.healthy;
    } catch { /* ignore */ }
  }

  async function setVlmMode(mode: VlmMode) {
    vlmSwitching = true;
    vlmError = '';
    try {
      const res = await fetch('/api/vlm/switch-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json() as { mode?: VlmMode; error?: string };
      if (!res.ok) {
        vlmError = data.error ?? 'Switch failed';
      } else {
        vlmMode = data.mode ?? mode;
      }
    } catch (e) {
      vlmError = e instanceof Error ? e.message : 'Network error';
    } finally {
      vlmSwitching = false;
    }
  }
  let saveState = $state<'idle' | 'saved' | 'error'>('idle');
  let saveMessage = $state('');
  let lastSavedAt = $state('');

 $effect(() => {
    if (!browser) return;

    try {
      const storedConfig = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (storedConfig) {
        config = mergeStoredConfig(JSON.parse(storedConfig));
        saveState = 'saved';
        saveMessage = 'Loaded saved configuration.';
      }
    } catch (error) {
      saveState = 'error';
      saveMessage = 'Saved configuration could not be loaded.';
      console.error('Failed to load configuration:', error);
    }

    const updateInfo = () => {
      systemInfo.uptime = '2d 14h 32m';
      systemInfo.memory = { used: 8192, total: 16384, percentage: 50 };
      systemInfo.disk = { used: 256, total: 512, percentage: 50 };
      systemInfo.cpu = { usage: 45, cores: 8 };
    };

    updateInfo();
    webgpuCapabilities.hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

    const interval = window.setInterval(updateInfo, 5000);
    return () => window.clearInterval(interval);
});


  $effect(() => {
    if (activeTab === 'gpu') {
      fetchVlmStatus();
    }
  });

 function saveConfig() {
    if (!browser) return;
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      saveState = 'saved';
      saveMessage = 'Changes applied locally.';
      lastSavedAt = new Date().toLocaleTimeString();
    } catch (error) {
      saveState = 'error';
      saveMessage = 'Failed to save configuration.';
      console.error('Failed to save configuration:', error);
    }
  }

  function resetConfig() {
    config = createDefaultConfig();
    if (browser) {
      window.localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    saveState = 'saved';
    saveMessage = 'Configuration reset to defaults.';
    lastSavedAt = '';
 }

	function replayOnboardingTutorial() {
		if (!browser) return;

		window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
		saveState = 'saved';
		saveMessage = 'Onboarding tutorial reopened from Settings.';
	}
</script>

<div class="config-container">
 <header class="config-header">
  <div class="header-content">
   <div class="cfg-header-group">
    <div class="cfg-icon-badge">
     <Icon name="settings" />
    </div>
    <h1>SYSTEM_CONFIGURATION</h1>
   </div>
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
    <span class="icon"><Icon name="settings" /></span>
    GENERAL
   </button>

   <button
    class="nav-item {activeTab === 'appearance' ? 'active' : ''}"
    onclick={() => activeTab = 'appearance'}
   >
    <span class="icon"><Icon name="palette" /></span>
    APPEARANCE
   </button>

   <button
    class="nav-item {activeTab === 'ai' ? 'active' : ''}"
    onclick={() => activeTab = 'ai'}
   >
    <span class="icon"><Icon name="brain" /></span>
    AI_ENGINE
   </button>

   <button
    class="nav-item {activeTab === 'database' ? 'active' : ''}"
    onclick={() => activeTab = 'database'}
   >
    <span class="icon"><Icon name="database" /></span>
    DATABASE
   </button>

   <button
    class="nav-item {activeTab === 'gpu' ? 'active' : ''}"
    onclick={() => activeTab = 'gpu'}
   >
    <span class="icon"><Icon name="zap" /></span>
    GPU_ACCEL
   </button>

   <button
    class="nav-item {activeTab === 'security' ? 'active' : ''}"
    onclick={() => activeTab = 'security'}
   >
    <span class="icon"><Icon name="shield" /></span>
    SECURITY
   </button>

   <button
    class="nav-item {activeTab === 'accessibility' ? 'active' : ''}"
    onclick={() => activeTab = 'accessibility'}
   >
    <span class="icon"><Icon name="accessibility" /></span>
    A11Y
   </button>

   <div style="border-top: 1px solid #334155; margin: 0.5rem 0;"></div>

   <button
    class="nav-item {activeTab === 'status' ? 'active' : ''}"
    onclick={() => activeTab = 'status'}
   >
    <span class="icon"><Icon name="activity" /></span>
    STATUS
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

      <div class="form-group">
       <span class="form-label">Quick Theme Toggle</span>
       <ThemeSelector />
      </div>

      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.general.autoSave}>
        Enable Auto-Save
       </label>
      </div>
     </div>

      <div class="status-card" style="margin-top: 1.5rem; border-color: rgba(245, 158, 11, 0.28); background: rgba(15, 23, 42, 0.72);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: flex-start; gap: 0.85rem; min-width: min(100%, 28rem);">
            <div style="width: 2.5rem; height: 2.5rem; border-radius: 0.85rem; border: 1px solid rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.12); display: inline-flex; align-items: center; justify-content: center; color: #fbbf24; flex-shrink: 0;">
              <Icon name="sparkles" size={18} />
            </div>
            <div>
              <h3 style="margin: 0; color: #f8fafc; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase;">USER_ONBOARDING</h3>
              <p style="margin: 0.45rem 0 0; color: #94a3b8; font-size: 0.9rem; line-height: 1.55; max-width: 42rem;">
                The tutorial only auto-runs for authenticated app sessions. After the first pass, relaunch it here whenever you want the guided tour again.
              </p>
            </div>
          </div>

          <button class="btn-secondary" type="button" onclick={replayOnboardingTutorial}>
            Replay tutorial
          </button>
        </div>
      </div>
    </section>
   {/if}

   {#if activeTab === 'appearance'}
    <section class="config-section">
     <h2>INTERFACE_PROFILES</h2>
     <ThemeGallery />

     <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--t-border, #334155);">
      <StyleSettings />
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
        <option value="gemma4-legal">Gemma 3 Legal (Fine-tuned)</option>
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

     <!-- LLM Cache Monitoring -->
     <div class="mt-6">
      <CacheMonitoringWidget />
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

     <div style="margin-top:1.5rem;">
      <h3 style="color:#94a3b8;font-family:'JetBrains Mono',monospace;font-size:0.875rem;margin-bottom:0.75rem;">VLM_LIFECYCLE</h3>

      {#if vlmMode === null}
       <p style="color:#64748b;font-size:0.8rem;">Loading…</p>
      {:else}
       <div class="status-card {vlmMode === 'TEXT' || vlmMode === 'VISION' ? 'success' : vlmMode === 'SWITCHING' ? 'warning' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;">
         <div>
          <h3 style="margin:0 0 0.25rem;">llama-server mode: <strong>{vlmMode}</strong></h3>
          {#if vlmTurboQuantPid}
           <p style="margin:0;font-size:0.75rem;color:#94a3b8;">PID {vlmTurboQuantPid} · {vlmHealthy ? '✓ healthy' : '✗ not responding'}</p>
          {:else}
           <p style="margin:0;font-size:0.75rem;color:#64748b;">Not running on :8090</p>
          {/if}
         </div>
         <button onclick={fetchVlmStatus} style="padding:0.25rem 0.5rem;font-size:0.75rem;background:transparent;border:1px solid #334155;color:#94a3b8;cursor:pointer;">↻</button>
        </div>
       </div>

       {#if vlmError}
        <p style="color:#f87171;font-size:0.8rem;margin:0.5rem 0;">{vlmError}</p>
       {/if}

       <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
        <button onclick={() => setVlmMode('TEXT')} disabled={vlmSwitching || vlmMode === 'TEXT' || vlmMode === 'SWITCHING'} style="padding:0.4rem 0.85rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;border:1px solid #334155;background:{vlmMode==='TEXT'?'#1e3a5f':'transparent'};color:{vlmMode==='TEXT'?'#60a5fa':'#94a3b8'};cursor:pointer;">TEXT</button>
        <button onclick={() => setVlmMode('VISION')} disabled={vlmSwitching || vlmMode === 'VISION' || vlmMode === 'SWITCHING'} style="padding:0.4rem 0.85rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;border:1px solid #334155;background:{vlmMode==='VISION'?'#1e3a5f':'transparent'};color:{vlmMode==='VISION'?'#60a5fa':'#94a3b8'};cursor:pointer;">VISION</button>
        <button onclick={() => setVlmMode('GPU_WORK')} disabled={vlmSwitching || vlmMode === 'GPU_WORK' || vlmMode === 'SWITCHING'} style="padding:0.4rem 0.85rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;border:1px solid #334155;background:{vlmMode==='GPU_WORK'?'#3b1f0a':'transparent'};color:{vlmMode==='GPU_WORK'?'#fb923c':'#94a3b8'};cursor:pointer;">GPU_WORK</button>
        <button onclick={() => setVlmMode('OFF')} disabled={vlmSwitching || vlmMode === 'OFF' || vlmMode === 'SWITCHING'} style="padding:0.4rem 0.85rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;border:1px solid #334155;background:transparent;color:{vlmMode==='OFF'?'#ef4444':'#94a3b8'};cursor:pointer;">OFF</button>
       </div>
       <p style="color:#475569;font-size:0.7rem;margin-top:0.5rem;">TEXT = no mmproj (~5GB VRAM) · VISION = with mmproj (~6GB) · GPU_WORK / OFF = fully unloaded</p>
      {/if}
     </div>
    </section>
   {/if}

   {#if activeTab === 'accessibility'}
    <section class="config-section">
     <h2>ACCESSIBILITY_SETTINGS</h2>
     <AccessibilitySettings
      onSettingsChange={(settings) => {
       if (typeof window !== 'undefined') {
        localStorage.setItem('a11y-settings', JSON.stringify(settings));
       }
      }}
     />
    </section>
   {/if}

   {#if activeTab === 'status'}
    <section class="config-section">
     <h2>SYSTEM_STATUS</h2>
     <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <SystemStatusCard title="PostgreSQL" status="OK" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">70+ tables, pgvector, Drizzle ORM 0.44</p>
      </SystemStatusCard>
      <SystemStatusCard title="Redis Cache" status="OK" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">L3 cache layer, configurable TTL</p>
      </SystemStatusCard>
      <SystemStatusCard title="Qdrant Vector DB" status="OK" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">768-dim, 6 collections, GPU-accelerated</p>
      </SystemStatusCard>
      <SystemStatusCard title="Ollama LLM" status="OK" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">gemma4-legal + embeddinggemma</p>
      </SystemStatusCard>
      <SystemStatusCard title="RabbitMQ" status="WARN" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">7 queues, 5 exchanges</p>
      </SystemStatusCard>
      <SystemStatusCard title="SeaweedFS Storage" status="OK" updatedAt={new Date()}>
       <p class="text-xs text-gray-400 mt-1">SHA-256 hash verification, evidence uploads</p>
      </SystemStatusCard>
     </div>

     <div class="mb-6">
      <h3 style="color: #94a3b8; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; margin-bottom: 1rem;">SYSTEM_OVERVIEW</h3>
      <SystemOverview />
     </div>

     <div class="mb-6">
      <h3 style="color: #94a3b8; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; margin-bottom: 1rem;">AI_PIPELINE</h3>
      <SystemStatusPanel status={{
       database: 'online',
       elasticsearch: 'online',
       gemma: 'online',
       storageCapacity: 67
      }} />
     </div>

     <div>
      <h3 style="color: #94a3b8; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; margin-bottom: 1rem;">LIVE_METRICS</h3>
      <YoRHaSystemStatus
       systemLoad={35}
       gpuUtilization={72}
       memoryUsage={61}
       networkLatency={18}
      />
     </div>
    </section>
   {/if}

   {#if activeTab === 'database'}
    <section class="config-section">
     <h2>DATABASE_CONFIGURATION</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="db-type">Database Type</label>
       <select id="db-type" bind:value={config.database.type}>
        <option value="postgresql">PostgreSQL 16 + pgvector</option>
        <option value="sqlite">SQLite (dev only)</option>
       </select>
      </div>
      <div class="form-group">
       <label for="db-host">Host</label>
       <input type="text" id="db-host" bind:value={config.database.host} />
      </div>
      <div class="form-group">
       <label for="db-port">Port</label>
       <input type="number" id="db-port" bind:value={config.database.port} min="1" max="65535" />
      </div>
      <div class="form-group">
       <label for="db-name">Database Name</label>
       <input type="text" id="db-name" bind:value={config.database.database} />
      </div>
      <div class="form-group">
       <label for="db-pool">Connection Pool Size ({config.database.connectionPool})</label>
       <input type="range" id="db-pool" min="1" max="50" step="1" bind:value={config.database.connectionPool} />
      </div>
      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.database.ssl} />
        Enable SSL / TLS
       </label>
      </div>
     </div>
     <div class="status-card success">
      <h3>Connection Status</h3>
      <p>PostgreSQL 16 — 70+ tables, pgvector 0.7, Drizzle ORM 0.44</p>
     </div>
    </section>
   {/if}

   {#if activeTab === 'security'}
    <section class="config-section">
     <h2>SECURITY_SETTINGS</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="encryption">Encryption Algorithm</label>
       <select id="encryption" bind:value={config.security.encryption}>
        <option value="AES256">AES-256-GCM (recommended)</option>
        <option value="AES128">AES-128-GCM</option>
        <option value="ChaCha20">ChaCha20-Poly1305</option>
       </select>
      </div>
      <div class="form-group">
       <label for="session-timeout">Session Timeout (seconds)</label>
       <input type="number" id="session-timeout" bind:value={config.security.sessionTimeout} min="300" max="86400" step="300" />
      </div>
      <div class="form-group">
       <label for="backup-freq">Backup Frequency</label>
       <select id="backup-freq" bind:value={config.security.backupFrequency}>
        <option value="hourly">Hourly</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
       </select>
      </div>
      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.security.twoFactor} />
        Enable Two-Factor Authentication
       </label>
      </div>
      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.security.auditLogging} />
        Enable Audit Logging
       </label>
      </div>
     </div>
     <div class="status-card {config.security.auditLogging ? 'success' : 'warning'}">
      <h3>Audit Log Status</h3>
      <p>{config.security.auditLogging ? 'All actions are being logged to the audit trail.' : 'Audit logging is disabled — enable for compliance.'}</p>
     </div>
    </section>
   {/if}

   <!-- Save Actions -->
   <div class="action-bar">
      {#if saveMessage || lastSavedAt}
        <div class="save-status" class:saved={saveState === 'saved'} class:error={saveState === 'error'}>
          {#if saveMessage}
            <span>{saveMessage}</span>
          {/if}
          {#if lastSavedAt}
            <span>Last saved {lastSavedAt}</span>
          {/if}
        </div>
      {/if}
        <button class="btn-secondary" onclick={resetConfig}>RESET</button>
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
 .config-container {
  min-height: 100vh;
  background: #0f172a;
  color: #f8fafc;
  font-family: 'Inter', system-ui, sans-serif;
  margin: -2.5rem;
  padding: 2rem max(1.5rem, calc(50% - 43.75rem));
  display: flex;
  flex-direction: column;
  gap: 2rem;
 }
 .config-container :global(h1), .config-container :global(h2), .config-container :global(h3), .config-container :global(h4), .config-container :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
 .config-container :global(a) { color: inherit; border-bottom: none; }
 .config-container :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
 .config-container :global(input), .config-container :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
 .config-container :global(.panel), .config-container :global(.card), .config-container :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

 .config-header h1 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 2rem;
  margin: 0;
  color: #e2e8f0;
  letter-spacing: -0.05em;
 }

 .cfg-header-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
 }

 .cfg-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background: rgba(5, 150, 105, 0.15);
  border: 1px solid rgba(5, 150, 105, 0.35);
  color: #10b981;
 }

 .status-badge { background: #059669;
		color: white;
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

 .nav-item:hover { background: #334155;
		color: #f1f5f9;
 }

 .nav-item.active { background: #2563eb;
		color: white;
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

 select, input[type="text"] { background: #0f172a;
		border: 1px solid #475569;
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
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  border-top: 1px solid #334155;
 }

  .save-status {
    margin-right: auto;
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    color: #94a3b8;
  }

  .save-status.saved {
    color: #93c5fd;
  }

  .save-status.error {
    color: #fca5a5;
  }

 .btn-primary, .btn-secondary {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s;
 }

 .btn-primary { background: #2563eb;
		color: white;
  border: none;
 }

 .btn-primary:hover {
  background: #1d4ed8;
 }

 .btn-secondary { background: transparent;
		color: #94a3b8;
  border: 1px solid #475569;
 }

 .btn-secondary:hover { background: #334155;
		color: white;
 }

 /* System Status */
 .system-status { background: #0f172a;
		border: 1px solid #334155;
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

 .progress-bar { height: 4px;
		background: #334155;
  border-radius: 2px;
  overflow: hidden;
 }

 .fill { background: #10b981;
		height: 100%;
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
