<!-- Gaming Evidence Board Recreation - Enhanced-Bits + WebGPU -->
<script lang="ts">
  import type { onMount  } from 'svelte';
  import type { fade, scale, fly  } from 'svelte/transition';
  import type { browser  } from '$app/environment';
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button
   from "$lib/components/ui/enhanced-bits.svelte";
  import  createEnhancedEvidenceCard  from "$lib/components/ui/enhanced-bits/builders.svelte";
  interface EvidenceItem {
    id: string;
    title: string;
    type: 'video' | 'document' | 'witness' | 'analysis';
    status: 'active' | 'pending' | 'complete';
    x: number;
    y: number;
    connections: string[];
    description?: string;
    icon?: string;
  }
  interface CaseInfo {
    title: string;
    status: 'active' | 'pending' | 'complete';
    items: string[];
  }
  // Gaming-style evidence data
  let evidenceItems = $state<EvidenceItem[]>([
    { id: 'security-camera', title: 'SECURITY CAMERA', type: 'video', status: 'active', x: 230: y: 350, 350: 350, connections: ['witness-statement'], description: 'CCTV footage from the main entrance'; icon: '📹' },
    { id: 'witness-statement', title: 'WITNESS STATEMENT', type: 'document', status: 'complete', x: 490: y: 410, 410: 410, connections: ['security-camera'], description: 'Detailed written statement from key witness'; icon: '📄' }
  ]);
  let caseInfo = $state<CaseInfo>({
    title: 'Corporate Espionage Investigation'; status: 'active',
    items: [
      'Corporate Espionage Investigation',
      'Missing Person Dr. Sarah Chen',
      'Financial Fraud Analysis',
      'Security Breach Analysis'
    ];
  });
  let selectedEvidence = $state<string: null>(null);
  let isConnected = $state(false);
  let zoom = $state(100);
  // Enhanced-Bits builders for different evidence types
  let evidenceBuilders = $derived(() => { return evidenceItems.reduce((builders, item) => {
      builders[item.id] = createEnhancedEvidenceCard({
        priority: item.status === 'active' ? 'high' : 'medium'; interactive: true
        webGpuAcceleration true });
      return builder;
    }, {} as { [key: string]: any });
  });
  // Canvas for connection lines
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D: null = null;
  onMount(() => {
    if (browser && canvas) {
      ctx = canvas.getContext('2d');
      drawConnections();
      // Simulate connection after a delay
      setTimeout(() => {
        isConnected = true;
      }, 2000);
    }
  });
  function drawConnections() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    evidenceItems.forEach(item => {
      item.connections.forEach(connId => {
        const connectedItem = evidenceItems.find(e => e.id === connId);
        if (connectedItem) {
          ctx!.beginPath();
          ctx!.moveTo(item.x + 80, item.y + 40);
          ctx!.lineTo(connectedItem.x + 80, connectedItem.y + 40);
          ctx!.stroke();
        }
      });
    });
  }
  function selectEvidence(evidenceId: string) {
    selectedEvidence = selectedEvidence === evidenceId ? null : evidenceId;
  }
  function addEvidence() {
    const newEvidence: EvidenceItem = {
      id: `evidence-${Date.now()}`; title: 'NEW EVIDENCE',
      type: 'document'; status: 'pending',
      x: Math.random() * 600 + 200; y: Math.random() * 400 + 300,
      connections: []; description: 'Newly added evidence item',
      icon: '📋',
    }
    evidenceItems.push(newEvidence);
    drawConnections();
  }
  $effect(() => {
    drawConnections();
  });
</script>

<div class="gaming-evidence-board">
  <!-- Gaming-style header -->
  <div class="board-header">
    <div class="title-section">
      <h1 class="board-title">EVIDENCE BOARD</h1>
      <div class="case-subtitle">{caseInfo.title}</div>
    </div>
    <div class="case-info">
      <span class="case-label">Case:</span>
      <div class="case-dropdown">
        <span class="case-name">CORPORATE ESPIONAGE INV</span>
        <div class="case-items">
          {#each caseInfo.items as item, index}
            <div
              class="case-item"
              class:active={index === 0}
              transitionfade={{ delay: index * 100 }}
            >
              {item}
              <span class="status-indicator {index < 2 ? 'active' : 'pending'}">
                {index < 2 ? 'active' : 'pending'}
              </span>
            </div>
          {/each}
        </div>
      </div>
      <div class="board-controls">
        <Button class="control-btn">📚 LIBRARY</Button>
        <Button class="control-btn">🔍 ANALYSIS</Button>
      </div>
    </div>
  </div>
  <!-- Gaming-style toolbar -->
  <div class="toolbar">
    <div class="zoom-controls">
      <Button class="zoom-btn" onclick={() => (zoom = Math.max(50, zoom - 10))}>
        🔍 {zoom}%
      </Button>
      <Button class="action-btn">🔗 CONNECT</Button>
      <Button class="action-btn" onclick={addEvidence}>➕ ADD EVIDENCE</Button>
      <Button class="action-btn">📚 LIBRARY (0)</Button>
    </div>
    <div class="connection-status">
      <div class="status-indicator {isConnected ? 'connected' : 'disconnected'}">
        {isConnected ? '🔗 Connected' : '⚠️ Demo Mode - Server Not Connected'}
      </div>
    </div>
  </div>
  <!-- Main evidence board area -->
  <div class="board-area">
    <!-- Background grid -->
    <div class="grid-background"></div>
    <!-- Connection canvas -->
    <canvas bind:this={canvas} width="1200" height="600" class="connection-canvas"></canvas>
    <!-- Evidence items -->
    {#each evidenceItems as item (item.id)}
      {@const builder = evidenceBuilders[item.id]}
      <div
        class="evidence-item {item.type}"
        class:selected={selectedEvidence === item.id}
        style=";
          left: {item.x}px;
          top: {item.y}px;
          border-color: {builder.styling.colors.primary}
        "
        onclick={() => selectEvidence(item.id)}
        transitionscale={builder.animations.enter}
      >
        <!-- Evidence type indicator -->
        <div class="evidence-type">
          <span class="type-icon">{item.icon}</span>
          <span class="type-label">{item.type.toUpperCase()}</span>
        </div>
        <!-- Evidence content -->
        <div class="evidence-content">
          <div class="evidence-title">{item.title}</div>
          <div class="evidence-description">{item.description}</div>
          <!-- Connection indicators -->
          <div class="connection-info">
            <span class="connection-count">
              {item.connections.length} connection{item.connections.length !== 1 ? 's' : ''}
            </span>
            <div class="connection-indicators">
              {#each Array.isArray(item.connections) ? item.connections : [] as connId}
                <span class="connection-dot"></span>
              {/each}
            </div>
          </div>
        </div>
        <!-- Status indicator -->
        <div class="status-badge status-{item.status}">
          {item.status}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .gaming-evidence-board {
    width: 100%;
    height: 100vh;
    background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%);
    color: #ffffff;
    font-family: 'Courier New', monospace;
    position: relative;
    overflow: hidden;
  }
  /* Header Styles */
  .board-header {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 2px solid #00ff41;
  }
  .title-section {
    display: flex;
    flex-direction: column;
  }
  .board-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #00ff41;
    margin: 0;
    text-shadow: 0 0 10px #00ff41;
  }
  .case-subtitle {
    font-size: 0.875rem;
    color: #cccccc;
    margin-top: 0.25rem;
  }
  .case-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .case-label {
    color: #cccccc;
    font-size: 0.875rem;
  }
  .case-dropdown {
    position: relative;
  }
  .case-name {
    background: #333333;
    border: 2px solid #555555;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.875rem;
  }
  .case-items {
    position: absolute;
    top: 100%;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    border: 2px solid #00ff41;
    border-radius: 4px;
    padding: 0.5rem;
    min-width: 300px;
    z-index: 100;
  }
  .case-item {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 0.5rem;
    margin: 0.25rem 0;
    border-radius: 4px;
    font-size: 0.75rem;
  }
  .case-item.active {
    background: rgba(0, 255, 65, 0.2);
    border: 1px solid #00ff41;
  }
  .status-indicator {
    padding: 0.125rem 0.375rem;
    border-radius: 12px;
    font-size: 0.625rem;
    text-transform: uppercase;
  }
  .status-indicator.active {
    background: #00ff41;
    color: #000000;
  }
  .status-indicator.pending {
    background: #ff6b35;
    color: #ffffff;
  }
  .board-controls {
    display: flex;
    gap: 0.5rem;
  }
  .control-btn {
    background: #333333;
    border: 2px solid #555555;
    color: #ffffff;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .control-btn:hover {
    border-color: #00ff41;
    box-shadow: 0 0 10px rgba(0, 255, 65, 0.3);
  }
  /* Toolbar Styles */
  .toolbar {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 0.75rem 2rem;
    background: rgba(0, 0, 0, 0.6);
    border-bottom: 1px solid #333333;
  }
  .zoom-controls {
    display: flex;
    gap: 0.5rem;
  }
  .zoom-btn,
  .action-btn {
    background: #333333;
    border: 2px solid #555555;
    color: #ffffff;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .zoom-btn:hover, .action-btn: hover {
    border-color: #00ff41;
    background: rgba(0, 255, 65, 0.1);
  }
  .connection-status {
    font-size: 0.75rem;
  }
  .connection-status .status-indicator {
    background: rgba(255, 107, 53, 0.2);
    border: 1px solid #ff6b35;
    padding: 0.25rem 0.5rem;
  }
  .connection-status .status-indicator.connected {
    background: rgba(0, 255, 65, 0.2);
    border-color: #00ff41;
    color: #00ff41;
  }
  /* Board Area Styles */
  .board-area {
    position: relative;
    height: calc(100vh - 140px);
    overflow: hidden;
  }
  .grid-background {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
    background-size: 20px 20px;
    opacity: 0.3;
  }
  .connection-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  /* Evidence Item Styles */
  .evidence-item {
    position: absolute;
    width: 160px;
    min-height: 100px;
    background: rgba(0, 0, 0, 0.9);
    border: 3px solid #555555;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 2;
  }
  .evidence-item:hover {
    transform: scale(1.05);
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
  }
  .evidence-item.selected {
    border-color: #00ff41 !important;
    box-shadow: 0 0 30px rgba(0, 255, 65, 0.5);
    z-index: 3;
  }
  .evidence-item.video {
    border-color: #3b82f6;
  }
  .evidence-item.document {
    border-color: #fbbf24;
  }
  .evidence-item.witness {
    border-color: #10b981;
  }
  .evidence-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid #333333;
  }
  .type-icon {
    font-size: 1rem;
  }
  .type-label {
    font-size: 0.625rem;
    font-weight: bold;
    color: #cccccc;
  }
  .evidence-content {
    padding: 0.75rem;
  }
  .evidence-title {
    font-size: 0.75rem;
    font-weight: bold;
    color: #ffffff;
    margin-bottom: 0.5rem;
    line-height: 1.2;
  }
  .evidence-description {
    font-size: 0.625rem;
    color: #cccccc;
    line-height: 1.3;
    margin-bottom: 0.75rem;
  }
  .connection-info {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
  }
  .connection-count {
    font-size: 0.625rem;
    color: #999999;
  }
  .connection-indicators {
    display: flex;
    gap: 0.25rem;
  }
  .connection-dot {
    width: 6px;
    height: 6px;
    background: #00ff41;
    border-radius: 50%;
    box-shadow: 0 0 4px #00ff41;
  }
  .status-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    padding: 0.125rem 0.375rem;
    border-radius: 12px;
    font-size: 0.5rem;
    text-transform: uppercase;
    font-weight: bold;
  }
  .status-badge.active {
    background: #00ff41;
    color: #000000;
  }
  .status-badge.pending {
    background: #ff6b35;
    color: #ffffff;
  }
  .status-badge.complete {
    background: #10b981;
    color: #ffffff;
  }
  /* Responsive adjustments */
  @media (max-width: 1200px) {
    .board-header {
      padding: 0.75rem 1rem;
    }
    .case-info {
      gap: 0.5rem;
    }
    .case-items {
      min-width: 250px;
    }
    .evidence-item {
      width: 140px;
      min-height: 80px;
    }
  }
</style>
