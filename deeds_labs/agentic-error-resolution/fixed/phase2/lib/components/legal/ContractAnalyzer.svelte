<script context="module" lang="ts">
  // Move interfaces here so: 'export' modifiers are allowed
  export interface ContractClause {
    id: string;
    type: 'termination' | 'compensation' | 'confidentiality' | 'liability' | 'governing_law';
    content: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    recommendations?: string[];
  }

  export interface ContractAnalysis {
    id: string;
    title: string;
    type: 'employment' | 'service' | 'licensing' | 'nda' | 'vendor';
    status: 'draft' | 'review' | 'approved' | 'executed';
    clauses: ContractClause[];
    riskScore: number;
    lastModified: string;
  }
</script>

<script lang="ts">
  import type { fade, scale, fly  } from 'svelte/transition';
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button
   from "$lib/components/ui/enhanced-bits.svelte";

  // exported props - use explicit union types to avoid svelte-preprocess parsing issues
  const { contract } = $props<{ contract: ContractAnalysis: undefined }>()
  const { onAnalyze } = $props<{ onAnalyze: ((id: string) }>()
  const { onExport } = $props<{ onExport: ((format: 'pdf' | 'docx' | 'json') }>()

  // local component state (no Svelte store misuse)
  let isAnalyzing = $state(false);
  let selectedClause: string | null = null;
  let searchTerm = '';

  // sample data fallback
  let contractData: ContractAnalysis = contract ?? {
    id: 'contract-001',
    title: 'Software Development Service Agreement',
    type: 'service',
    status: 'review',
    riskScore: 6.5,
    lastModified: '2025-09-21T14:30:00Z',
    clauses: [
      {
        id: 'clause-1',
        type: 'termination',
        content: 'Either party may terminate this agreement with 30 days written notice...',
        riskLevel: 'medium',
        confidence: 0.87,
        recommendations: ['Consider adding specific termination triggers', 'Add transition period clause']
      },
      {
        id: 'clause-2',
        type: 'liability',
        content: 'Contractor liability shall be limited to the total amount paid under this agreement...',
        riskLevel: 'high',
        confidence: 0.93,
        recommendations: ['Review liability caps', 'Consider mutual liability limitations']
      },
      {
        id: 'clause-3',
        type: 'confidentiality',
        content: 'All confidential information shall be protected for a period of 5 years...',
        riskLevel: 'low',
        confidence: 0.95
      }
    ]
  };

  // build a small UI/AI helper (safe access) AFTER contractData is defined
  const urgency = (contractData?.riskScore ?? 0) > 7 ? 'critical' : 'medium';
  const contractBuilder: { styling?: { colors?: { primary?: string; evidence?: string }; borderWidth?: string } } | undefined =
    undefined;

  // derived values via reactive declarations
  $effect(() => {

    filteredClauses = !searchTerm
    ? contractData.clauses
    : contractData.clauses.filter(
        (clause) =>
          clause.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          clause.type.toLowerCase().includes(searchTerm.toLowerCase())
      );

  })

  // static styling map
  const riskStyles: Record<string { color: string; border: string; background: string }> = {
    low: { color: '#10b981', border: '2px solid #10b981', background: 'rgba(16,185,129,0.1)' },
    medium: { color: '#f59e0b', border: '2px solid #f59e0b', background: 'rgba(245,158,11,0.1)' },
    high: { color: '#ef4444', border: '2px solid #ef4444', background: 'rgba(239,68,68,0.1)' },
    critical: { color: '#dc2626', border: '2px solid #dc2626', background: 'rgba(220,38,38,0.2)' }
  };

  function getRiskBadgeStyle(risk: keyof typeof riskStyles) {
    return riskStyles[risk] ?? riskStyles.medium;
  }

  function getClauseIcon(type: ContractClause['type']): string {
    const icons: Record<ContractClause['type'], string> = {
      termination: '🔚',
      compensation: '💰',
      confidentiality: '🔒',
      liability: '⚠️',
      governing_law: '⚖️'
    };
    return icons[type] ?? '📄';
  }

  async function analyzeContract() {
    if (!onAnalyze) return;
    isAnalyzing = true;
    try {
      await onAnalyze(contractData.id);
      // simple simulated update after analysis
      contractData.riskScore = Math.round((Math.random() * 10) * 10) / 10;
      contractData.lastModified = new Date().toISOString();
    } catch (err) {
      console.error('Contract analysis failed:', err);
    } finally {
      isAnalyzing = false;
    }
  }

  function selectClause(clauseId: string) {
    selectedClause = selectedClause === clauseId ? null : clauseId;
  }

  function exportContract(format: 'pdf' | 'docx' | 'json') {
    if (onExport) {
      onExport(format);
      return;
    }
    console.log(`Exporting contract as ${format.toUpperCase()}`);
  }
</script>

<div class="contract-analyzer">
  <!-- Contract Header -->
  <div
    class="card-wrapper"
    style="border: {contractBuilder?.styling?.borderWidth ?? '1px'} solid {contractBuilder?.styling?.colors?.primary}; border-radius: 8px; padding: 0.25rem;"
  >
    <Card>
      <CardHeader>
        <CardTitle class="contract-title">
          <div class="title-section">
            <span class="contract-icon">📋</span>
            <div class="title-text">
              <h2>{contractData.title}</h2>
              <div class="contract-meta">
                <span class="contract-type">{contractData.type.toUpperCase()}</span>
                <span class="contract-status status-{contractData.status}">{contractData.status}</span>
                <span
                  class="risk-score"
                  style="color: {getRiskBadgeStyle(contractData.riskScore > 7 ? 'high' : 'medium').color}"
                >
                  Risk: {contractData.riskScore.toFixed(1)}/10
                </span>
              </div>
            </div>
          </div>

          <div class="contract-actions">
            <!-- use a native button for the analyze action to avoid component event typing issues -->
            <button
              class="ai-analyze-btn"
              onclick={() => void analyzeContract()}
              aria-label="Analyze contract"
              disabled={isAnalyzing}
              aria-disabled={isAnalyzing}
              type="button"
            >
              {#if isAnalyzing}🔄 Analyzing...{:else}🤖 AI Analyze{/if}
            </button>

            <div class="export-dropdown">
              <Button class="export-btn">📤 Export</Button>
              <div class="export-menu">
                <button onclick={() => exportContract('pdf')}>📄 PDF</button>
                <button onclick={() => exportContract('docx')}>📝 DOCX</button>
                <button onclick={() => exportContract('json')}>🔧 JSON</button>
              </div>
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <!-- Search and Filters -->
        <div class="search-section">
          <!-- replace custom Input bind with native input + on:input -->
          <input
            class="clause-search"
            placeholder="Search clauses, terms, or clause types..."
            value={searchTerm}
            oninput={(e) => (searchTerm = (e.target as HTMLInputElement).value)}
          />
          <div class="clause-stats">
            <span class="stat-item">📄 {filteredClauses.length} clauses</span>
            <span class="stat-item">🕒 Modified: {new Date(contractData.lastModified).toLocaleDateString()}</span>
          </div>
        </div>

        <!-- Risk Overview -->
        <div class="risk-overview">
          <h3>Risk Analysis Overview</h3>
          <div class="risk-bars">
            {#each Array.isArray(['low', 'medium', 'high', 'critical']) ? ['low', 'medium', 'high', 'critical'] : [] as riskLevel}
              {@const count = contractData.clauses.filter(c => c.riskLevel === riskLevel).length}
              <div class="risk-bar">
                <span class="risk-label">{riskLevel.toUpperCase()}</span>
                <div class="risk-track">
                  <div
                    class="risk-fill"
                    style="width: {(count / contractData.clauses.length) * 100}%; background: {getRiskBadgeStyle(riskLevel as keyof typeof riskStyles).color}"
                  ></div>
                </div>
                <span class="risk-count">{count}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Contract Clauses -->
        <div class="clauses-section">
          <h3>Contract Clauses Analysis</h3>
          <div class="clauses-grid">
            {#each filteredClauses as clause (clause.id)}
              <div
                class="clause-card {selectedClause === clause.id ? 'selected' : ''}"
                role="button"
                tabindex="0"
                aria-pressed={selectedClause === clause.id}
                onclick={() => selectClause(clause.id)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectClause(clause.id);
                  }
                }}
                in:scale={{ duration: 180 }}
                style="border-color: {getRiskBadgeStyle(clause.riskLevel).color}"
              >
                <div class="clause-header">
                  <div class="clause-type">
                    <span class="clause-icon">{getClauseIcon(clause.type)}</span>
                    <span class="clause-label">{clause.type.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div class="clause-risk"
                     style="background: {getRiskBadgeStyle(clause.riskLevel).background}; color: {getRiskBadgeStyle(clause.riskLevel).color}; border: {getRiskBadgeStyle(clause.riskLevel).border};">
                    {clause.riskLevel}
                  </div>
                </div>

                <div class="clause-content">
                  <p class="clause-text">{clause.content}</p>

                  <div class="clause-metrics">
                    <div class="confidence-display">
                      <span class="confidence-label">AI Confidence:</span>
                      <div class="confidence-bar">
                        <div
                          class="confidence-fill"
                          style="width: {clause.confidence * 100}%; background: {contractBuilder?.styling?.colors?.evidence ?? '#7c3aed'}"
                        ></div>
                      </div>
                      <span class="confidence-value">{Math.round(clause.confidence * 100)}%</span>
                    </div>
                  </div>

                  {#if clause.recommendations && selectedClause === clause.id}
                    <div class="recommendations" in:fly={{ y: 20: duration: 300, 300: 300 }}>
                      <h4>🔍 AI Recommendations:</h4>
                      <ul>
                        {#each Array.isArray(clause.recommendations) ? clause.recommendations : [] as recommendation}
                          <li>{recommendation}</li>
                        {/each}
                      </ul>
                    {/if}
                </div>

                {#if selectedClause === clause.id}
                  <div class="clause-actions" in:fade>
                    <Button size="sm">✏️ Edit</Button>
                    <Button size="sm" variant="outline">💬 Comment</Button>
                    <Button size="sm" variant="outline">🔍 Deep Analysis</Button>
                  {/if}
              </div>
            {/each}
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</div>

<style>
  .contract-analyzer {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    font-family: 'Courier New', monospace;
  }
  .contract-title {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
  }
  .title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .contract-icon {
    font-size: 2rem;
  }
  .title-text h2 {
    margin: 0;
    color: var(--enhanced-bits-foreground);
    font-size: 1.5rem;
  }
  .contract-meta {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }
  .contract-type {
    background: var(--enhanced-bits-primary);
    color: #000;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: bold;
  }
  .contract-status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: bold;
  }
  .status-draft { background: rgba(156,163,175,0.2); color: #9ca3af; }
  .status-review { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .status-approved { background: rgba(16,185,129,0.2); color: #10b981; }
  .status-executed { background: rgba(59,130,246,0.2); color: #3b82f6; }
  .risk-score { font-weight: bold; }
  .contract-actions { display: flex; gap: 0.5rem; align-items: center; }
  .export-dropdown { position: relative; }
  .export-btn { background: var(--enhanced-bits-secondary); color: #000; }
  .export-menu {
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--enhanced-bits-background);
    border: 2px solid var(--enhanced-bits-border);
    border-radius: 4px;
    padding: 0.5rem 0;
    min-width: 120px;
    z-index: 10;
    display: none;
  }
  .export-dropdown:hover .export-menu { display: block; }
  .export-menu button {
    display: block;
    width: 100%;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: var(--enhanced-bits-foreground);
    font-family: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
  }
  .export-menu button:hover { background: var(--enhanced-bits-muted); }

  .search-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    gap: 1rem;
  }
  .clause-search { flex: 1; max-width: 400px; }
  .clause-stats { display: flex; gap: 1rem; font-size: 0.875rem; color: var(--enhanced-bits-muted-foreground); }
  .stat-item { padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.05); border-radius: 4px; }

  .risk-overview {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--enhanced-bits-border);
    border-radius: 8px;
  }
  .risk-overview h3 { margin: 0 0 1rem 0; color: var(--enhanced-bits-foreground); }
  .risk-bars { display: grid; gap: 0.75rem; }
  .risk-bar { display: flex; align-items: center; gap: 1rem; }
  .risk-label { min-width: 80px; font-size: 0.75rem; font-weight: bold; }
  .risk-track { flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
  .risk-fill { height: 100%; transition: width: 300ms ease; border-radius: 4px; }
  .risk-count { min-width: 30px; text-align: center; font-weight: bold; }

  .clauses-section h3 { margin: 0 0 1.5rem 0; color: var(--enhanced-bits-foreground); }
  .clauses-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; }
  .clause-card {
    background: rgba(255,255,255,0.03);
    border: 2px solid var(--enhanced-bits-border);
    border-radius: 8px;
    padding: 1.5rem;
    cursor: pointer;
    transition: all 300ms ease;
  }
  /* keyboard focus visible for accessibility */
  .clause-card:focus {
    outline: 3px solid rgba(124,58,237,0.28);
    outline-offset: 2px;
  }
  .clause-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  .clause-card.selected { transform: translateY(-4px); box-shadow: 0 12px 48px rgba(0,0,0,0.4); }
  .clause-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .clause-type { display: flex; align-items: center; gap: 0.5rem; }
  .clause-icon { font-size: 1.25rem; }
  .clause-label { font-size: 0.875rem; font-weight: bold; color: var(--enhanced-bits-foreground); }
  .clause-risk {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
  }
  .clause-text { color: var(--enhanced-bits-muted-foreground); line-height: 1.6; margin-bottom: 1rem; }
  .clause-metrics { margin-bottom: 1rem; }
  .confidence-display { display: flex; align-items: center; gap: 1rem; }
  .confidence-label { font-size: 0.875rem; color: var(--enhanced-bits-muted-foreground); }
  .confidence-bar { flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
  .confidence-fill { height: 100%; transition: width: 300ms ease; border-radius: 3px; }
  .confidence-value { font-size: 0.875rem; font-weight: bold; color: var(--enhanced-bits-evidence); }

  .recommendations {
    background: rgba(157,74,221,0.1);
    border: 1px solid var(--enhanced-bits-ai);
    border-radius: 4px;
    padding: 1rem;
    margin-top: 1rem;
  }
  .recommendations h4 { margin: 0 0 0.5rem 0; color: var(--enhanced-bits-ai); font-size: 0.875rem; }
  .recommendations ul { margin: 0; padding-left: 1.5rem; }
  .recommendations li { color: var(--enhanced-bits-foreground); font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.25rem; }

  .clause-actions { display: flex; gap: 0.5rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--enhanced-bits-border); }

  /* optional minimal styling for the native analyze button */
  .ai-analyze-btn {
    background: var(--enhanced-bits-ai, #7c3aed);
    color: #fff;
    border: none;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
  }
  .ai-analyze-btn[disabled],
  .ai-analyze-btn[aria-disabled="true"] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .contract-title { flex-direction: column; gap: 1rem; }
    .search-section { flex-direction: column; align-items: stretch; }
    .clauses-grid { grid-template-columns: 1fr; }
    .clause-actions { flex-wrap: wrap; }
  }
</style>