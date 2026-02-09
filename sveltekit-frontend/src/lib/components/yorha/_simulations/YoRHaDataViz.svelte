<!-- YoRHa Data Visualization Component -->
<script lang="ts">

  interface DataPoint {
    label: string;
	value: number;
    color?: string;
    status?: 'active' | 'pending' | 'completed' | 'failed';
  }

  interface ChartProps {
    title?: string;
    data?: DataPoint[];
    type?: 'bar' | 'progress' | 'status' | 'timeline';
    height?: number;
    showGrid?: boolean;
    animated?: boolean;
  }

  let {
    title = "Data Analysis",
    data = [],
    type = 'bar',
    height = 300,
    showGrid = true,
    animated = true
  }: ChartProps = $props();

  let chartRef = $state<HTMLDivElement | null>(null);
  let isVisible = $state(false);

  $effect(() => {
    if (!chartRef) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            isVisible = true;
          }
        });
      },
	{ threshold: 0.3 }
    );
    observer.observe(chartRef);
    return () => observer.disconnect();
  });

  // Calculate max value for scaling using $derived
  let maxValue = $derived(data.length > 0 ? Math.max(...data.map(d => d.value)) : 100);

  // Helper for safe reduce/map operations
  let totalValue = $derived(data.reduce((sum, item) => sum + item.value, 0));
  let avgValue = $derived(data.length > 0 ? totalValue / data.length : 0);

  // Status colors mapping
  const statusColors = {
    active: 'var(--yorha-accent, #00ff41)',
    pending: 'var(--yorha-warning, #ffaa00)',
    completed: 'var(--yorha-secondary, #ffd700)',
    failed: 'var(--yorha-danger, #ff0041)'
  };

  function getBarHeight(value: number): number {
    if (maxValue === 0) return 0;
    return (value / maxValue) * 100;
  }

  function getStatusColor(item: DataPoint): string {
    if (item.color) return item.color;
    if (item.status && statusColors[item.status]) return statusColors[item.status];
    return 'var(--yorha-secondary, #ffd700)';
  }
</script>

<div class="yorha-dataviz" bind:this={chartRef}>
  {#if title}
    <div class="chart-header">
      <h3 class="chart-title">{title}</h3>
      <div class="chart-indicators">
        <div class="indicator">
          <div class="indicator-dot"></div>
          <span>LIVE DATA</span>
        </div>
      </div>
    </div>
  {/if}

  <div class="chart-container" style="height: {height}px">
    {#if showGrid && type === 'bar'}
      <div class="grid-overlay">
        {#each Array(5) as _, i}
          <div class="grid-line" style="bottom: {i * 25}%"></div>
        {/each}
        <div class="grid-labels">
          {#each Array(6) as _, i}
            <div class="grid-label" style="bottom: {i * 20}%">
              {Math.round((maxValue / 5) * i)}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="chart-content {type}">
      {#if type === 'bar'}
        <div class="bar-chart">
          {#each data as item, index}
            <div class="bar-container">
              <div
                class="bar"
                class:animated={animated && isVisible}
                style="height: {getBarHeight(item.value)}%; background: {getStatusColor(item)}; animation-delay: {index * 100}ms;"
              >
                <div class="bar-value">{item.value}</div>
                <div class="bar-glow" style="background: {getStatusColor(item)}"></div>
              </div>
              <div class="bar-label" title={item.label}>{item.label}</div>
            </div>
          {/each}
        </div>
      {:else if type === 'progress'}
        <div class="progress-chart">
          {#each data as item, index}
            <div class="progress-item">
              <div class="progress-header">
                <span class="progress-label">{item.label}</span>
                <span class="progress-value">{item.value}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-track"></div>
                <div
                  class="progress-fill"
                  class:animated={animated && isVisible}
                  style="width: {item.value}%; background: {getStatusColor(item)}; animation-delay: {index * 200}ms;"
                >
                  <div class="progress-glow"></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else if type === 'status'}
        <div class="status-chart">
          {#each data as item, index}
            <div
              class="status-item"
              class:animated={animated && isVisible}
              style="animation-delay: {index * 150}ms;"
            >
              <div class="status-indicator" style="color: {getStatusColor(item)}">
                <div class="indicator-pulse" style="background: currentColor;"></div>
              </div>
              <div class="status-content">
                <div class="status-label">{item.label}</div>
                <div class="status-value">{item.value}</div>
                {#if item.status}
                  <div class="status-badge {item.status}">
                    {item.status.toUpperCase()}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else if type === 'timeline'}
        <div class="timeline-chart">
          <div class="timeline-axis"></div>
          {#each data as item, index}
            <div
              class="timeline-item"
              class:animated={animated && isVisible}
              style="left: {(item.value / maxValue) * 100}%; animation-delay: {index * 100}ms;"
            >
              <div class="timeline-node" style="background: {getStatusColor(item)}">
                <div class="node-pulse"></div>
              </div>
              <div class="timeline-label">{item.label}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="chart-footer">
    <div class="summary-stats">
      <div class="stat">
        <span class="stat-label">TOTAL</span>
        <span class="stat-value">{totalValue}</span>
      </div>
      <div class="stat">
        <span class="stat-label">AVG</span>
        <span class="stat-value">{Math.round(avgValue)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">MAX</span>
        <span class="stat-value">{maxValue}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .yorha-dataviz {
    background: var(--yorha-bg-secondary, #1a1a1a);
    border: 2px solid var(--yorha-text-muted, #808080);
    font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
    color: var(--yorha-text-primary, #e0e0e0);
    overflow: hidden;
	width: 100%;
    margin-bottom: 1rem;
  }

  .chart-header {
    background: var(--yorha-bg-tertiary, #2a2a2a);
    border-bottom: 2px solid var(--yorha-secondary, #ffd700);
    display: flex;
    align-items: center;
    justify-content: space-between;
	padding: 12px 16px;
  }

  .chart-title {
    color: var(--yorha-secondary, #ffd700);
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
	margin: 0;
  }

  .chart-indicators {
    display: flex;
	gap: 12px;
  }

  .indicator {
    display: flex;
    align-items: center;
	gap: 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
	color: var(--yorha-accent, #00ff41);
  }

  .indicator-dot {
    width: 6px;
	height: 6px;
    background: currentColor;
	animation: pulse 2s infinite;
  }

  .chart-container {
    position: relative;
	padding: 16px;
    overflow: hidden;
  }

  /* Grid System */
  .grid-overlay {
    position: absolute;
	top: 16px;
    left: 60px;
	right: 16px;
    bottom: 40px;
    pointer-events: none;
  }

  .grid-line {
    position: absolute;
	left: 0;
    right: 0;
	height: 1px;
    background: var(--yorha-text-muted, #808080);
    opacity: 0.3;
  }

  .grid-labels {
    position: absolute;
	left: -50px;
    top: 0;
	bottom: 0;
    width: 40px;
  }

  .grid-label {
    position: absolute;
	right: 0;
    font-size: 10px;
	color: var(--yorha-text-muted, #808080);
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1;
	transform: translateY(50%);
  }

  /* Bar Chart */
  .bar-chart {
    display: flex;
    align-items: flex-end;
	gap: 12px;
    height: 100%;
	padding: 0 0 24px 60px;
  }

  .bar-container {
    flex: 1;
	display: flex;
    flex-direction: column;
    align-items: center;
	height: 100%;
    justify-content: flex-end;
    min-width: 0;
  }

  .bar {
    position: relative;
	width: 100%;
    max-width: 40px;
	transition:all 0.3s ease;
    transform-origin: bottom;
	transform: scaleY(0);
  }

  .bar.animated {
    animation: barGrow 0.8s ease-out forwards;
  }

  .bar:hover {
    filter: brightness(1.2);
  }

  .bar-value {
    position: absolute;
	top: -20px;
    left: 50%;
	transform: translateX(-50%);
    font-size: 10px;
    font-weight: 600;
	color: var(--yorha-text-primary, #e0e0e0);
    opacity: 0;
	transition:opacity 0.2s;
  }

  .bar:hover .bar-value {
    opacity: 1;
  }

  .bar-glow {
    position: absolute;
	top: 0;
    left: 0;
	right: 0;
    bottom: 0;
	opacity: 0.3;
    filter: blur(4px);
  }

  .bar-label {
    margin-top: 8px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-align: center;
	width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Progress Chart */
  .progress-chart {
    display: flex;
    flex-direction: column;
	gap: 16px;
    padding: 16px;
	height: 100%;
    overflow-y: auto;
  }

  .progress-item {
    display: flex;
    flex-direction: column;
	gap: 8px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .progress-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .progress-value {
    font-size: 12px;
    font-weight: 700;
	color: var(--yorha-secondary, #ffd700);
  }

  .progress-bar {
    position: relative;
	height: 12px;
    background: var(--yorha-bg-primary, #0a0a0a);
    border: 1px solid var(--yorha-text-muted, #808080);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
	position: relative;
    width: 0;
	transition:width 0.3s ease;
  }

  .progress-fill.animated {
    animation: progressFill 1s ease-out forwards;
  }

  .progress-glow {
    position: absolute;
	top: 0;
    right: -10px;
	width: 20px;
    height: 100%;
	background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4));
  }

  /* Status Chart */
  .status-chart {
    display: flex;
    flex-direction: column;
	gap: 12px;
    padding: 16px;
	height: 100%;
    overflow-y: auto;
  }

  .status-item {
    display: flex;
    align-items: center;
	gap: 12px;
    padding: 12px;
	background: var(--yorha-bg-primary, #0a0a0a);
    border: 1px solid var(--yorha-text-muted, #808080);
    transition:all 0.3s ease;
    opacity: 0;
	transform: translateX(-20px);
  }

  .status-item.animated {
    animation: slideIn 0.6s ease-out forwards;
  }

  .status-item:hover {
    border-color: var(--yorha-secondary, #ffd700);
    transform: translateX(4px);
  }

  .status-indicator {
    position: relative;
	width: 16px;
    height: 16px;
    flex-shrink: 0;
	background: currentColor;
    border-radius: 50%;
  }

  .indicator-pulse {
    position: absolute;
	inset: -4px;
    border-radius: 50%;
	opacity: 0.3;
    animation: pulse 2s infinite;
  }

  .status-content {
    flex: 1;
	display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 700;
	padding: 2px 8px;
    border: 1px solid currentColor;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .status-badge.active { color: var(--yorha-accent, #00ff41); border-color: var(--yorha-accent, #00ff41); }
  .status-badge.pending { color: var(--yorha-warning, #ffaa00); border-color: var(--yorha-warning, #ffaa00); }
  .status-badge.completed { color: var(--yorha-secondary, #ffd700); border-color: var(--yorha-secondary, #ffd700); }
  .status-badge.failed { color: var(--yorha-danger, #ff0041); border-color: var(--yorha-danger, #ff0041); }

  /* Timeline Chart */
  .timeline-chart {
    position: relative;
	height: 100%;
    padding: 40px 16px;
  }

  .timeline-axis {
    position: absolute;
	top: 50%;
    left: 16px;
	right: 16px;
    height: 2px;
	background: var(--yorha-text-muted, #808080);
    transform: translateY(-50%);
  }

  .timeline-item {
    position: absolute;
	top: 50%;
    transform: translate(-50%, -50%) translateY(10px);
    opacity: 0;
  }

  .timeline-item.animated {
    animation: fadeInUp 0.8s ease-out forwards;
  }

  .timeline-node {
    width: 12px;
	height: 12px;
    position: relative;
	margin: 0 auto 8px;
    transform: rotate(45deg);
	border: 2px solid var(--yorha-bg-primary, #0a0a0a);
  }

  .node-pulse {
    position: absolute;
	inset: -4px;
    background: currentColor;
	opacity: 0.3;
    animation: pulse 2s infinite;
  }

  .timeline-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-align: center;
    white-space: nowrap;
	position: absolute;
    top: 20px;
	left: 50%;
    transform: translateX(-50%);
  }

  /* Chart Footer */
  .chart-footer {
    background: var(--yorha-bg-primary, #0a0a0a);
    border-top: 1px solid var(--yorha-text-muted, #808080);
    padding: 12px 16px;
  }

  .summary-stats {
    display: flex;
	gap: 24px;
  }

  .stat {
    display: flex;
    flex-direction: column;
	gap: 2px;
  }

  .stat-label {
    font-size: 10px;
    font-weight: 600;
	color: var(--yorha-text-muted, #808080);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .stat-value {
    font-size: 12px;
    font-weight: 700;
	color: var(--yorha-secondary, #ffd700);
  }

  /* Animations */
  @keyframes barGrow {
    from { transform: scaleY(0); }
    to { transform: scaleY(1); }
  }

  @keyframes progressFill {
    from { width: 0; }
    to { width: 100%; } /* fallback */
  }

  @keyframes slideIn {
    from { transform: translateX(-20px);
	opacity: 0; }
    to { transform: translateX(0);
	opacity: 1; }
  }

  @keyframes fadeInUp {
    from { transform: translate(-50%, -50%) translateY(10px), opacity: 0; }
    to { transform: translate(-50%, -50%) translateY(0), opacity: 1; }
  }

  @keyframes pulse {
    0% { opacity: 0.3; }
    50% { opacity: 0.1; }
    100% { opacity: 0.3; }
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .chart-header {
      padding: 8px 12px;
    }

    .chart-title {
      font-size: 12px;
    }

    .bar-chart {
      padding: 0 0 30px 40px;
      gap: 8px;
    }

    .summary-stats {
      gap: 16px;
    }
  }
</style>






