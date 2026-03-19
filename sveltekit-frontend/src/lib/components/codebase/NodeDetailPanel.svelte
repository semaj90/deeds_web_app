<script lang="ts">
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * Node Detail Panel Component
   * ═══════════════════════════════════════════════════════════════════════
   * Task: 13.3 - Add node interaction handlers
   * Purpose: Display detailed metadata for selected graph nodes
   */
  import Icon from '$lib/components/ui/Icon.svelte';

  interface GraphNode {
    id: string;
	label: string;
    type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
    errorCount: number;
	filePath: string;
    cluster?: string;
    imports?: string[];
    exports?: string[];
    functions?: string[];
  }

  interface Props {
    node: GraphNode | null;
    onClose?: () => void;
    onViewErrors?: (filePath: string) => void;
    onViewFile?: (filePath: string) => void;
  }

  let {
    node = null,
    onClose = () => {},
	onViewErrors = () => {},
	onViewFile = () => {}
  }: Props = $props();

  // Type colors
  const typeColors: Record<string, string> = {
    route: 'bg-info/20 text-info/60 border-info/30',
    component: 'bg-info/20 text-info/60 border-info/30',
    store: 'bg-accent/20 text-accent/80 border-accent/30',
    service: 'bg-warning/20 text-warning/80 border-warning/30',
    api: 'bg-info/20 text-info/80 border-info/30',
    util: 'bg-sand/20 text-sand/40 border-sand/30'
  };

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'route':
        return 'git-branch';
      case 'component':
        return 'code';
      case 'store':
        return 'layers';
      default:return 'file-code';
    }
  }
</script>

{#if node}
  <div class="node-detail-panel">
    <header class="panel-header">
      <div class="header-content">
        <span class="type-badge {typeColors[node.type] || typeColors.util}">
          {node.type}
        </span>
        <h3 class="node-name">{node.label}</h3>
      </div>
      <button class="close-btn" onclick={onClose}>
        <Icon name="x" class="h-4 w-4" />
      </button>
    </header>

    <div class="panel-content">
      <!-- File Path -->
      <div class="detail-section">
        <span class="section-label">File Path</span>
        <button class="file-path" onclick={() => onViewFile(node.filePath)}>
          <Icon name="file-code" class="h-4 w-4" />
          <span>{node.filePath}</span>
        </button>
      </div>

      <!-- Error Count -->
      {#if node.errorCount > 0}
        <div class="detail-section">
          <span class="section-label">Errors</span>
          <button class="error-badge" onclick={() => onViewErrors(node.filePath)}>
            <Icon name="triangle-alert" class="h-4 w-4" />
            <span>{node.errorCount} error{node.errorCount !== 1 ? 's' : ''}</span>
            <span class="view-link">View →</span>
          </button>
        </div>
      {/if}

      <!-- Cluster -->
      {#if node.cluster}
        <div class="detail-section">
          <span class="section-label">Cluster</span>
          <div class="cluster-badge">
            <Icon name="layers" class="h-4 w-4" />
            <span>{node.cluster}</span>
          </div>
        </div>
      {/if}

      <!-- Imports -->
      {#if node.imports && node.imports.length > 0}
        <div class="detail-section">
          <span class="section-label">Imports ({node.imports.length})</span>
          <div class="list-container">
            {#each node.imports.slice(0, 5) as importItem}
              <div class="list-item">{importItem}</div>
            {/each}
            {#if node.imports.length > 5}
              <div class="list-more">+{node.imports.length - 5} more</div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Exports -->
      {#if node.exports && node.exports.length > 0}
        <div class="detail-section">
          <span class="section-label">Exports ({node.exports.length})</span>
          <div class="list-container">
            {#each node.exports.slice(0, 5) as exportItem}
              <div class="list-item export">{exportItem}</div>
            {/each}
            {#if node.exports.length > 5}
              <div class="list-more">+{node.exports.length - 5} more</div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Functions -->
      {#if node.functions && node.functions.length > 0}
        <div class="detail-section">
          <span class="section-label">Functions ({node.functions.length})</span>
          <div class="list-container">
            {#each node.functions.slice(0, 5) as funcItem}
              <div class="list-item function">{funcItem}()</div>
            {/each}
            {#if node.functions.length > 5}
              <div class="list-more">+{node.functions.length - 5} more</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .node-detail-panel {
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
	overflow: hidden;
    min-width: 280px;
    max-width: 350px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
	padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-content {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
  }

  .type-badge {
    font-size: 0.7rem;
    font-weight: 500;
	padding: 0.2rem 0.5rem;
    border-radius: 4px;
	border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.05em;
	width: fit-content;
  }

  .node-name {
    font-size: 1rem;
    font-weight: 600;
	color: white;
    margin: 0;
  }

  .close-btn {
    background: transparent;
	border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
	padding: 0.25rem;
    border-radius: 4px;
	transition:all 0.2s ease;
  }

  .close-btn:hover {
    color: white;
	background: rgba(255, 255, 255, 0.1);
  }

  .panel-content {
    padding: 1rem;
	display: flex;
    flex-direction: column;
	gap: 1rem;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
  }

  .section-label {
    font-size: 0.7rem;
    font-weight: 500;
	color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .file-path {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    padding: 0.5rem;
	background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
	color: rgba(255, 255, 255, 0.8);
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
	transition:all 0.2s ease;
    text-align: left;
  }

  .file-path:hover {
    background: rgba(0, 212, 255, 0.1);
    border-color: rgba(0, 212, 255, 0.3);
  }

  .file-path span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-badge {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    padding: 0.5rem;
	background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
	color: #f87171;
    font-size: 0.875rem;
	cursor: pointer;
    transition:all 0.2s ease;
  }

  .error-badge:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .view-link {
    margin-left: auto;
    font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.5);
  }

  .cluster-badge {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    padding: 0.5rem;
	background: rgba(168, 85, 247, 0.1);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 6px;
	color: #c084fc;
    font-size: 0.875rem;
  }

  .list-container {
    display: flex;
    flex-direction: column;
	gap: 0.25rem;
  }

  .list-item {
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.7);
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
	overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item.export {
    color: #4ade80;
  }

  .list-item.function {
    color: #60a5fa;
  }

  .list-more {
    font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.4);
    padding: 0.25rem 0.5rem;
  }
</style>
