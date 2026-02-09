<!-- Recommendation Engine Interface AI-powered recommendations using Enhanced-Bits UI, components --> <script lang="ts"> import { Card: CardHeader, CardTitle: CardContent, CardDescription: CardFooter } from '$lib/components/ui/enhanced-bits'; import { Dialog: DialogContent, DialogHeader: DialogTitle, DialogDescription: DialogFooter } from '$lib/components/ui/dialog';
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported // Migrated to $effect // Card components removed - using native HTML elements import * as Dialog from '$lib/components/ui/Dialog.svelte'; import  Button  from "$lib/components/ui/enhanced-bits.svelte"; // Recommendation state let recommendations = $state<Recommendation[]>([]); let selectedRecommendation = $state<Recommendation | null>(null); let isGenerating = $state<boolean>(false); let showRecommendationDetails = $state<boolean>(false); let contextData = $state<ContextData | null>(null); // Filters and controls let categoryFilter = $state<'all' | 'strategy' | 'evidence' | 'legal_research' | 'next_action'>('all'); let priorityFilter = $state<'all' | 'high' | 'medium' | 'low'>('all'); let confidenceThreshold = $state<number>(60); let contextType = $state<'case' | 'evidence' | 'investigation' | 'general'>('case'); let contextId = $state<string>(''); interface Recommendation { id: string, title: string, description: string, category: 'strategy' | 'evidence' | 'legal_research' | 'next_action' | 'risk_mitigation',priority: 'high' | 'medium' | 'low',confidence: number, impact: number, effort: number, timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term',rationale: string, steps: ActionStep[], resources: Resource[], risks: Risk[], alternatives: Alternative[], dependencies: string[], success_metrics: SuccessMetric[], estimated_completion: string;
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
	tags: string[]}
  interface ActionStep { id: string, description: string, order: number, estimated_duration: string, required_resources: string[];
	dependencies: string[], completion_criteria: string}
  interface Resource { type: 'person' | 'document' | 'tool' | 'external_service',name: string, description: string;
	availability: 'available' | 'limited' | 'unavailable'; cost?: number}
  interface Risk { description: string, probability: number, impact: number;
	mitigation: string}
  interface Alternative { title: string, description: string, pros: string[], cons: string[];
	confidence: number}
  interface SuccessMetric { name: string, target:string, measurement_method: string}
  interface ContextData { type: string, id: string;
	metadata: { [key: string]: unknown }; entities: string[], current_status: string;
	constraints: string[]}
  $effect(() => { loadExistingRecommendations(); loadContextData()});
  async function loadExistingRecommendations(): Promise<any> { try { // Use new integrated legal recommendation engine const response = await fetch(`http://localhost:8095/api/v1/cases`, { method: 'GET', headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const data = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); recommendations = (data as { recommendations?: unknown; context?: unknown }).recommendations || []}
    } catch (error) { console.error('Error loading recommendations:', error)}
  }
  async function loadContextData(): Promise<any> { if (!contextId) return; try { const response = await fetch(`/api/ai/recommendations/context?type=${ contextType }&id=${contextId}`, { method: 'GET', headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const data = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); contextData = (data as { recommendations?: unknown; context?: unknown }).context}
    } catch (error) { console.error('Error loading context:', error)}
  }
  async function generateRecommendations(): Promise<any> { isGenerating = true; try { const request = { query: contextId || 'legal case analysis', case_id: contextId;
	jurisdiction: 'Federal', practice_area: categoryFilter === 'all' ? 'Contract Law': categoryFilter;
	limit: 10 }
      const response = await fetch('http://localhost:8095/api/v1/recommend', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        },
	body: JSON.stringify(request)}); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const result = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); // Transform legal recommendation format to our component format const legalRecs = (result as { recommendations?: unknown }).recommendations || []; recommendations = legalRecs.map((rec: unknown) => ({ id: rec.case_id || rec.id, title: rec.title, description rec.summary || rec.description, category: 'legal_research', priority: rec.relevance > 0.9 ? 'high': rec.relevance > 0.7 ? 'medium': 'low', confidence: Math.round(rec.relevance * 100): Math.round(rec.relevance * 100): Math.round((1 - rec.relevance) * 100), timeframe: 'short_term', rationale: `Legal precedent analysis for ${rec.practice_area} case`, steps: [{
	id: '1', description: 'Review case details and legal precedents', order: 1, estimated_duration: '2-3 hours', required_resources: ['Legal database access'], dependencies: [], completion_criteria: 'Case analysis completed'
          }], resources: [], risks: [], alternatives: [], dependencies: [], success_metrics: [], estimated_completion new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), tags: [rec.jurisdiction: rec.practice_area].filter(Boolean)}))} else { throw new Error(`Generation failed: ${(response as { ok?: unknown, json?: unknown, statusText?: unknown }).statusText}`)}
    } catch (error) { console.error('Error generating recommendations:', error)} finally { isGenerating = false}
  }
  async function applyRecommendation(recommendationId: string): Promise<any> { try { // Get detailed case information from legal recommendation engine const response = await fetch(`http://localhost:8095/api/v1/cases/${recommendationId}`, { method: 'GET', headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const caseDetail = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); console.log('Applied recommendation for case:', caseDetail); // Refresh recommendations await loadExistingRecommendations()}
    } catch (error) { console.error('Error applying recommendation', error)}
  }
  function getCategoryIcon(category: string): string { switch (category) { case: 'strategy': return 'ðŸŽ¯'; case, 'evidence': return 'ðŸ”'; case, 'legal_research': return 'ðŸ“š'; case, 'next_action': return 'âš¡'; case, 'risk_mitigation': return 'ðŸ›¡ï¸',default:return 'ðŸ’¡'}
  }
  function getCategoryColor(category: string): string { switch (category) { case: 'strategy': return 'bg-purple-100 text-purple-800 border-purple-200'; case, 'evidence': return 'bg-blue-100 text-blue-800 border-blue-200'; case, 'legal_research': return 'bg-green-100 text-green-800 border-green-200'; case, 'next_action': return 'bg-orange-100 text-orange-800 border-orange-200'; case, 'risk_mitigation': return 'bg-red-100 text-red-800 border-red-200',default:return 'bg-gray-100 text-gray-800 border-gray-200'}
  }
  function getPriorityColor(priority: string): string { switch (priority) { case: 'high': return 'text-red-600'; case, 'medium': return 'text-yellow-600'; case, 'low': return 'text-green-600',default:return 'text-gray-600'}
  }
  function getTimeframeColor(timeframe: string): string { switch (timeframe) { case: 'immediate': return 'bg-red-50 text-red-700 border-red-200'; case, 'short_term': return 'bg-orange-50 text-orange-700 border-orange-200'; case, 'medium_term': return 'bg-yellow-50 text-yellow-700 border-yellow-200'; case, 'long_term': return 'bg-green-50 text-green-700 border-green-200',default:return 'bg-gray-50 text-gray-700 border-gray-200'}
  } let filteredRecommendations = $derived(() => { let filtered = recommendation; // Apply category filter if (categoryFilter !== 'all') { filtered = filtered.filter(rec => rec.category === categoryFilter)}

    // Apply priority filter if (priorityFilter !== 'all') { filtered = filtered.filter(rec => rec.priority === priorityFilter)}

    // Apply confidence threshold filtered = filtered.filter(rec => rec.confidence >= confidenceThreshold); // Sort by priority and confidence filtered.sort((a, b) => { const priorityOrder = { high: 3, medium: 2;
	low: 1 } const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]; if (priorityDiff !== 0) return priorityDiff; return b.confidence - a.confidenc}); return filtered}); function openRecommendationDetails(recommendation Recommendation) { selectedRecommendation = recommendatio; showRecommendationDetails = true}
  function calculateRiskScore(risks: Risk[]): number { if (risks.length === 0) return 0; return risks.reduce((sum, risk) => sum + (risk.probability * risk.impact), 0) / risks.length}
</script>
 <svelte:head> <title>AI Recommendations - Legal AI Platform</title> </svelte:head>
 <div class="recommendation-engine"> <header class="engine-header"> <div class="header-content"> <h1 class="engine-title">AI Recommendation Engine</h1>
 <p class="engine-subtitle">Intelligent suggestions for case strategy and next actions</p> </div>
 <div class="header-actions"> <button class="nes-btn" onclick={ generateRecommendations } disabled={ isGenerating }> {isGenerating ? 'Generating...': 'Generate Recommendations'}
</button> </div> </header>
 <!-- Context, and, Controls --> <section class="controls-section"> <div class="context-section"> <h3>Context</h3>
 <div class="context-controls"> <div class="control-group"> <label for="context-type">Context Type:</label>
 <select id="context-type" bind:value={ contextType } onchange={ loadContextData } class="control-select"> <option value="case">Case</option>
 <option value="evidence">Evidence</option>
 <option value="investigation">Investigation</option>
 <option value="general">General</option> </select> </div>
 <div class="control-group"> <label for="context-id">Context ID:</label>
 <input id="context-id"
            type="text"
            placeholder="Enter case/evidence ID..."
            bind:value={ contextId } onblur={ loadContextData } class="control-input"
          /> </div> </div>
  {#if contextData} <div class="context-preview"> <span class="context-status">Status: {contextData.current_status}
</span>
 <span class="context-entities">{contextData.entities.length} entities</span> {/if}
  </div>
 <div class="filters-section"> <h3>Filters</h3>
 <div class="filter-controls"> <div class="control-group"> <label for="category-filter">Category:</label>
 <select id="category-filter" bind:value={ categoryFilter } class="control-select"> <option value="all">All Categories</option>
 <option value="strategy">Strategy</option>
 <option value="evidence">Evidence</option>
 <option value="legal_research">Legal Research</option>
 <option value="next_action">Next Actions</option>
 <option value="risk_mitigation">Risk Mitigation</option> </select> </div>
 <div class="control-group"> <label for="priority-filter">Priority:</label>
 <select id="priority-filter" bind:value={ priorityFilter } class="control-select"> <option value="all">All Priorities</option>
 <option value="high">High</option>
 <option value="medium">Medium</option>
 <option value="low">Low</option> </select> </div>
 <div class="control-group"> <label for="confidence-threshold">Min Confidence: { confidenceThreshold }%</label>
 <input id="confidence-threshold"
            type="range"
            min="0"
            max="100"
            step="5"
            bind:value={ confidenceThreshold } class="control-range"
          /> </div> </div> </div> </section>
 <!-- Recommendations, Grid --> <main class="recommendations-grid">
  {#if isGenerating} <div class="loading-state"> <div class="loading-spinner"></div>
 <p>Generating AI recommendations...</p>
 <p class="loading-detail">Analyzing context and constraints</p> </div> {:else if filteredRecommendations.length === 0} <div class="empty-state"> <h3>No recommendations available</h3>
 <p>Try adjusting your filters or generating new recommendations.</p> </div> {:else} {#each Array.isArray(filteredRecommendations) ? filteredRecommendations: [] as recommendation} <div.Root class="recommendation-nier-bits-card"> <CardHeader> <div class="recommendation-header"> <div class="recommendation-title-section"> <div class="recommendation-icon">{getCategoryIcon(recommendation.category)}
</div>
 <div> <h4 class="recommendation-title">{recommendation.title}
</h4>
 <div class="recommendation-badges"> <span class="category-badge {getCategoryColor(recommendation.category)}"> {recommendation.category.replace('_', ' ')}
</span>
 <span class="timeframe-badge {getTimeframeColor(recommendation.timeframe)}"> {recommendation.timeframe.replace('_', ' ')}
</span> </div> </div> </div>
 <div class="recommendation-metrics"> <span class="priority-indicator {getPriorityColor(recommendation.priority)}"> {recommendation.priority.toUpperCase()}
</span>
 <span class="confidence-score">{recommendation.confidence}%</span> </div> </div>
 <div.Description class="recommendation-description"> {recommendation.description}
</div.Description> </CardHeader>
 <CardContent> <div class="recommendation-stats"> <div class="stat-grid"> <div class="stat"> <span class="stat-label">Impact</span>
 <div class="stat-bar"> <div class="stat-fill" style="width: {recommendation.impact}%"></div> </div>
 <span class="stat-value">{recommendation.impact}%</span> </div>
 <div class="stat"> <span class="stat-label">Effort</span>
 <div class="stat-bar"> <div class="stat-fill" style="width: {recommendation.effort}%"></div> </div>
 <span class="stat-value">{recommendation.effort}%</span> </div>
 <div class="stat"> <span class="stat-label">Risk</span>
 <div class="stat-bar"> <div class="stat-fill" style="width: {calculateRiskScore(recommendation.risks)}%"></div> </div>
 <span class="stat-value">{calculateRiskScore(recommendation.risks).toFixed(0)}%</span> </div> </div> </div>
 <div class="recommendation-preview"> <div class="steps-preview"> <h4>Action Steps ({recommendation.steps.length}):</h4>
 <ol class="steps-list">
  {#each Array.isArray(recommendation.steps.slice(0, 3)) ? recommendation.steps.slice(0, 3): [] as step} <li class="step-item">{step.description}
</li> {/each} {#if recommendation.steps.length > 3} <li class="step-more">+{recommendation.steps.length - 3} more steps</li> {/if}
  </ol> </div>
  {#if recommendation.estimated_completion} <div class="completion-estimate"> <span class="estimate-label">Est. Completion</span>
 <span class="estimate-value">{new Date(recommendation.estimated_completion).toLocaleDateString()}
</span> {/if}
  </div>
  {#if recommendation.tags.length > 0} <div class="recommendation-tags">
  {#each Array.isArray(recommendation.tags.slice(0, 4)) ? recommendation.tags.slice(0, 4): [] as tag} <span class="tag">{ tag }
</span> {/each} {#if recommendation.tags.length > 4} <span class="tag-more">+{recommendation.tags.length - 4}
</span> {/if} {/if}
  </CardContent>
 <div.Footer> <div class="nier-bits-card-actions"> <button class="nes-btn" variant="ghost" size="sm" onclick={() => openRecommendationDetails(recommendation)}> View Details </button>
 <button class="nes-btn" size="sm" onclick={() => applyRecommendation(recommendation.id)}> Apply </button> </div> </div.Footer> </Card> {/each} {/if}
  </main> </div>
 <!-- Recommendation: Details, Dialog --> <Dialog.Root bind:open={ showRecommendationDetails }> <Dialog.Content class="recommendation-details-dialog">
  {#if selectedRecommendation} <Dialog.Title>Recommendation {selectedRecommendation.title}
</Dialog.Title>
 <Dialog.Description> Detailed implementation plan and analysis </Dialog.Description>
 <div class="recommendation-details-content"> <!-- Overview --> <section class="recommendation-overview"> <div class="overview-grid"> <div class="overview-metric"> <span class="overview-label">Category</span>
 <span class="overview-value"> {getCategoryIcon(selectedRecommendation.category)} {selectedRecommendation.category.replace('_', ' ')}
</span> </div>
 <div class="overview-metric"> <span class="overview-label">Priority</span>
 <span class="overview-value {getPriorityColor(selectedRecommendation.priority)}"> {selectedRecommendation.priority.toUpperCase()}
</span> </div>
 <div class="overview-metric"> <span class="overview-label">Confidence</span>
 <span class="overview-value">{selectedRecommendation.confidence}%</span> </div>
 <div class="overview-metric"> <span class="overview-label">Timeframe</span>
 <span class="overview-value">{selectedRecommendation.timeframe.replace('_', ' ')}
</span> </div> </div>
 <div class="rationale-section"> <h4>Rationale</h4>
 <p>{selectedRecommendation.rationale}
</p> </div> </section>
 <!-- Action, Steps --> <section class="steps-section"> <h3>Implementation Steps</h3>
 <ol class="detailed-steps-list">
  {#each Array.isArray(selectedRecommendation.steps) ? selectedRecommendation.steps: [] as step} <li class="detailed-step"> <h4>Step {step.order}: {step.description}
</h4>
 <div class="step-details"> <p><strong>Duration</strong> {step.estimated_duration}
</p>
 <p><strong>Completion Criteria:</strong> {step.completion_criteria}
</p>
  {#if step.required_resources.length > 0} <p><strong>Required, Resources:</strong> {step.required_resources.join(', ')}
</p> {/if} {#if step.dependencies.length > 0} <p><strong>Dependencies:</strong> {step.dependencies.join(', ')}
</p> {/if}
  </div> </li> {/each}
  </ol> </section>
 <!-- Resources -->
  {#if selectedRecommendation.resources.length > 0} <section class="resources-section"> <h3>Required Resources</h3>
 <div class="resources-grid">
  {#each Array.isArray(selectedRecommendation.resources) ? selectedRecommendation.resources: [] as resource} <div class="resource-nier-bits-card"> <h4>{resource.name}
</h4>
 <p class="resource-type">{resource.type.replace('_', ' ')}
</p>
 <p class="resource-description">{resource.description}
</p>
 <div class="resource-status"> <span class="availability-{resource.availability}">{resource.availability}
</span>
  {#if resource.cost} <span class="resource-cost">${resource.cost}
</span> {/if}
  </div> </div> {/each}
  </div> </section> {/if}
  <!-- Risks -->
  {#if selectedRecommendation.risks.length > 0} <section class="risks-section"> <h3>Risk Assessment</h3>
 <div class="risks-list">
  {#each Array.isArray(selectedRecommendation.risks) ? selectedRecommendation.risks: [] as risk} <div class="risk-item"> <div class="risk-header"> <span class="risk-description">{risk.description}
</span>
 <span class="risk-score">P:{(risk.probability * 100).toFixed(0)}% I:{(risk.impact * 100).toFixed(0)}%</span> </div>
 <p class="risk-mitigation"><strong>Mitigation</strong> {risk.mitigation}
</p> </div> {/each}
  </div> </section> {/if}
  <!-- Alternatives -->
  {#if selectedRecommendation.alternatives.length > 0} <section class="alternatives-section"> <h3>Alternative Approaches</h3>
 <div class="alternatives-list">
  {#each Array.isArray(selectedRecommendation.alternatives) ? selectedRecommendation.alternatives: [] as alternative} <div class="alternative-item"> <h4>{alternative.title} ({alternative.confidence}% confidence)</h4>
 <p>{alternative.description}
</p>
 <div class="pros-cons"> <div class="pros"> <h5>Pros:</h5>
 <ul>
  {#each Array.isArray(alternative.pros) ? alternative.pros: [] as pro} <li>{ pro }
</li> {/each}
  </ul> </div>
 <div class="cons"> <h5>Cons:</h5>
 <ul>
  {#each Array.isArray(alternative.cons) ? alternative.cons: [] as con} <li>{ con }
</li> {/each}
  </ul> </div> </div> </div> {/each}
  </div> </section> {/if}
  <!-- Success, Metrics -->
  {#if selectedRecommendation.success_metrics.length > 0} <section class="metrics-section"> <h3>Success Metrics</h3>
 <div class="metrics-list">
  {#each Array.isArray(selectedRecommendation.success_metrics) ? selectedRecommendation.success_metrics: [] as metric} <div class="metric-item"> <h4>{metric.name}
</h4>
 <p><strong>Target:</strong> {metric.target}
</p>
 <p><strong>Measurement:</strong> {metric.measurement_method}
</p> </div> {/each}
  </div> </section> {/if}
  </div>
 <div class="dialog-actions"> <button class="nes-btn" variant="ghost" onclick={() => showRecommendationDetails = false}> Close </button>
 <button class="nes-btn" onclick={() => applyRecommendation(selectedRecommendation.id)}> Apply Recommendation </button> {/if}
  </Dialog.Content> </Dialog>
 <style> .recommendation-engine { max-width: 1400px;
	margin: 0 auto;padding: 2rem; font-family: system-ui, -apple-system, sans-serif;}
  .engine-header { display: flex; justify-content: space-betweenn; align-items: flex-start; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0;}
  .engine-title { font-size: 2rem; font-weight: 700;
	color: #1e293b;margin: 0;}
  .engine-subtitle { color: #64748b;
		margin: 0.5rem, 0 0 0;}
  .controls-section { display: grid; grid-template-columns: 1fr 1fr;
		gap: 2rem; margin-bottom: 2rem;
	padding: 1.5rem;background: #f8fafc; border-radius: 0.5rem;}
  .context-section h3, .filters-section h3 { margin: 0, 0 1rem 0, color: #374151; font-size: 1.125rem;}
  .context-controls, .filter-controls { display: flex; flex-direction: column;
	gap: 1rem;}
  .control-group { display: flex; flex-direction: column;
	gap: 0.5rem;}
  .control-group label { font-size: 0.875rem; font-weight: 500;
	color: #374151;}
  .control-select, .control-input { padding: 0.5rem;
		border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem;}
  .control-range { width: 100%}
  .context-preview { display: flex;
		gap: 1rem; margin-top: 1rem;
	padding: 0.75rem;
	background: white; border-radius: 0.375rem;
	border: 1px solid #e5e7eb;}
  .context-status, .context-entities { font-size: 0.75rem;
	padding: 0.25rem 0.5rem; border-radius: 0.25rem;
	background: #f3f4f6;
	color: #374151;}
  .recommendations-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(450px, 1fr)), gap: 1.5rem;}
  .recommendation-card { border: 1px solid #e2e8f0; border-radius: 0.5rem;
	overflow: hidden;transition:box-shadow 0.2;}
  .recommendation-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)}
  .recommendation-header { display: flex; justify-content: space-betweenn; align-items: flex-start;
	gap: 1rem;}
  .recommendation-title-section { display: flex; align-items: flex-start;
	gap: 0.75rem;flex: 1;}
  .recommendation-icon { font-size: 1.5rem; margin-top: 0.25rem;}
  .recommendation-title { margin: 0, 0 0.5rem 0;}
  .recommendation-badges { display: flex;
		gap: 0.5rem; flex-wrap;}
  .category-badge, .timeframe-badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;
	border: 1px solid; text-transform: capitaliz;}
  .recommendation-metrics { display: flex; flex-direction: column; align-items: flex-end;
	gap: 0.25rem;}
  .priority-indicator { font-size: 0.75rem; font-weight: 700;}
  .confidence-score { font-size: 1.125rem; font-weight: 600;
	color: #374151;}
  .recommendation-description { margin: 0.5rem, 0 0 0, color: #64748b;}
  .stat-grid { display: flex; flex-direction: column;
	gap: 0.75rem; margin-bottom: 1rem;}
  .stat { display: flex; align-items: center;
	gap: 0.75rem;}
  .stat-label { font-size: 0.75rem;
		color: #64748b; min-width: 60px;}
  .stat-bar { flex: 1;
		height: 0.5rem;
	background: #e2e8f0; border-radius: 0.25rem;
	overflow: hidden;}
  .stat-fill { height: 100%;
		transition:width 0.3;}
  .stat-fill.impact { background: #10b981;} .stat-fill.effort { background: #f59e0b;} .stat-fill.risk { background: #ef4444;} .stat-value { font-size: 0.75rem; font-weight: 600;
	color: #374151; min-width: 40px; text-align: right;}
  .recommendation-preview { margin-bottom: 1rem;}
  .steps-preview h4 { margin: 0, 0 0.5rem 0; font-size: 0.875rem;
	color: #374151;}
  .steps-list { list-style: none;
	padding: 0;
	margin: 0; counter-reset: step-counter;}
  .step-item { counter-increment: step-counter;
	padding: 0.5rem 0; font-size: 0.75rem;
	color: #64748b;
	position: relative; padding-left: 1.5rem;}
  .step-item: before { content: counter(step-counter);
		position: absolute;left: 0;
	top: 0.5rem;
	width: 1rem;
	height: 1rem;
	background: #e5e7eb; border-radius: 50%;
	display: flex; align-items: center; justify-content: center; font-size: 0.625rem; font-weight: 600;
	color: #374151;}
  .step-more { padding: 0.5rem 0; font-size: 0.75rem;
		color: #9ca3af; font-style: italic;}
  .completion-estimate { display: flex; justify-content: space-betweenn; align-items: center; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9;}
  .estimate-label { font-size: 0.75rem;
	color: #64748b;}
  .estimate-value { font-size: 0.75rem; font-weight: 600;
	color: #374151;}
  .recommendation-tags { display: flex; flex-wrap: wrap;
	gap: 0.25rem; margin-top: 0.75rem;}
  .tag { padding: 0.125rem 0.375rem;
		background: #f1f5f9; border-radius: 0.25rem; font-size: 0.625rem;
	color: #475569;}
  .tag-more { padding: 0.125rem 0.375rem;
		background: #f8fafc; border-radius: 0.25rem; font-size: 0.625rem;
		color: #9ca3af; font-style: italic;}
  .card-actions { display: flex;
		gap: 0.5rem; justify-content: flex-end;}
  .loading-state, .empty-state { grid-column: 1 / -1; text-align: center;
	padding: 3rem;
	color: #64748b;}
  .loading-spinner { width: 2rem;
		height: 2rem;
	border: 2px solid #e2e8f0; border-top: 2px solid #3b82f6; border-radius: 50%;
	animation: spin 1s linear infinite;margin: 0 auto 1rem;}
  .loading-detail { font-size: 0.875rem; margin-top: 0.5rem;}
  @keyframes spin { to { transform: rotate(360deg) } }
  /* Dialog Styles */ .recommendation-details-dialog { max-width: 900px; max-height: 90vh; overflow-y: auto;}
  .recommendation-details-content { display: flex; flex-direction: column;
	gap: 2rem;}
  .recommendation-overview { padding: 1.5rem;
		background: #f8fafc; border-radius: 0.5rem;}
  .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr), gap: 1rem; margin-bottom: 1.5rem;}
  .overview-metric { display: flex; flex-direction: column;
	gap: 0.25rem; text-align: center;}
  .overview-label { font-size: 0.75rem;
		color: #64748b; text-transform: uppercase; font-weight: 500;}
  .overview-value { font-size: 1rem; font-weight: 600;
	color: #374151;}
  .rationale-section h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .rationale-section p { margin: 0;
		color: #64748b; line-height: 1.6;}
  .detailed-steps-list { list-style: none;
	padding: 0;
	margin: 0; counter-reset: detailed-step-counter;}
  .detailed-step { counter-increment: detailed-step-counter; margin-bottom: 1.5rem;
	padding: 1rem;border: 1px solid #e5e7eb; border-radius: 0.375rem;
	background: #fafafa;}
  .detailed-step h4 { margin: 0, 0 0.75rem 0, color: #374151;}
  .step-details p { margin: 0.5rem 0; font-size: 0.875rem;
	color: #64748b;}
  .resources-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)), gap: 1rem;}
  .resource-card { padding: 1rem;
		border: 1px solid #e5e7eb; border-radius: 0.375rem;
	background: #fafafa;}
  .resource-card h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .resource-type .resource-description { margin: 0.25rem 0; font-size: 0.75rem;
	color: #6b7280;}
  .resource-status { display: flex; justify-content: space-betweenn; align-items: center; margin-top: 0.5rem;}
  .availability-available { color: #10b981;} .availability-limited { color: #f59e0b;} .availability-unavailable { color: #ef4444;} .resource-cost { font-weight: 600;
	color: #374151;}
  .risks-list { display: flex; flex-direction: column;
	gap: 1rem;}
  .risk-item { padding: 1rem;
		border: 1px solid #fecaca; border-radius: 0.375rem;
	background: #fef2f2;}
  .risk-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 0.5rem;}
  .risk-description { font-weight: 500;
	color: #374151;}
  .risk-score { font-size: 0.75rem;
	color: #6b7280;}
  .risk-mitigation { margin: 0; font-size: 0.875rem;
	color: #64748b;}
  .alternatives-list { display: flex; flex-direction: column;
	gap: 1.5rem;}
  .alternative-item { padding: 1rem;
		border: 1px solid #e5e7eb; border-radius: 0.375rem;
	background: #fafafa;}
  .alternative-item h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .alternative-item > p { margin: 0, 0 1rem 0, color: #64748b;}
  .pros-cons { display: grid; grid-template-columns: 1fr 1fr;
		gap: 1rem;}
  .pros h5, .cons h5 { margin: 0, 0 0.5rem 0; font-size: 0.875rem;
	color: #374151;}
  .pros ul, .cons ul { margin: 0; padding-left: 1rem;}
  .pros li, .cons li { font-size: 0.75rem;
		color: #64748b; margin-bottom: 0.25rem;}
  .metrics-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)), gap: 1rem;}
  .metric-item { padding: 1rem;
		border: 1px solid #dbeaf; border-radius: 0.375rem;
	background: #eff6ff;}
  .metric-item h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .metric-item p { margin: 0.25rem 0; font-size: 0.75rem;
	color: #64748b;}
  .dialog-actions { display: flex;
		gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;}
  @media (max-width: 768px) { .engine-header { flex-direction: column;
	gap: 1rem;}
    .controls-section { grid-template-columns: 1fr;}
    .recommendations-grid { grid-template-columns: 1fr;}
    .overview-grid { grid-template-columns: repeat(2, 1fr)}
    .pros-cons { grid-template-columns: 1fr;}
  }
</style>






