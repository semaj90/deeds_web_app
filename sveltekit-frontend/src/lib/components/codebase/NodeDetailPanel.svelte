<script lang="ts">
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
    lineCount?: number;
    fileSize?: number;
    complexity?: number;
    classCount?: number;
    importCount?: number;
    exportCount?: number;
  }

  interface AiAnalysis {
    summary?: string;
    risks?: string[];
    dependencies?: { import: string; role: string }[];
    suggestions?: string[];
    couplingScore?: number;
    complexityScore?: number;
    healthGrade?: string;
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

  // AI Analysis state
  let aiAnalysis = $state<AiAnalysis | null>(null);
  let aiLoading = $state(false);
  let aiError = $state('');
  let analysisExpanded = $state(false);

  // Related Files state (Qdrant semantic search)
  interface RelatedFile {
    filePath: string;
    score: number;
    symbol: string;
    kind: string;
    content: string;
    language: string;
  }
  let relatedFiles = $state<RelatedFile[]>([]);
  let relatedLoading = $state(false);
  let relatedError = $state('');
  let relatedFetched = $state(false);

  // Type colors
  const typeColors: Record<string, string> = {
    route: 'bg-info/20 text-info/60 border-info/30',
    component: 'bg-info/20 text-info/60 border-info/30',
    store: 'bg-accent/20 text-accent/80 border-accent/30',
    service: 'bg-warning/20 text-warning/80 border-warning/30',
    api: 'bg-info/20 text-info/80 border-info/30',
    util: 'bg-sand/20 text-sand/40 border-sand/30'
  };

  function gradeColor(grade: string): string {
    switch (grade) {
      case 'A': return '#4ade80';
      case 'B': return '#22c55e';
      case 'C': return '#fbbf24';
      case 'D': return '#f97316';
      case 'F': return '#ef4444';
      default: return 'rgba(255,255,255,0.5)';
    }
  }

  function complexityLabel(score: number): string {
    if (score < 0) return 'N/A';
    if (score <= 2) return 'Low';
    if (score <= 5) return 'Medium';
    if (score <= 7) return 'High';
    return 'Very High';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  async function analyzeWithAI() {
    if (!node || aiLoading) return;
    aiLoading = true;
    aiError = '';
    aiAnalysis = null;

    try {
      const res = await fetch('/api/codebase-index/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: node.filePath }),
      });

      const data = await res.json();
      if (!res.ok) {
        aiError = data.error ?? `HTTP ${res.status}`;
        // Still use the analysis if provided (503 fallback)
        if (data.analysis) aiAnalysis = data.analysis;
        return;
      }

      aiAnalysis = data.analysis;
      analysisExpanded = true;
    } catch (e) {
      aiError = 'Network error — is the dev server running?';
    } finally {
      aiLoading = false;
    }
  }

  async function fetchRelatedFiles() {
    if (!node || relatedLoading) return;
    relatedLoading = true;
    relatedError = '';
    relatedFiles = [];
    try {
      const res = await fetch('/api/codebase-index/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: node.filePath, limit: 6 }),
      });
      const data = await res.json();
      if (!res.ok) {
        relatedError = data.error ?? `HTTP ${res.status}`;
        return;
      }
      relatedFiles = data.related ?? [];
      relatedFetched = true;
    } catch {
      relatedError = 'Qdrant search unavailable';
    } finally {
      relatedLoading = false;
    }
  }

  function prosecuteCode() {
    if (!node) return;
    // Build a query string with the code quality issues to "prosecute"
    const issues: string[] = [];
    if ((node.complexity ?? 0) > 20) issues.push(`High complexity (${node.complexity} branches)`);
    if ((node.importCount ?? 0) > 15) issues.push(`High coupling (${node.importCount} imports)`);
    if ((node.lineCount ?? 0) > 500) issues.push(`Oversized file (${node.lineCount} lines)`);
    if (node.errorCount > 0) issues.push(`${node.errorCount} errors`);
    if (aiAnalysis?.healthGrade === 'D' || aiAnalysis?.healthGrade === 'F') {
      issues.push(`Health grade: ${aiAnalysis.healthGrade}`);
    }
    if (aiAnalysis?.risks) {
      issues.push(...aiAnalysis.risks.slice(0, 2));
    }
    const charge = issues.length > 0
      ? issues.join('; ')
      : 'Code quality review pending';
    // Navigate to simulation with pre-filled context
    const params = new URLSearchParams({
      mode: 'code-review',
      file: node.filePath,
      charge,
    });
    window.location.href = `/simulation?${params}`;
  }

  // Reset all state when node changes
  $effect(() => {
    if (node) {
      aiAnalysis = null;
      aiError = '';
      analysisExpanded = false;
      relatedFiles = [];
      relatedError = '';
      relatedFetched = false;
    }
  });
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

      <!-- Quick Stats (new: richer metadata) -->
      {#if node.lineCount || node.fileSize || node.complexity !== undefined}
        <div class="detail-section">
          <span class="section-label">Quick Stats</span>
          <div class="stats-grid">
            {#if node.lineCount}
              <div class="stat-chip">
                <span class="stat-val">{node.lineCount}</span>
                <span class="stat-lbl">lines</span>
              </div>
            {/if}
            {#if node.fileSize}
              <div class="stat-chip">
                <span class="stat-val">{formatSize(node.fileSize)}</span>
                <span class="stat-lbl">size</span>
              </div>
            {/if}
            {#if node.complexity !== undefined && node.complexity > 0}
              <div class="stat-chip" class:high-complexity={node.complexity > 20}>
                <span class="stat-val">{node.complexity}</span>
                <span class="stat-lbl">branches</span>
              </div>
            {/if}
            {#if node.importCount}
              <div class="stat-chip" class:high-coupling={node.importCount > 15}>
                <span class="stat-val">{node.importCount}</span>
                <span class="stat-lbl">imports</span>
              </div>
            {/if}
            {#if node.exportCount}
              <div class="stat-chip">
                <span class="stat-val">{node.exportCount}</span>
                <span class="stat-lbl">exports</span>
              </div>
            {/if}
            {#if node.classCount}
              <div class="stat-chip">
                <span class="stat-val">{node.classCount}</span>
                <span class="stat-lbl">classes</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Error Count -->
      {#if node.errorCount > 0}
        <div class="detail-section">
          <span class="section-label">Errors</span>
          <button class="error-badge" onclick={() => onViewErrors(node.filePath)}>
            <Icon name="triangle-alert" class="h-4 w-4" />
            <span>{node.errorCount} error{node.errorCount !== 1 ? 's' : ''}</span>
            <span class="view-link">View &rarr;</span>
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

      <!-- AI Analysis Button + Results -->
      <div class="detail-section">
        <span class="section-label">AI Analysis</span>
        {#if !aiAnalysis && !aiLoading}
          <button class="analyze-btn" onclick={analyzeWithAI} disabled={aiLoading}>
            <Icon name="sparkles" class="h-4 w-4" />
            <span>Analyze with LLM</span>
          </button>
        {/if}

        {#if aiLoading}
          <div class="ai-loading">
            <div class="ai-spinner"></div>
            <span>Analyzing with gemma4-legal...</span>
          </div>
        {/if}

        {#if aiError}
          <div class="ai-error">{aiError}</div>
        {/if}

        {#if aiAnalysis}
          <div class="ai-results" class:expanded={analysisExpanded}>
            <!-- Health Grade -->
            {#if aiAnalysis.healthGrade && aiAnalysis.healthGrade !== '?'}
              <div class="health-grade" style="--grade-color: {gradeColor(aiAnalysis.healthGrade)}">
                <span class="grade-letter">{aiAnalysis.healthGrade}</span>
                <div class="grade-scores">
                  {#if aiAnalysis.complexityScore !== undefined && aiAnalysis.complexityScore >= 0}
                    <span>Complexity: {complexityLabel(aiAnalysis.complexityScore)}</span>
                  {/if}
                  {#if aiAnalysis.couplingScore !== undefined && aiAnalysis.couplingScore >= 0}
                    <span>Coupling: {aiAnalysis.couplingScore}/10</span>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Summary -->
            {#if aiAnalysis.summary}
              <div class="ai-section">
                <p class="ai-summary">{aiAnalysis.summary}</p>
              </div>
            {/if}

            <!-- Risks -->
            {#if aiAnalysis.risks && aiAnalysis.risks.length > 0}
              <div class="ai-section">
                <span class="ai-section-label">Risks</span>
                {#each aiAnalysis.risks as risk}
                  <div class="ai-risk-item">
                    <Icon name="alert-triangle" class="h-3 w-3" />
                    <span>{risk}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Dependencies -->
            {#if aiAnalysis.dependencies && aiAnalysis.dependencies.length > 0}
              <div class="ai-section">
                <span class="ai-section-label">Key Dependencies</span>
                {#each aiAnalysis.dependencies as dep}
                  <div class="ai-dep-item">
                    <span class="dep-import">{dep.import}</span>
                    <span class="dep-role">{dep.role}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Suggestions -->
            {#if aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0}
              <div class="ai-section">
                <span class="ai-section-label">Suggestions</span>
                {#each aiAnalysis.suggestions as sug}
                  <div class="ai-sug-item">
                    <Icon name="lightbulb" class="h-3 w-3" />
                    <span>{sug}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Re-analyze button -->
            <button class="reanalyze-btn" onclick={analyzeWithAI} disabled={aiLoading}>
              <Icon name="refresh-cw" class="h-3 w-3" />
              Re-analyze
            </button>
          </div>
        {/if}
      </div>

      <!-- Related Files (Qdrant) -->
      <div class="detail-section">
        <span class="section-label">Related Files</span>
        {#if !relatedFetched && !relatedLoading}
          <button class="related-btn" onclick={fetchRelatedFiles}>
            <Icon name="search" class="h-4 w-4" />
            <span>Find Similar Files</span>
          </button>
        {/if}
        {#if relatedLoading}
          <div class="ai-loading">
            <div class="ai-spinner"></div>
            <span>Searching Qdrant...</span>
          </div>
        {/if}
        {#if relatedError}
          <div class="ai-error">{relatedError}</div>
        {/if}
        {#if relatedFiles.length > 0}
          <div class="related-list">
            {#each relatedFiles as rf}
              <button class="related-item" onclick={() => onViewFile(rf.filePath)} title={rf.filePath}>
                <div class="related-header">
                  <span class="related-path">{rf.filePath.split('/').pop()}</span>
                  <span class="related-score">{(rf.score * 100).toFixed(0)}%</span>
                </div>
                {#if rf.symbol}
                  <span class="related-symbol">{rf.kind}: {rf.symbol}</span>
                {/if}
              </button>
            {/each}
          </div>
        {:else if relatedFetched}
          <div class="related-empty">No semantically similar files found</div>
        {/if}
      </div>

      <!-- Prosecute Code (Courtroom Sim) -->
      <div class="detail-section">
        <button class="prosecute-btn" onclick={prosecuteCode}>
          <Icon name="scale" class="h-4 w-4" />
          <span>Prosecute This Code</span>
        </button>
      </div>

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
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: sticky;
    top: 0;
    z-index: 1;
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
    transition: all 0.2s ease;
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
    transition: all 0.2s ease;
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

  /* Quick Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }

  .stat-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.4rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  .stat-chip.high-complexity {
    border-color: rgba(249, 115, 22, 0.4);
    background: rgba(249, 115, 22, 0.08);
  }

  .stat-chip.high-coupling {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
  }

  .stat-val {
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.9);
  }

  .stat-lbl {
    font-size: 0.55rem;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    transition: all 0.2s ease;
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

  /* AI Analysis */
  .analyze-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(59, 130, 246, 0.15));
    border: 1px solid rgba(168, 85, 247, 0.35);
    border-radius: 6px;
    color: #c084fc;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .analyze-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(59, 130, 246, 0.25));
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.15);
  }

  .analyze-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ai-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(168, 85, 247, 0.05);
    border: 1px solid rgba(168, 85, 247, 0.15);
    border-radius: 6px;
    font-size: 0.75rem;
    color: rgba(168, 85, 247, 0.8);
  }

  .ai-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(168, 85, 247, 0.2);
    border-top-color: #a855f7;
    border-radius: 50%;
    animation: ai-spin 0.8s linear infinite;
  }

  @keyframes ai-spin { to { transform: rotate(360deg); } }

  .ai-error {
    font-size: 0.75rem;
    color: #f87171;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 4px;
  }

  .ai-results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(168, 85, 247, 0.04);
    border: 1px solid rgba(168, 85, 247, 0.15);
    border-radius: 8px;
  }

  /* Health Grade */
  .health-grade {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
  }

  .grade-letter {
    font-size: 1.5rem;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    color: var(--grade-color, #fff);
    text-shadow: 0 0 10px var(--grade-color, #fff);
    min-width: 2rem;
    text-align: center;
  }

  .grade-scores {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .ai-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .ai-section-label {
    font-size: 0.6rem;
    font-weight: 600;
    color: rgba(168, 85, 247, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ai-summary {
    font-size: 0.78rem;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;
  }

  .ai-risk-item, .ai-sug-item {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.72rem;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
  }

  .ai-risk-item {
    color: #fbbf24;
  }

  .ai-dep-item {
    display: flex;
    flex-direction: column;
    padding: 0.3rem 0.4rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .dep-import {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #60a5fa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dep-role {
    font-size: 0.62rem;
    color: rgba(255, 255, 255, 0.45);
  }

  .ai-sug-item {
    color: #4ade80;
  }

  .reanalyze-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.65rem;
    cursor: pointer;
    align-self: flex-end;
    transition: all 0.15s;
  }

  .reanalyze-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Lists */
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

  .list-item.export { color: #4ade80; }
  .list-item.function { color: #60a5fa; }

  .list-more {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.4);
    padding: 0.25rem 0.5rem;
  }

  /* Related Files */
  .related-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(6, 182, 212, 0.08);
    border: 1px solid rgba(6, 182, 212, 0.25);
    border-radius: 6px;
    color: #22d3ee;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .related-btn:hover {
    background: rgba(6, 182, 212, 0.15);
    border-color: rgba(6, 182, 212, 0.4);
  }

  .related-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .related-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: all 0.12s;
  }

  .related-item:hover {
    background: rgba(6, 182, 212, 0.08);
    border-color: rgba(6, 182, 212, 0.2);
  }

  .related-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .related-path {
    font-size: 0.72rem;
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .related-score {
    font-size: 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    color: #22d3ee;
    flex-shrink: 0;
  }

  .related-symbol {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.35);
    font-family: 'JetBrains Mono', monospace;
  }

  .related-empty {
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.3);
    padding: 0.5rem;
    text-align: center;
  }

  /* Prosecute Code */
  .prosecute-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(249, 115, 22, 0.12));
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #f87171;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
    justify-content: center;
    letter-spacing: 0.03em;
  }

  .prosecute-btn:hover {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.2));
    border-color: rgba(239, 68, 68, 0.5);
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);
    transform: translateY(-1px);
  }
</style>
