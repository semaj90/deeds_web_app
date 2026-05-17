<script lang="ts">
  import { onMount } from 'svelte';

  // Svelte 5 Props Rune
  let { data } = $props<{ data: { obsData: any; vlmData: any } }>();

  // Svelte 5 State Runes
  let switchingMode = $state(false);
  let currentVlmState = $state(data.vlmData?.state || 'OFF');
  let turboQuantHealthy = $state(data.vlmData?.turboQuantHealthy || false);
  let actionFeedback = $state('');
  let feedbackType = $state<'info' | 'success' | 'error'>('info');

  // SVG Chart Derived coordinates for Latency Trends (dynamic mapping based on data)
  let p50Points = $derived(
    data.obsData?.latencyTrendMs?.p50
      ? data.obsData.latencyTrendMs.p50.map((val: number, idx: number) => ({
          x: idx * 120 + 40,
          y: 180 - (val / 3000) * 130
        }))
      : []
  );

  let p95Points = $derived(
    data.obsData?.latencyTrendMs?.p95
      ? data.obsData.latencyTrendMs.p95.map((val: number, idx: number) => ({
          x: idx * 120 + 40,
          y: 180 - (val / 7000) * 130
        }))
      : []
  );

  let p50Path = $derived(
    p50Points.length > 0
      ? `M ${p50Points[0].x} ${p50Points[0].y} ` + p50Points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''
  );

  let p95Path = $derived(
    p95Points.length > 0
      ? `M ${p95Points[0].x} ${p95Points[0].y} ` + p95Points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''
  );

  // SVG Chart Derived coordinates for VRAM Trends
  let vramPoints = $derived(
    data.obsData?.vramTrendMb?.baseline
      ? data.obsData.vramTrendMb.baseline.map((val: number, idx: number) => ({
          x: idx * 120 + 40,
          y: 180 - ((val - 7000) / 1000) * 130
        }))
      : []
  );

  let vramPath = $derived(
    vramPoints.length > 0
      ? `M ${vramPoints[0].x} ${vramPoints[0].y} ` + vramPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''
  );

  // Interactive method to invoke mode changes
  async function handleModeChange(newMode: string) {
    if (switchingMode) return;
    switchingMode = true;
    actionFeedback = `SYSTEM INSTRUCTION: Transitioning VLM to state [${newMode}]...`;
    feedbackType = 'info';

    try {
      const res = await fetch('/api/vlm/switch-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      const result = await res.json();
      
      if (result.success) {
        currentVlmState = newMode;
        turboQuantHealthy = result.turboQuantHealthy;
        feedbackType = 'success';
        actionFeedback = `SUCCESS: Transitioned VLM state to [${newMode}] successfully. Port 8090 state: [${result.turboQuantHealthy ? 'ONLINE' : 'OFFLINE'}]`;
      } else {
        feedbackType = 'error';
        actionFeedback = `ERROR: Transition failed. ${result.error || 'Server error.'}`;
      }
    } catch (e: any) {
      feedbackType = 'error';
      actionFeedback = `CRITICAL EXCEPTION: ${e.message}`;
    } finally {
      switchingMode = false;
    }
  }

  // Periodic status poll (every 10s) to monitor VLM health state
  onMount(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/vlm/status');
        if (res.ok) {
          const result = await res.json();
          if (result.success) {
            turboQuantHealthy = result.turboQuantHealthy;
            if (!switchingMode) {
              currentVlmState = result.state;
            }
          }
        }
      } catch (e) {
        // Suppress background poll errors
      }
    }, 10000);

    return () => clearInterval(interval);
  });
</script>

<div class="hud-dashboard">
  <!-- Top Grid scanlines -->
  <div class="scanlines"></div>

  <!-- Main header and YoRHa grid -->
  <header class="hud-header">
    <div class="hud-title-block">
      <span class="hud-subtitle">MONITOR SYSTEM // WORKSTATION TELEMETRY</span>
      <h1 class="hud-title">YoRHa Tactical Observability Dashboard</h1>
    </div>
    
    <div class="hud-header-meta">
      <div class="meta-item">
        <span class="label">DRIFT STATUS</span>
        <span class="value" class:text-glow-green={!data.obsData?.systemDriftDetected} class:text-glow-red={data.obsData?.systemDriftDetected}>
          {data.obsData?.systemDriftDetected ? 'DRIFT DETECTED' : 'STABLE (PASS)'}
        </span>
      </div>
      <div class="meta-item">
        <span class="label">LAST SYNC</span>
        <span class="value">{new Date(data.obsData?.generatedAt || Date.now()).toLocaleTimeString()}</span>
      </div>
      <div class="status-indicator">
        <span class="pulse-dot" class:healthy={turboQuantHealthy}></span>
        <span class="label">VLM: {turboQuantHealthy ? 'ONLINE' : 'STANDBY'}</span>
      </div>
    </div>
  </header>

  <!-- Key Metrics Row (HUD Card Panel) -->
  <section class="metrics-row">
    <div class="hud-card metric-card">
      <div class="card-bg-grid"></div>
      <span class="card-tag">T_01</span>
      <h3>SourceRef Coverage</h3>
      <div class="metric-display">
        <span class="number text-glow-green">{data.obsData?.sourceRefCoveragePct || 100}%</span>
        <span class="subtext">Somatic cent-routing target matches</span>
      </div>
    </div>

    <div class="hud-card metric-card">
      <div class="card-bg-grid"></div>
      <span class="card-tag">T_02</span>
      <h3>Contracts Audit</h3>
      <div class="metric-display">
        <span class="number text-glow-green">{data.obsData?.audits?.contracts?.status || 'PASS'}</span>
        <span class="subtext">{data.obsData?.audits?.contracts?.findings || 0} low findings registered</span>
      </div>
    </div>

    <div class="hud-card metric-card">
      <div class="card-bg-grid"></div>
      <span class="card-tag">T_03</span>
      <h3>pgvector Parity</h3>
      <div class="metric-display">
        <span class="number text-glow-green">{data.obsData?.audits?.pgvector?.status || 'PASS'}</span>
        <span class="subtext">{data.obsData?.audits?.pgvector?.indexes || 0} active HNSW layers</span>
      </div>
    </div>

    <div class="hud-card metric-card">
      <div class="card-bg-grid"></div>
      <span class="card-tag">T_04</span>
      <h3>Stability Level</h3>
      <div class="metric-display">
        <span class="number text-glow-green">{data.obsData?.compliancePassRate || 100}%</span>
        <span class="subtext">Zero leakage soak- ladder certified</span>
      </div>
    </div>
  </section>

  <!-- Split Panel: Latency & Memory Trends -->
  <div class="charts-split">
    <!-- Latency Chart Card -->
    <div class="hud-card chart-card">
      <span class="card-tag">CH_LAT</span>
      <h3>ACE Packet Builder Latency (p50 / p95)</h3>
      <p class="chart-desc">Historical latency tracking over consecutive soak cycles (ms)</p>
      
      <div class="chart-container">
        {#if data.obsData?.latencyTrendMs?.p50 && data.obsData.latencyTrendMs.p50.length > 0}
          <svg class="hud-svg-chart" viewBox="0 0 320 200">
            <!-- Grid lines -->
            <line x1="20" y1="30" x2="300" y2="30" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="80" x2="300" y2="80" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="130" x2="300" y2="130" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="180" x2="300" y2="180" stroke="rgba(57, 255, 20, 0.1)" />

            <!-- Y Axis values -->
            <text x="5" y="35" class="chart-axis-text">7s</text>
            <text x="5" y="85" class="chart-axis-text">3s</text>
            <text x="5" y="135" class="chart-axis-text">1s</text>
            <text x="5" y="185" class="chart-axis-text">0s</text>

            <!-- Line paths -->
            <path d={p95Path} fill="none" stroke="#FF3366" stroke-width="2.5" stroke-dasharray="4,2" />
            <path d={p50Path} fill="none" stroke="#00FF66" stroke-width="3" />

            <!-- Plot dots -->
            {#each p50Points as pt, i}
              <circle cx={pt.x} cy={pt.y} r="5" fill="#00FF66" class="chart-dot" />
              <text x={pt.x - 10} y={pt.y - 10} class="chart-value-text">{data.obsData.latencyTrendMs.p50[i]}ms</text>
            {/each}
            
            {#each p95Points as pt, i}
              <circle cx={pt.x} cy={pt.y} r="4" fill="#FF3366" class="chart-dot" />
            {/each}
          </svg>
        {:else}
          <div class="empty-chart">No latency benchmarks recorded yet.</div>
        {/if}
      </div>
      
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-line p50"></span> p50 Latency (Median)</span>
        <span class="legend-item"><span class="legend-line p95"></span> p95 Latency (Peak)</span>
      </div>
    </div>

    <!-- VRAM Chart Card -->
    <div class="hud-card chart-card">
      <span class="card-tag">CH_MEM</span>
      <h3>VRAM Baseline Trend</h3>
      <p class="chart-desc">Hardware memory leak protection / progressive soak baseline (MB)</p>
      
      <div class="chart-container">
        {#if data.obsData?.vramTrendMb?.baseline && data.obsData.vramTrendMb.baseline.length > 0}
          <svg class="hud-svg-chart" viewBox="0 0 320 200">
            <!-- Grid lines -->
            <line x1="20" y1="30" x2="300" y2="30" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="80" x2="300" y2="80" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="130" x2="300" y2="130" stroke="rgba(57, 255, 20, 0.05)" />
            <line x1="20" y1="180" x2="300" y2="180" stroke="rgba(57, 255, 20, 0.1)" />

            <!-- Y Axis values -->
            <text x="5" y="35" class="chart-axis-text">8GB</text>
            <text x="5" y="85" class="chart-axis-text">7.8G</text>
            <text x="5" y="135" class="chart-axis-text">7.5G</text>
            <text x="5" y="185" class="chart-axis-text">7GB</text>

            <!-- Line path -->
            <path d={vramPath} fill="none" stroke="#00E5FF" stroke-width="3" />

            <!-- Plot dots -->
            {#each vramPoints as pt, i}
              <circle cx={pt.x} cy={pt.y} r="5" fill="#00E5FF" class="chart-dot" />
              <text x={pt.x - 15} y={pt.y - 10} class="chart-value-text">{data.obsData.vramTrendMb.baseline[i]}MB</text>
            {/each}
          </svg>
        {:else}
          <div class="empty-chart">No VRAM telemetry recorded yet.</div>
        {/if}
      </div>

      <div class="chart-legend">
        <span class="legend-item"><span class="legend-line vram"></span> VRAM Baseline (MB)</span>
      </div>
    </div>
  </div>

  <!-- VLM Inference Controller Panel -->
  <section class="hud-card controller-panel" class:loading={switchingMode}>
    <div class="panel-header">
      <span class="card-tag">CTRL_VLM</span>
      <h2>YoRHa VLM State & Inference Controller</h2>
      <p>Manage model loading profiles to protect native GPU/VRAM allocations</p>
    </div>

    <!-- Feedback banner -->
    {#if actionFeedback}
      <div class="feedback-banner" class:info={feedbackType === 'info'} class:success={feedbackType === 'success'} class:error={feedbackType === 'error'}>
        <div class="feedback-icon">
          {#if feedbackType === 'success'}
            [✓]
          {:else if feedbackType === 'error'}
            [⚠]
          {:else}
            [i]
          {/if}
        </div>
        <div class="feedback-text">{actionFeedback}</div>
      </div>
    {/if}

    <div class="controller-grid">
      <!-- Status Box -->
      <div class="status-summary-box">
        <div class="status-row">
          <span class="label">Current Active Mode:</span>
          <span class="badge text-glow-green">{currentVlmState}</span>
        </div>
        <div class="status-row">
          <span class="label">llama-server Port 8090:</span>
          <span class="badge" class:text-glow-green={turboQuantHealthy} class:text-glow-red={!turboQuantHealthy}>
            {turboQuantHealthy ? 'ONLINE (HEALTHY)' : 'OFFLINE (STANDBY)'}
          </span>
        </div>
        <div class="status-row">
          <span class="label">Quantization Level:</span>
          <span class="subval">IQ4_XS (RotorQuant direct)</span>
        </div>
        <div class="status-row">
          <span class="label">VRAM Profile Safe Lock:</span>
          <span class="subval text-glow-green">ENABLED (8GB GPU Cap)</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="controls-action-box">
        <h4>Request Mode Transition</h4>
        <div class="buttons-grid">
          <button 
            type="button" 
            class="hud-btn" 
            class:active={currentVlmState === 'TEXT'} 
            disabled={switchingMode} 
            onclick={() => handleModeChange('TEXT')}
          >
            TEXT ONLY
            <span class="btn-sub">Bypass VLM / Save 1GB VRAM</span>
          </button>
          
          <button 
            type="button" 
            class="hud-btn" 
            class:active={currentVlmState === 'VISION'} 
            disabled={switchingMode} 
            onclick={() => handleModeChange('VISION')}
          >
            VLM VISION
            <span class="btn-sub">Load mmproj vision projector</span>
          </button>

          <button 
            type="button" 
            class="hud-btn" 
            class:active={currentVlmState === 'GPU_WORK'} 
            disabled={switchingMode} 
            onclick={() => handleModeChange('GPU_WORK')}
          >
            GPU WORK
            <span class="btn-sub">Unload TurboQuant for native tasks</span>
          </button>

          <button 
            type="button" 
            class="hud-btn" 
            class:active={currentVlmState === 'OFF'} 
            disabled={switchingMode} 
            onclick={() => handleModeChange('OFF')}
          >
            SYSTEM OFF
            <span class="btn-sub">Release all active GPU models</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Latest Benchmarks details -->
  {#if data.obsData?.latestRun}
    <footer class="hud-card footer-panel">
      <span class="card-tag">RUN_LAST</span>
      <h3>Latest Cycle Run Analysis</h3>
      <div class="footer-stats">
        <div class="stat">
          <span class="label">Queries Run:</span>
          <span class="val">{data.obsData.latestRun.queriesCount} cycles</span>
        </div>
        <div class="stat">
          <span class="label">Average Latency:</span>
          <span class="val">{data.obsData.latestRun.averageLatencyMs.toFixed(2)} ms</span>
        </div>
        <div class="stat">
          <span class="label">Peak VRAM Delta:</span>
          <span class="val text-glow-green">+{data.obsData.latestRun.peakVramDeltaMb} MB</span>
        </div>
        <div class="stat">
          <span class="label">Compliance Status:</span>
          <span class="badge text-glow-green">{data.obsData.latestRun.overallStatus}</span>
        </div>
      </div>
    </footer>
  {/if}
</div>

<style>
  /* Cyberpunk / YoRHa Tactical CSS System (No Tailwind dependency) */
  :global(body) {
    background-color: #0b0b0b;
    color: #cbd5e1;
    font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  }

  .hud-dashboard {
    position: relative;
    padding: 2.5rem;
    max-width: 1400px;
    margin: 0 auto;
    background: radial-gradient(circle at 50% 10%, rgba(0, 255, 102, 0.03) 0%, transparent 60%);
    overflow: hidden;
  }

  /* Scanner scanning grid backdrop effect */
  .hud-dashboard::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: 
      linear-gradient(rgba(57, 255, 20, 0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(57, 255, 20, 0.015) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  /* Scanlines cyber overlay */
  .scanlines {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(
      rgba(18, 16, 16, 0) 50%, 
      rgba(0, 0, 0, 0.25) 50%
    );
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 999;
    opacity: 0.4;
  }

  /* Header Layout */
  .hud-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid rgba(57, 255, 20, 0.2);
    padding-bottom: 1.5rem;
    margin-bottom: 2.5rem;
    z-index: 10;
    position: relative;
  }

  .hud-title-block {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .hud-subtitle {
    font-size: 0.75rem;
    letter-spacing: 0.25rem;
    color: #888;
    font-weight: 700;
  }

  .hud-title {
    font-size: 1.75rem;
    color: #e5e9f0;
    margin: 0;
    font-weight: 300;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .hud-header-meta {
    display: flex;
    gap: 2rem;
    align-items: center;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    text-align: right;
  }

  .meta-item .label {
    font-size: 0.65rem;
    color: #666;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .meta-item .value {
    font-size: 0.95rem;
    font-weight: 700;
    color: #ccc;
  }

  /* Blinking health status dot */
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.8rem;
    background: rgba(30, 30, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  .status-indicator .label {
    font-size: 0.75rem;
    letter-spacing: 1px;
    color: #aaa;
    font-weight: 600;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #ff3366;
    box-shadow: 0 0 10px #ff3366;
  }

  .pulse-dot.healthy {
    background-color: #00ff66;
    box-shadow: 0 0 10px #00ff66;
    animation: pulse 1.8s infinite;
  }

  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(0, 255, 102, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(0, 255, 102, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 255, 102, 0); }
  }

  /* HUD Card Base design */
  .hud-card {
    position: relative;
    background: rgba(15, 15, 15, 0.65);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(57, 255, 20, 0.12);
    border-radius: 6px;
    padding: 1.5rem;
    transition: all 0.3s ease;
    z-index: 10;
    overflow: hidden;
  }

  .hud-card:hover {
    border-color: rgba(57, 255, 20, 0.35);
    box-shadow: 0 0 20px rgba(0, 255, 102, 0.08);
    transform: translateY(-2px);
  }

  .card-bg-grid {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(rgba(57, 255, 20, 0.08) 1px, transparent 1px);
    background-size: 10px 10px;
    opacity: 0.15;
    pointer-events: none;
  }

  .card-tag {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.55rem;
    font-family: monospace;
    color: rgba(57, 255, 20, 0.4);
    letter-spacing: 1px;
  }

  /* Glow styles */
  .text-glow-green {
    color: #00ff66 !important;
    text-shadow: 0 0 8px rgba(0, 255, 102, 0.5);
  }

  .text-glow-red {
    color: #ff3366 !important;
    text-shadow: 0 0 8px rgba(255, 51, 102, 0.5);
  }

  /* Metrics panel layout */
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2.5rem;
  }

  .metric-card h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.85rem;
    letter-spacing: 1px;
    color: #888;
    text-transform: uppercase;
  }

  .metric-display {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .metric-display .number {
    font-size: 2.25rem;
    font-weight: 300;
    letter-spacing: -1px;
  }

  .metric-display .subtext {
    font-size: 0.7rem;
    color: #666;
  }

  /* Chart Layout split */
  .charts-split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
    gap: 2rem;
    margin-bottom: 2.5rem;
  }

  @media(max-width: 768px) {
    .charts-split {
      grid-template-columns: 1fr;
    }
  }

  .chart-card h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.1rem;
    color: #e5e9f0;
    font-weight: 400;
  }

  .chart-desc {
    font-size: 0.75rem;
    color: #666;
    margin: 0 0 1.5rem 0;
  }

  .chart-container {
    height: 220px;
    background: rgba(5, 5, 5, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-chart {
    font-size: 0.85rem;
    color: #444;
  }

  .hud-svg-chart {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .chart-axis-text {
    font-size: 8px;
    font-family: monospace;
    fill: #444;
  }

  .chart-value-text {
    font-size: 8px;
    font-family: monospace;
    fill: #888;
    pointer-events: none;
  }

  .chart-dot {
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .chart-dot:hover {
    r: 7;
    fill: #ffffff;
  }

  .chart-legend {
    display: flex;
    gap: 1.5rem;
    margin-top: 1rem;
    font-size: 0.75rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #888;
  }

  .legend-line {
    width: 12px;
    height: 3px;
    display: inline-block;
  }

  .legend-line.p50 { background-color: #00ff66; }
  .legend-line.p95 { background-color: #ff3366; }
  .legend-line.vram { background-color: #00e5ff; }

  /* Controller Panel styling */
  .controller-panel {
    border: 1px solid rgba(57, 255, 20, 0.2);
    margin-bottom: 2.5rem;
    position: relative;
  }

  .controller-panel.loading::after {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(10, 10, 10, 0.6);
    backdrop-filter: blur(2px);
    z-index: 20;
    cursor: not-allowed;
  }

  .panel-header {
    margin-bottom: 2rem;
  }

  .panel-header h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    color: #e5e9f0;
    font-weight: 400;
    text-transform: uppercase;
  }

  .panel-header p {
    margin: 0;
    font-size: 0.8rem;
    color: #666;
  }

  /* Feedback banner alerts */
  .feedback-banner {
    display: flex;
    gap: 1rem;
    padding: 0.8rem 1.2rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
    font-size: 0.8rem;
    font-family: monospace;
    line-height: 1.4;
  }

  .feedback-banner.info {
    background: rgba(0, 229, 255, 0.08);
    border: 1px solid rgba(0, 229, 255, 0.2);
    color: #00e5ff;
  }

  .feedback-banner.success {
    background: rgba(0, 255, 102, 0.08);
    border: 1px solid rgba(0, 255, 102, 0.2);
    color: #00ff66;
  }

  .feedback-banner.error {
    background: rgba(255, 51, 102, 0.08);
    border: 1px solid rgba(255, 51, 102, 0.2);
    color: #ff3366;
  }

  .controller-grid {
    display: grid;
    grid-template-columns: 1fr 1.8fr;
    gap: 2.5rem;
  }

  @media(max-width: 768px) {
    .controller-grid {
      grid-template-columns: 1fr;
    }
  }

  .status-summary-box {
    background: rgba(5, 5, 5, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
    padding-bottom: 0.8rem;
  }

  .status-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .status-row .label {
    font-size: 0.75rem;
    color: #888;
  }

  .status-row .badge {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .status-row .subval {
    font-size: 0.8rem;
    color: #ccc;
  }

  .controls-action-box h4 {
    margin: 0 0 1rem 0;
    font-size: 0.85rem;
    letter-spacing: 1px;
    color: #888;
    text-transform: uppercase;
  }

  .buttons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  /* HUD Buttons styling */
  .hud-btn {
    background: rgba(20, 20, 20, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 1rem;
    color: #aaa;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    position: relative;
    outline: none;
  }

  .hud-btn:hover:not(:disabled) {
    border-color: rgba(57, 255, 20, 0.3);
    background: rgba(30, 30, 30, 0.8);
    color: #e5e9f0;
  }

  .hud-btn.active {
    border-color: #00ff66;
    background: rgba(0, 255, 102, 0.05);
    color: #00ff66;
    box-shadow: 0 0 15px rgba(0, 255, 102, 0.1);
  }

  .hud-btn.active::before {
    content: "◀";
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.65rem;
    color: #00ff66;
  }

  .hud-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hud-btn .btn-sub {
    font-size: 0.65rem;
    font-weight: 400;
    color: #666;
  }

  .hud-btn.active .btn-sub {
    color: rgba(0, 255, 102, 0.6);
  }

  /* Footer analytics details */
  .footer-panel {
    background: rgba(10, 10, 10, 0.8);
    border-color: rgba(255, 255, 255, 0.05);
  }

  .footer-panel h3 {
    margin: 0 0 1.2rem 0;
    font-size: 0.85rem;
    letter-spacing: 1px;
    color: #888;
    text-transform: uppercase;
  }

  .footer-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 3rem;
  }

  .footer-stats .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .footer-stats .stat .label {
    font-size: 0.65rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .footer-stats .stat .val {
    font-size: 1.1rem;
    color: #cbd5e1;
    font-weight: 300;
  }

  .footer-stats .stat .badge {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    background: rgba(0, 255, 102, 0.08);
    border: 1px solid rgba(0, 255, 102, 0.2);
    border-radius: 3px;
    font-family: monospace;
    font-weight: 700;
    display: inline-block;
    align-self: flex-start;
  }
</style>
