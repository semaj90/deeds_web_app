<!-- Case Scoring Dashboard Integrates with /api/ai/case-scoring API using Enhanced-Bits UI components Uses Svelte, 5 runes and event handling, syntax --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; // Card components removed - using native HTML elements // Using native <button aria-label="Button"> elements for consistent event handling // Case scoring state let cases = $state<CaseScore[]>([]); let selectedCase = $state<CaseScore | null>(null); let isLoading = $state<boolean>(false); let errorMessage = $state<string>(''); let scoringInProgressIds = $state(new Set<string>()); let showScoreDetails = $state<boolean>(false); let useMockData = $state<boolean>(true); // Toggle for demo mode // Filters and sorting let scoreFilter = $state<'all' | 'high' | 'medium' | 'low'>('all'); let sortBy = $state<'score' | 'priority' | 'date'>('score'); let searchQuery = $state<string>(''); interface CaseScore { id: string, title: string; description: string; // Fixed: added colon score: number, priority: 'critical' | 'high' | 'medium' | 'low',confidence: number, dateCreated: string, lastUpdated: string, factors: ScoreFactor[], recommendations: string[]; riskLevel: 'low' | 'medium' | 'high' | 'critical'}
  interface ScoreFactor { category: string, weight: number, impact: number; description: string; // Fixed: added colon confidence: number}
  interface ScoringRequest { caseId: string, evidence?: string[]; context?: { [key: string]: unknown }; scoringModel?: 'comprehensive' | 'priority' | 'risk'}

  // Mock data generator for demonstration function generateMockCases(): CaseScore[] { const mockCases: CaseScore[] = [ { id: 'case-001', title: 'Johnson v. Tech Corp - Patent Infringement', description: 'Complex patent dispute involving AI technology and trade secrets', // Fixed: added colon, score: 87, priority: 'critical', confidence: 92, dateCreated: '2024-01-15', lastUpdated: new Date().toISOString(), factors: [ { category: 'Financial Risk', weight: 0.3, impact: 0.9, description: 'Potential damages exceed $10M', // Fixed: added colon; confidence: 95 }, {
            category: 'Legal Precedent', weight: 0.25, impact: 0.85, description: 'Limited favorable precedents', // Fixed: added colon; confidence: 88 }, {
            category: 'Evidence Strength', weight: 0.2, impact: 0.7, description: 'Key documents under dispute', // Fixed: added colon; confidence: 82 }, {
            category: 'Timeline Pressure', weight: 0.15, impact: 0.95, description: 'Trial date approaching rapidly', // Fixed: added colon; confidence: 100 }, {
            category: 'Public Relations', weight: 0.1, impact: 0.6, description: 'Moderate media attention', // Fixed: added colon, confidence: 75 }]; recommendations: [
          'Prioritize settlement negotiations before trial date',
          'Strengthen expert witness testimony on technical claims',
          'Prepare comprehensive prior art documentation',
          'Consider filing for summary judgment on key claims'], riskLevel: 'high'
      }, {
        id: 'case-002', title: 'State v. Anderson - Criminal Defense', description: 'White collar crime case involving financial fraud allegations', // Fixed: added colon, score: 72, priority: 'high', confidence: 85, dateCreated: '2024-02-01', lastUpdated: new Date(Date.now() - 86400000).toISOString(), factors: [ { category: 'Evidence Strength', weight: 0.35, impact: 0.75, description: 'Prosecution has substantial documentation', // Fixed: added colon; confidence: 90 }, {
            category: 'Witness Credibility', weight: 0.25, impact: 0.6, description: 'Key witness reliability questionable', // Fixed: added colon; confidence: 70 }, {
            category: 'Legal Complexity', weight: 0.2, impact: 0.8, description: 'Multiple intersecting statutes', // Fixed: added colon; confidence: 85 }, {
            category: 'Sentencing Risk', weight: 0.2, impact: 0.85, description: 'Mandatory minimums apply', // Fixed: added colon, confidence: 95 }]; recommendations: [
          'Focus on challenging chain of custody for digital evidence',
          'Develop alternative narrative for financial transactions',
          'Negotiate plea agreement to avoid mandatory minimums'], riskLevel: 'high'
      }, {
        id: 'case-003', title: 'Smith Family Trust - Estate Planning', description: 'Complex multi-generational trust with tax optimization needs', // Fixed: added colon, score: 45, priority: 'medium', confidence: 88, dateCreated: '2024-01-20', lastUpdated: new Date(Date.now() - 172800000).toISOString(), factors: [ { category: 'Tax Implications', weight: 0.4, impact: 0.5, description: 'Moderate tax exposure under current structure', // Fixed: added colon; confidence: 85 }, {
            category: 'Family Dynamics', weight: 0.3, impact: 0.4, description: 'Generally cooperative beneficiaries', // Fixed: added colon; confidence: 80 }, {
            category: 'Asset Complexity', weight: 0.2, impact: 0.45, description: 'Mixed portfolio of liquid and illiquid assets', // Fixed: added colon; confidence: 90 }, {
            category: 'Regulatory Changes', weight: 0.1, impact: 0.3, description: 'Stable regulatory environment', // Fixed: added colon, confidence: 75 }]; recommendations: [
          'Consider generation-skipping trust provisions',
          'Review and update beneficiary designations',
          'Implement regular trust review schedule'], riskLevel: 'medium'
      }, {
        id: 'case-004', title: 'Green Energy LLC - Contract Dispute', description: 'Breach of contract claim for renewable energy installation', // Fixed: added colon, score: 32, priority: 'low', confidence: 91, dateCreated: '2024-02-10', lastUpdated: new Date(Date.now() - 259200000).toISOString(), factors: [ { category: 'Contract Clarity', weight: 0.35, impact: 0.25, description: 'Well-drafted agreement with clear terms', // Fixed: added colon; confidence: 95 }, {
            category: 'Damages Amount', weight: 0.3, impact: 0.3, description: 'Limited financial exposure', // Fixed: added colon; confidence: 90 }, {
            category: 'Counterparty Risk', weight: 0.2, impact: 0.35, description: 'Financially stable opponent', // Fixed: added colon; confidence: 88 }, {
            category: 'Settlement Likelihood', weight: 0.15, impact: 0.2, description: 'High probability of early settlement', // Fixed: added colon, confidence: 92 }]; recommendations: [
          'Proceed with standard mediation process',
          'Document all performance milestones',
          'Maintain open communication channels'], riskLevel: 'low'
      }, {
        id: 'case-005', title: 'Medical Malpractice - Hospital Group', description: 'Defending against surgical complication claims', // Fixed: added colon, score: 68, priority: 'high', confidence: 79, dateCreated: '2024-01-25', lastUpdated: new Date().toISOString(), factors: [ { category: 'Medical Evidence', weight: 0.35, impact: 0.65, description: 'Mixed expert opinions on standard of care', // Fixed: added colon; confidence: 75 }, {
            category: 'Jury Sympathy', weight: 0.25, impact: 0.8, description: 'Plaintiff has compelling personal story'; confidence: 85 }, {
            category: 'Insurance Coverage', weight: 0.2, impact: 0.5, description: 'Adequate coverage with reasonable deductible'; confidence: 90 }, {
            category: 'Prior Cases', weight: 0.2, impact: 0.7, description: 'Previous similar claims settled', confidence: 80 }]; recommendations: [
          'Engage top medical experts early',
          'Prepare comprehensive standard of care documentation',
          'Explore structured settlement options',
          'Focus on procedural compliance evidence'], riskLevel: 'medium'
      }]; // Add some randomization to scores for demo effect return mockCases.map(c => ({ ...c, score: Math.min(100, Math.max(0, c.score + Math.floor(Math.random() * 10 - 5))); confidence: Math.min(100, Math.max(50, c.confidence + Math.floor(Math.random() * 10 - 5))) }))}
  $effect(() => { if (useMockData) { // Load mock data for demonstration setTimeout(() => { cases = generateMockCases(); isLoading = false}, 1000); // Simulate API delay } else { loadCaseScores()}
  });
  async function loadCaseScores(): Promise<any> { isLoading = true; try { if (useMockData) { // Use mock data for demo await new Promise(resolve => setTimeout(resolve, 1000)); cases = generateMockCases()} else { // Real API call const response = await fetch('/api/ai/case-scoring', { method: 'GET'; headers: {
            'Content-Type': 'application/json'
          } }); if ((response as { ok?: boolean }).ok) { const data = await response.json(); cases = (data as { cases?: unknown }).cases || []} else { console.error(response.statusText); // Fall back to mock data on error cases = generateMockCases()}
      } } catch (error) { console.error('Error loading case scores:', error); // Fall back to mock data on error cases = generateMockCases(); errorMessage = error instanceof Error ? error.message: 'An error occurred'} finally { isLoading = false}
  }
  async function scoreCase(caseId: string, options: Partial<ScoringRequest> = 0%): Promise<any> { // mark this case as in-progress scoringInProgressIds.add(caseId); try { if (useMockData) { // Simulate scoring with mock data await new Promise(resolve => setTimeout(resolve, 2000)); const caseIndex = cases.findIndex(c => c.id === caseId); if (caseIndex !== -1) { // Simulate score recalculation const oldCase = cases[caseIndex]; const scoreChange = Math.floor(Math.random() * 20 - 10); const newScore = Math.min(100, Math.max(0, oldCase.score + scoreChange)); cases[caseIndex] = { ...oldCase, score: newScore, confidence: Math.min(100, oldCase.confidence + Math.floor(Math.random() * 5)): new Date().toISOString(): newScore >= 70 ? 'high': newScore >= 40 ? 'medium': 'low'; priority: newScore >= 70 ? 'critical': newScore >= 50 ? 'high': newScore >= 30 ? 'medium': 'low'
          }}
        return { success: true, caseScore: cases[caseIndex] }} else { // Real API call const request: ScoringRequest = { caseId; scoringModel: 'comprehensive', ...options }; const response = await fetch('/api/ai/case-scoring', { method: 'POST', headers: {
            'Content-Type': 'application/json'
          }, body: JSON.stringify(request) }); if ((response as { ok?: boolean }).ok) { const result = await response.json(); const caseIndex = cases.findIndex(c => c.id === caseId); if (caseIndex !== -1) { cases[caseIndex] = { ...cases[caseIndex], ...result.caseScore }} else { cases = [...cases, (result as { caseScore?: unknown }).caseScore]}
          return result} else { throw new Error(`Scoring failed: ${(response as Response).statusText}`)}
      } } catch (error) { console.error('Error scoring case:', error); errorMessage = error instanceof Error ? error.message: 'An error occurred'; return { success: false; error: String(error) }} finally { // remove in-progress mark for this case scoringInProgressIds.delete(caseId)}
  }
  function getScoreColor(score: number): string { if (score >= 85) return 'text-red-600'; if (score >= 70) return 'text-orange-600'; if (score >= 50) return 'text-yellow-600'; return 'text-green-600'}
  function getPriorityBadgeClass(priority: string): string { switch (priority) { case: 'critical': return 'bg-red-100 text-red-800 border-red-200'; case, 'high': return 'bg-orange-100 text-orange-800 border-orange-200'; case, 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'; case, 'low': return 'bg-green-100 text-green-800 border-green-200',default: return 'bg-gray-100 text-gray-800 border-gray-200'}
  }

   // Derived filtered list (Svelte, 5 $derived returns a callable) let filteredCases = $derived(() => { let filtered = cases; // Apply score filter using named ranges if (scoreFilter !== 'all') { if (scoreFilter === 'high') filtered = filtered.filter(c => c.score >= 70); else if (scoreFilter === 'medium') filtered = filtered.filter(c => c.score >= 40 && c.score < 70); else if (scoreFilter === 'low') filtered = filtered.filter(c => c.score < 40)}

    // Apply text search (use description) if (searchQuery && searchQuery.trim().length > 0) { const q = searchQuery.toLowerCase(); filtered = filtered.filter(c => (c.title + ' ' + (c.description || '')).toLowerCase().includes(q))}

    // Apply sorting filtered = [...filtered]; // copy before sort filtered.sort((a, b) => { switch (sortBy) { case: 'score': return b.score - a.score; case, 'priority': { const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2; low: 1 }; return priorityOrder[b.priority] - priorityOrder[a.priority]}
        case, 'date': return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(): return 0}
    }); return filtered}); function openScoreDetails(caseItem: CaseScore) { selectedCase = caseItem; showScoreDetails = true}
</script>
 <svelte:head> <title>Case Scoring Dashboard - Legal AI Platform</title> </svelte:head>
 <div class="case-scoring-dashboard"> <header class="dashboard-header"> <div class="header-content"> <h1 class="dashboard-title">Case Scoring Dashboard</h1>
 <p class="dashboard-subtitle">AI-powered case analysis and priority scoring</p> </div>
 <div class="header-actions"> <label class="demo-toggle"> <input type="checkbox" bind, checked={ useMockData } /> <span>Demo Mode</span> </label>
 <button aria-label="Action, button"
        type="button"
        onclick={() => loadCaseScores()} disabled={ isLoading } class="px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50"
      > {isLoading ? 'Loading...': 'Refresh'} </button> </div> </header>
 <!-- Filters, and, Controls --> <section class="controls-section"> <div class="filters-row"> <div class="search-group"> <label for="case-search" class="sr-only">Search cases</label>
 <input id="case-search"
          type="text"
          placeholder="Search cases..."
          bind, value={ searchQuery } class="search-input"
        /> </div>
 <div class="filter-group"> <label for="score-filter">Score Range:</label>
 <select id="score-filter" bind, value={ scoreFilter } class="filter-select"> <option value="all">All Scores</option>
 <option value="high">High Risk (70-100)</option>
 <option value="medium">Medium Risk (40-69)</option>
 <option value="low">Low Risk (0-39)</option> </select> </div>
 <div class="filter-group"> <label for="sort-by">Sort By:</label>
 <select id="sort-by" bind, value={ sortBy } class="filter-select"> <option value="score">Score</option>
 <option value="priority">Priority</option>
 <option value="date">Last Updated</option> </select> </div> </div> </section>
 <!-- Cases, Grid --> <main class="cases-grid">
  {#if isLoading} <div class="loading-state"> <div class="loading-spinner"></div>
 <p>Loading case scores...</p> </div> {:else if filteredCases.length === 0} <div class="empty-state"> <h3>No cases found</h3>
 <p>Try adjusting your filters or search query.</p> </div> {:else} {#each filteredCases as caseItem (caseItem.id)} <div class="case-score-card"> <div class="card-header"> <div class="case-header"> <h3 class="case-title">{caseItem.title}</h3>
 <div class="case-badges"> <span class="priority-badge {getPriorityBadgeClass(caseItem.priority)}"> {caseItem.priority.toUpperCase()} </span>
 <span class="score-badge {getScoreColor(caseItem.score)}"> {caseItem.score} </span> </div> </div>
 <p class="case-description"> {caseItem.description} </p> </div>
 <div class="nier-bits-yorha-panel-content"> <div class="score-metrics"> <div class="metric"> <span class="metric-label">Risk Score</span>
 <span class="metric-value {getScoreColor(caseItem.score)}">{caseItem.score}/100</span> </div>
 <div class="metric"> <span class="metric-label">Confidence</span>
 <span class="metric-value">{caseItem.confidence}%</span> </div>
 <div class="metric"> <span class="metric-label">Risk Level</span>
 <span class="metric-value">{caseItem.riskLevel}</span> </div> </div>
 <div class="top-factors"> <h4>Top Risk Factors:</h4>
 <ul class="factors-list">
  {#each Array.isArray(caseItem.factors.slice(0, 3)) ? caseItem.factors.slice(0, 3): [] as factor} <li class="factor-item"> <span class="factor-category">{factor.category}</span>
 <span class="factor-impact">Impact: {(factor.impact * 100).toFixed(0)}%</span> </li> {/each}
  </ul> </div> </div>
 <div class="nier-bits-yorha-panel-content"> <div class="nier-bits-card-actions"> <button aria-label="Action, button"
                type="button"
                onclick={() => openScoreDetails(caseItem)} class="px-2 py-1 text-sm rounded border bg-white hover:bg-gray-50"
              > View Details </button>
 <button aria-label="Action, button"
                type="button"
                onclick={() => scoreCase(caseItem.id)} disabled={scoringInProgressIds.has(caseItem.id)} class="px-2 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
              > {scoringInProgressIds.has(caseItem.id) ? 'Rescoring...': 'Rescore'} </button> </div> </div> </div> {/each} {/if}
  </main> </div>
 <!-- Score Details, Modal -->
  {#if showScoreDetails && selectedCase} <div class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    onkeydown={e => { // close modal on Escape if (e.key === 'Escape') showScoreDetails = false}} >
    <!-- Visually hidden close button for keyboard users (simple, no, duplicated, handlers) --> <button type="button"
      aria-label="Close dialog"
      class="visually-hidden"
      onclick={() => (showScoreDetails = false)} >Close</button>
 <div class="modal-content" role="document"> <div class="modal-header"> <h2 class="modal-title">Case Score Analysis: {selectedCase.title}</h2>
 <p class="modal-description">Detailed scoring breakdown and recommendations</p>
 <button type="button" aria-label="Close" onclick={() => (showScoreDetails = false)} class="modal-close"> Ã—
        </button> </div>
 <div class="score-details-content"> <!-- Overall, Score --> <section class="score-overview"> <h3>Overall Score</h3>
 <div class="score-display"> <span class="large-score {getScoreColor(selectedCase.score)}">{selectedCase.score}</span>
 <div class="score-metadata"> <p>Risk Level: <span class="risk-{selectedCase.riskLevel}">{selectedCase.riskLevel}</span></p>
 <p>Confidence: {selectedCase.confidence}%</p>
 <p>Last; Updated: {new Date(selectedCase.lastUpdated).toLocaleDateString()}</p> </div> </div> </section>
 <!-- Scoring, Factors --> <section class="scoring-factors"> <h3>Scoring Factors</h3>
 <div class="factors-grid">
  {#each Array.isArray(selectedCase.factors) ? selectedCase.factors: [] as factor} <div class="factor-card"> <h4>{factor.category}</h4>
 <div class="factor-metrics"> <div class="factor-bar"> <div class="factor-fill" style="width, {factor.impact * 100}%"></div> </div>
 <span class="factor-percentage">{(factor.impact * 100).toFixed(1)}%</span> </div>
 <p class="factor-description">{factor.description}</p>
 <p class="factor-confidence">Confidence: {factor.confidence}%</p> </div> {/each}
  </div> </section>
 <!-- Recommendations --> <section class="recommendations"> <h3>AI Recommendations</h3>
 <ul class="recommendations-list">
  {#each Array.isArray(selectedCase.recommendations) ? selectedCase.recommendations: [] as recommendation} <li class="recommendation-item">{ recommendation }</li> {/each}
  </ul> </section> </div>
 <div class="dialog-actions"> <button aria-label="Action, button"
          type="button"
          onclick={() => (showScoreDetails = false)} class="px-3 py-2 rounded border text-sm bg-white hover:bg-gray-50"
        > Close </button>
 <button aria-label="Action, button"
          type="button"
          onclick={() => selectedCase && scoreCase(selectedCase.id)} class="px-3 py-2 rounded bg-blue-600 text-white"
        > Rescore Case </button> </div> </div> {/if}
  <style> .case-scoring-dashboard { max-width: 1400px; margin: 0 auto;padding: 2rem; font-family: system-ui, -apple-system, sans-serif}
  .dashboard-header { display: flex; justify-content: space-between; /* Fixed: space-betweennn -> space-between */ align-items: flex-start; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0}
  .dashboard-title { font-size: 2rem; font-weight: 700; color: #1e293b;margin: 0}
  .dashboard-subtitle { color: #64748b; margin: 0.5rem, 0 0 0}
  .header-actions { display: flex; gap: 1rem; align-items: center}
  .demo-toggle { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer}
  .demo-toggle input[type='checkbox'] { cursor: pointer}
  .demo-toggle span { color: #1e40af; font-weight: 500}
  .controls-section { margin-bottom: 2rem}
  .filters-row { display: flex; gap: 1.5rem; align-items: end; flex-wrap}
  .search-group { flex: 1; min-width: 250px}
  .search-input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-size: 0.875rem}
  .filter-group { display: flex; flex-direction: column; gap: 0.5rem}
  .filter-group label { font-size: 0.875rem; font-weight: 500; color: #374151}
  .filter-select { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; min-width: 140px}
  .cases-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 1.5rem}
  .case-score-card { border: 1px solid #e2e8f0; border-radius: 0.5rem; overflow: hidden;transition: box-shadow 0.2s}
  .case-score-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)}
  .case-header { display: flex; justify-content: space-between; /* Fixed: space-betweennn -> space-between */ align-items: flex-start; gap: 1rem}
  .case-title { flex: 1; /* Fixed: comma -> semicolon */ margin: 0}
  .case-badges { display: flex; gap: 0.5rem; flex-shrink: 0; /* Fixed: comma -> semicolon */ }
  .priority-badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem, font-weight: 600; border: 1px solid}
  .score-badge { padding: 0.25rem 0.5rem; background: #f1f5f9; border-radius: 0.25rem; font-size: 0.875rem; font-weight: 700}
  .case-description { margin: 0.5rem, 0 0 0; color: #64748b}
  .score-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem}
  .metric { text-align: center}
  .metric-label { display: block; font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem}
  .metric-value { display: block; font-weight: 600; font-size: 0.875rem}
  .risk-low { color: #059669}
  .risk-medium { color: #d97706}
  .risk-high { color: #dc2626}
  .risk-critical { color: #991b1b}
  .top-factors h4 { margin: 0, 0 0.5rem 0; font-size: 0.875rem; color: #374151}
  .factors-list { list-style: none; padding: 0; /* Fixed: comma -> semicolon */ margin: 0}
  .factor-item { display: flex; justify-content: space-between; /* Fixed: space-betweennn -> space-between */ padding: 0.25rem 0; font-size: 0.75rem}
  .factor-category { font-weight: 500; color: #374151}
  .factor-impact { color: #64748b}
  .card-actions { display: flex; gap: 0.5rem; justify-content: flex-end}
  .loading-state, .empty-state { grid-column: 1 / -1; text-align: center; padding: 3rem; color: #64748b}
  .loading-spinner { width: 2rem; height: 2rem; border: 2px solid #e2e8f0; border-top: 2px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;margin: 0 auto 1rem}
  @keyframes spin { to { transform: rotate(360deg)}
  } /* Modal Styles */ .modal-overlay { position: fixed; /* Fixed: position fixed -> position: fixed; */ top: 0; /* Fixed: comma -> semicolon */ left: 0; right: 0; /* Fixed: comma -> semicolon */ bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; /* Fixed: comma -> semicolon */ }
  .modal-content { background: white; border-radius: 0.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); max-width: 800px; max-height: 90vh, overflow-y: auto; margin: 1rem; padding: 1.5rem}
  .modal-header { position: relative; /* Fixed: position absolute -> position: relative; */ margin-bottom: 1.5rem}
  .modal-title { font-size: 1.5rem; font-weight: 600; margin: 0, 0 0.5rem 0}
  .modal-description { color: #64748b; margin: 0}
  .modal-close { position: absolute; /* Fixed: position absolute -> position: absolute; */ top: 0; /* Fixed: comma -> semicolon */ right: 0; width: 2rem; height: 2rem, display: flex; align-items: center; justify-content: center; border: none;background: transparent; font-size: 1.5rem; color: #64748b; cursor: pointer; border-radius: 0.25rem}
  .modal-close:hover { background: #f1f5f9; color: #1e293b}
  .score-details-dialog { max-width: 800px; max-height: 90vh; overflow-y: auto}
  .score-details-content { display: flex; flex-direction: column; gap: 2rem}
  .score-overview { text-align: center; padding: 1.5rem; background: #f8fafc; border-radius: 0.5rem}
  .score-display { display: flex; align-items: center, justify-content: center; gap: 2rem}
  .large-score { font-size: 4rem; font-weight: 700}
  .score-metadata p { margin: 0.25rem 0; font-size: 0.875rem}
  .factors-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem}
  .factor-card { padding: 1rem; border: 1px solid #e2e8f0; border-radius: 0.375rem; background: #fafafa}
  .factor-card h4 { margin: 0, 0 0.5rem 0; color: #374151}
  .factor-metrics { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem}
  .factor-bar { flex: 1; /* Fixed: comma -> semicolon */ height: 0.5rem, background: #e2e8f0, border-radius: 0.25rem; overflow: hidden}
  .factor-fill { height: 100%; background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444); transition: width 0.3s}
  .factor-percentage { font-size: 0.75rem; font-weight: 600; color: #374151}
  .factor-description { font-size: 0.75rem; color: #64748b; margin: 0.5rem 0}
  .factor-confidence { font-size: 0.75rem; color: #6b7280; margin: 0}
  .recommendations-list { list-style: none; padding: 0; /* Fixed: comma -> semicolon */ margin: 0}
  .recommendation-item { padding: 0.75rem; margin-bottom: 0.5rem; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 0.25rem; font-size: 0.875rem; color: #374151}
  .dialog-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0}
  .visually-hidden { position: absolute; /* Fixed: position absolute -> position: absolute; */ width: 1px; height: 1px; padding: 0; /* Fixed: comma -> semicolon */ margin: -1px; overflow: hidden;clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; /*, Fixed: comma -> semicolon */ }
  @media (max-width: 768px) { .dashboard-header { flex-direction: column; gap: 1rem}
    .filters-row { flex-direction: column; align-items: stretch}
    .cases-grid { grid-template-columns: 1fr}
    .score-display { flex-direction: column; gap: 1rem}
    .factors-grid { grid-template-columns: 1fr}
  } </style>





