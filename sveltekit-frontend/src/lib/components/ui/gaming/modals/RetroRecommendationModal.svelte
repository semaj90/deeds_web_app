<script lang="ts">
  interface Recommendation {
    id: string;
    title: string;
    confidence: number;
    category: string;
    description: string;
    explanationTokens?: string[];
  }

  interface Props {
    open?: boolean;
    userId?: string;
    query?: string;
    caseId?: string;
    recommendations?: Recommendation[];
    onclose?: () => void;
    onselect?: (rec: Recommendation) => void;
  }

  let {
    open = $bindable(false),
    userId = '',
    query = '',
    caseId = '',
    recommendations = $bindable([
      { id: "r1", title: "Review PC 187 Precedents", confidence: 0.94, category: "Legal", description: "Similar murder cases with matching evidence patterns", explanationTokens: ["vector:0.92", "topic:homicide", "tag:PC187"] },
      { id: "r2", title: "Cross-Reference Witness Statements", confidence: 0.87, category: "Evidence", description: "3 witnesses with overlapping testimony timelines", explanationTokens: ["vector:0.85", "graph:3-hop", "tag:witness"] },
      { id: "r3", title: "Analyze Financial Records", confidence: 0.82, category: "Financial", description: "Suspicious transaction patterns detected in period", explanationTokens: ["vector:0.78", "topic:fraud", "tag:financial"] },
      { id: "r4", title: "Request Expert Testimony", confidence: 0.76, category: "Strategy", description: "Forensic specialist recommended for DNA evidence", explanationTokens: ["vector:0.71", "tag:forensics", "tag:DNA"] },
      { id: "r5", title: "Review Chain of Custody Logs", confidence: 0.73, category: "Evidence", description: "Evidence handling gaps detected in timeline", explanationTokens: ["vector:0.70", "graph:custody", "tag:chain-of-custody"] },
      { id: "r6", title: "Compare Sentencing Guidelines", confidence: 0.69, category: "Legal", description: "Federal vs state sentencing precedents for similar charges", explanationTokens: ["vector:0.65", "topic:sentencing", "tag:guidelines"] },
      { id: "r7", title: "Subpoena Phone Records", confidence: 0.64, category: "Strategy", description: "Cell tower data may corroborate alibi timeline", explanationTokens: ["vector:0.60", "tag:subpoena", "tag:telecom"] },
      { id: "r8", title: "Audit Evidence Storage Facility", confidence: 0.58, category: "Financial", description: "Storage fees and chain-of-custody costs analysis", explanationTokens: ["vector:0.55", "tag:audit", "tag:storage"] },
    ]),
    onclose,
    onselect,
  }: Props = $props();

  let selectedRec = $state<Recommendation | null>(null);
  let loading = $state(false);
  let searchTimeMs = $state(0);
  let filterCategory = $state('ALL');
  let sortMode = $state<'confidence' | 'alpha' | 'category'>('confidence');
  let showTokens = $state(false);

  let categories = $derived.by(() => {
    const cats = new Set(recommendations.map(r => r.category));
    return ['ALL', ...Array.from(cats).sort()];
  });

  let displayRecs = $derived.by(() => {
    let filtered = filterCategory === 'ALL'
      ? [...recommendations]
      : recommendations.filter(r => r.category === filterCategory);

    if (sortMode === 'confidence') filtered.sort((a, b) => b.confidence - a.confidence);
    else if (sortMode === 'alpha') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortMode === 'category') filtered.sort((a, b) => a.category.localeCompare(b.category) || b.confidence - a.confidence);

    return filtered;
  });

  let avgConfidence = $derived(
    recommendations.length > 0
      ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
      : 0
  );

  // Fetch live recommendations when modal opens with a userId
  $effect(() => {
    if (open && userId) {
      fetchRecommendations();
    }
  });

  async function fetchRecommendations() {
    if (!userId) return;
    loading = true;
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (caseId) params.set('caseId', caseId);
      params.set('topK', '10');

      const resp = await fetch(`/api/recommendations/${userId}?${params}`);
      if (!resp.ok) return;

      const data = await resp.json();
      if (data.success && data.recommendations) {
        recommendations = data.recommendations.map((r: any) => ({
          id: r.documentId,
          title: r.title,
          confidence: r.score,
          category: r.signals?.topicAffinity > 0.5 ? 'Topic Match' :
                    r.signals?.tagOverlap > 0.5 ? 'Tag Match' :
                    r.signals?.graphCentrality > 0.5 ? 'Network' : 'Relevant',
          description: r.explanationTokens?.join(' | ') || 'Recommended based on multi-modal analysis',
          explanationTokens: r.explanationTokens
        }));
        searchTimeMs = data.metadata?.searchTimeMs ?? 0;
      }
    } catch (err) {
      console.warn('[RetroRecommendationModal] Fetch failed:', err);
    } finally {
      loading = false;
    }
  }

  function getConfidenceColor(c: number): string {
    if (c >= 0.9) return "#80ff80";
    if (c >= 0.8) return "#c0ff40";
    if (c >= 0.7) return "#ffc040";
    return "#ff6040";
  }

  function getCategoryColor(cat: string): string {
    switch (cat) {
      case 'Legal': return '#c0c0ff';
      case 'Evidence': return '#80ff80';
      case 'Financial': return '#ffc040';
      case 'Strategy': return '#ff80c0';
      case 'Topic Match': return '#80c0ff';
      case 'Tag Match': return '#c0ff80';
      case 'Network': return '#ff80ff';
      default: return '#8080a0';
    }
  }

  async function handleSelect(rec: Recommendation) {
    selectedRec = rec;
    if (onselect) onselect(rec);

    // Record click interaction
    if (userId) {
      try {
        await fetch(`/api/recommendations/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interactionType: 'click',
            documentId: rec.id,
            searchContext: query || undefined
          })
        });
      } catch {
        // Non-fatal: interaction tracking failure doesn't affect UX
      }
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" onclick={() => { if (onclose) onclose(); }} role="presentation">
    <div class="modal-container" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-scanlines"></div>

      <div class="modal-header">
        <div class="header-deco"></div>
        <h2>AI RECOMMENDATIONS</h2>
        <button class="close-btn" onclick={() => { if (onclose) onclose(); }}>X</button>
      </div>

      <!-- Controls Bar -->
      <div class="controls-bar">
        <div class="controls-row">
          <div class="filter-group">
            <span class="ctrl-label">FILTER:</span>
            {#each categories as cat}
              <button
                class="filter-btn"
                class:active={filterCategory === cat}
                onclick={() => filterCategory = cat}
              >
                {cat}
              </button>
            {/each}
          </div>
        </div>
        <div class="controls-row">
          <div class="filter-group">
            <span class="ctrl-label">SORT:</span>
            <button class="filter-btn" class:active={sortMode === 'confidence'} onclick={() => sortMode = 'confidence'}>SCORE</button>
            <button class="filter-btn" class:active={sortMode === 'alpha'} onclick={() => sortMode = 'alpha'}>A-Z</button>
            <button class="filter-btn" class:active={sortMode === 'category'} onclick={() => sortMode = 'category'}>TYPE</button>
          </div>
          <button class="filter-btn toggle-btn" class:active={showTokens} onclick={() => showTokens = !showTokens}>
            {showTokens ? 'HIDE' : 'SHOW'} SIGNALS
          </button>
        </div>
        <!-- Stats Row -->
        <div class="stats-row">
          <span class="stat-item">{displayRecs.length}/{recommendations.length} SHOWN</span>
          <span class="stat-item">AVG: <span style="color: {getConfidenceColor(avgConfidence)}">{(avgConfidence * 100).toFixed(0)}%</span></span>
          <span class="stat-item">TOP: <span style="color: {getConfidenceColor(recommendations[0]?.confidence ?? 0)}">{((recommendations[0]?.confidence ?? 0) * 100).toFixed(0)}%</span></span>
          {#if searchTimeMs > 0}
            <span class="stat-item">{searchTimeMs}ms</span>
          {/if}
        </div>
      </div>

      <div class="modal-body">
        {#if loading}
          <div class="loading-state">
            <div class="loading-dots">LOADING...</div>
            <div class="loading-bar"></div>
          </div>
        {:else if displayRecs.length === 0}
          <div class="empty-state">NO RESULTS FOR FILTER [{filterCategory}]</div>
        {:else}
          {#each displayRecs as rec}
            <button
              class="rec-card"
              class:selected={selectedRec?.id === rec.id}
              onclick={() => handleSelect(rec)}
            >
              <div class="rec-top">
                <span class="rec-category" style="color: {getCategoryColor(rec.category)}">[{rec.category}]</span>
                <span class="rec-confidence" style="color: {getConfidenceColor(rec.confidence)}">
                  {(rec.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div class="rec-title">{rec.title}</div>
              <div class="rec-desc">{rec.description}</div>
              {#if showTokens && rec.explanationTokens && rec.explanationTokens.length > 0}
                <div class="rec-tokens">
                  {#each rec.explanationTokens as token}
                    <span class="token-badge">{token}</span>
                  {/each}
                </div>
              {/if}
              <div class="confidence-bar">
                <div class="bar-fill" style="width: {rec.confidence * 100}%; background: {getConfidenceColor(rec.confidence)}"></div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <div class="modal-footer">
        <span class="footer-text">{recommendations.length} recs | multi-modal scoring</span>
        <button class="action-btn" onclick={() => { if (onclose) onclose(); }}>ACCEPT</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  .modal-container {
    background: #0d0d1a;
    border: 3px solid #4040c0;
    width: 90%;
    max-width: 540px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow:
      0 0 30px rgba(64, 64, 192, 0.3),
      inset 0 0 40px rgba(0, 0, 0, 0.5);
  }
  .modal-scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.06) 2px, rgba(0, 0, 0, 0.06) 4px);
    pointer-events: none;
    z-index: 1;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #1a1a3a;
    border-bottom: 2px solid #4040c0;
    position: relative;
    z-index: 2;
  }
  .header-deco {
    width: 12px;
    height: 12px;
    background: #4040c0;
    transform: rotate(45deg);
  }
  .modal-header h2 {
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.7rem;
    color: #c0c0ff;
    margin: 0;
    letter-spacing: 2px;
  }
  .close-btn {
    background: #c04040;
    color: white;
    border: 2px solid #a02020;
    width: 24px;
    height: 24px;
    font-family: monospace;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn:hover { background: #e04040; }

  /* Controls Bar */
  .controls-bar {
    padding: 8px 12px;
    background: #12122a;
    border-bottom: 1px solid #2a2a4a;
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .ctrl-label {
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.5rem;
    color: #606080;
    letter-spacing: 1px;
    margin-right: 2px;
  }
  .filter-btn {
    background: #1a1a3a;
    border: 1px solid #2a2a4a;
    color: #8080a0;
    font-family: "Courier New", monospace;
    font-size: 0.55rem;
    padding: 2px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.15s;
  }
  .filter-btn:hover { border-color: #4040c0; color: #c0c0e0; }
  .filter-btn.active { background: #4040c0; border-color: #6060e0; color: #e0e0ff; }
  .toggle-btn { margin-left: auto; }
  .stats-row {
    display: flex;
    gap: 12px;
    padding-top: 4px;
    border-top: 1px solid #1a1a2a;
  }
  .stat-item {
    font-family: "Courier New", monospace;
    font-size: 0.55rem;
    color: #606080;
    letter-spacing: 0.5px;
  }

  .modal-body {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    z-index: 2;
  }
  .rec-card {
    background: #12122a;
    border: 1px solid #2a2a4a;
    padding: 10px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-family: "Courier New", monospace;
    color: #c0c0e0;
    transition: border-color 0.15s;
  }
  .rec-card:hover { border-color: #4040c0; }
  .rec-card.selected { border-color: #6060e0; background: #1a1a3a; }
  .rec-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .rec-category { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 1px; }
  .rec-confidence { font-size: 0.75rem; font-weight: bold; }
  .rec-title { font-size: 0.8rem; color: #e0e0ff; margin-bottom: 4px; }
  .rec-desc { font-size: 0.65rem; color: #808090; line-height: 1.3; }
  .rec-tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .token-badge {
    font-size: 0.5rem;
    padding: 1px 5px;
    background: #1a1a3a;
    border: 1px solid #303050;
    color: #8080c0;
    letter-spacing: 0.5px;
  }
  .confidence-bar { height: 3px; background: #1a1a3a; margin-top: 6px; border-radius: 1px; overflow: hidden; }
  .bar-fill { height: 100%; transition: width 0.3s; }
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.6rem;
    color: #606080;
  }
  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: #1a1a3a;
    border-top: 1px solid #2a2a4a;
    position: relative;
    z-index: 2;
  }
  .footer-text { font-size: 0.6rem; color: #606080; font-family: monospace; }
  .action-btn {
    background: #4040c0;
    color: #e0e0ff;
    border: 2px solid #2020a0;
    padding: 6px 16px;
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.6rem;
    cursor: pointer;
    letter-spacing: 1px;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  }
  .action-btn:hover { background: #5050d0; }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 12px;
  }
  .loading-dots {
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.7rem;
    color: #4040c0;
    animation: blink 1s step-end infinite;
  }
  .loading-bar {
    width: 60%;
    height: 4px;
    background: #1a1a3a;
    overflow: hidden;
    position: relative;
  }
  .loading-bar::after {
    content: '';
    position: absolute;
    left: -40%;
    width: 40%;
    height: 100%;
    background: #4040c0;
    animation: slide 1.2s linear infinite;
  }
  @keyframes blink { 50% { opacity: 0.3; } }
  @keyframes slide { to { left: 100%; } }
</style>
