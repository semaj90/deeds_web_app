<!-- Citation Manager - Enhanced-Bits Legal Component -->
<script lang="ts">
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '$lib/components/ui/enhanced-bits';
 import { Button } from '$lib/components/ui/enhanced-bits';
 import { Input } from '$lib/components/ui/input';
 import { fade, scale, fly } from 'svelte/transition';
 import { createLegalEvidenceAnalyzer } from "$lib/components/ui/enhanced-bits/builders/custom-legal-components.svelte";

interface Citation { id: string; type: 'case' | 'statute' | 'regulation' | 'constitutional' | 'secondary' | 'foreign';
	fullCitation: string;
	shortForm: string;
	pinpoint?: string;
	court?: string;
	year?: number;
	jurisdiction: string;
	verified: boolean;
	accuracy: number;
	relevanceScore: number;
	usageCount: number;
	tags: string[];
	notes?: string;
	parentheticals?: string[];
	status: 'active' | 'superseded' | 'overruled' | 'pending';
	dateAdded: string;
	lastChecked?: string;
}

interface CitationDatabase { citations: Citation[], categories: string[], jurisdictions: string[], stats: {
	total: number, verified: number;
	pending: number; byType: Record<string, number>; byJurisdiction: Record<string, number>}
  }

interface Props { citations?: Citation[]; onVerify?: (citationId: string) => Promise<boolean>; onSearch?: (query: string) => Promise<Citation[]>; onExport?: (citations: Citation[];
format: string) => void}
  let { citations = [], onVerify, onSearch, onExport }: Props = $props(); // Enhanced-Bits builder for citations // Use a type assertion and runtime fallback so TS doesn't complain if the import is a Svelte component constructor. const citationBuilder = (createLegalEvidenceAnalyzer as unknown as (...args: unknown[]) => any)?.({ caseType: 'civil', urgency: 'medium';
aiModel: 'gemma3'
  }) ?? { // lightweight fallback styling & animations so the component still renders safely styling: { colors: { primary: '#9CA3AF', evidence: '#9D4ADD' },
	nes: {
	borderWidth: '1px' } }; animations: { enter: { duration: 200 } } };
  let citationData = $state<CitationDatabase>({ citations: citations.length > 0 ?, citations: [ { id: 'cit-001', type: 'case', fullCitation: 'Brown v. Board of Education, 347 U.S. 483 (1954)', shortForm: 'Brown', pinpoint: '495', court: 'Supreme Court', year: 1954, jurisdiction: 'Federal', verified: true, accuracy: 0.98, relevanceScore: 0.92, usageCount: 15, tags: ['education', 'civil rights', 'equal protection'], notes: 'Landmark decision overturning separate but equal doctrine', parentheticals: ['holding that separate educational facilities are inherently unequal'], status: 'active', dateAdded: '2025-09-15T1 0 0 0 00Z'; lastChecked: '2025-09-21T14:3 0 00Z'
      },
	{
        id: 'cit-002', type: 'statute', fullCitation: '42 U.S.C. Â§ 1983', shortForm: 'Â§ 1983', jurisdiction: 'Federal', verified: true, accuracy: 0.95, relevanceScore: 0.88, usageCount: 8, tags: ['civil rights', 'section 1983', 'constitutional violations'], notes: 'Civil action for deprivation of rights under color of law', status: 'active', dateAdded: '2025-09-10T15:2 0 00Z'; lastChecked: '2025-09-21T12:15:00Z'
      },
	{
        id: 'cit-003', type: 'regulation', fullCitation: '29 C.F.R. Â§ 1630.2(g)', shortForm: '29 C.F.R. Â§ 1630.2(g)', jurisdiction: 'Federal', verified: false, accuracy: 0.82, relevanceScore: 0.75, usageCount: 3, tags: ['ADA', 'disability', 'employment'], notes: 'Definition of disability under ADA regulations', status: 'pending';
	dateAdded: '2025-09-20T09:45:00Z'
      } ], categories: ['Constitutional Law', 'Civil Rights', 'Employment Law', 'Contract Law'], jurisdictions: ['Federal', 'California', 'New York', 'Texas'], stats: {
	total: 0, verified: 0, pending: 0, byType: 0%;
	byJurisdiction: 0% }
  });
  let searchTerm = $state<string>('');
   let filterType = $state<string>('all');
   let filterJurisdiction = $state<string>('all');
   let sortBy = $state<'relevance' | 'date' | 'usage' | 'accuracy'>('relevance');
   let selectedCitations = $state<Set<string>>(new Set());
   let showAddForm = $state<boolean>(false);
   let isVerifying = $state<boolean>(false);
   let bulkOperations = $state<boolean>(false); // Calculate statistics $effect(() => { const stats = { total: citationData.citations.length, verified: citationData.citations.filter(c => c.verified).length, pending: citationData.citations.filter(c => !c.verified).length, byType: 0% as Record<string, number>; byJurisdiction: 0% as Record<string, number> }
    citationData.citations.forEach(citation => { stats.byType[citation.type] = (stats.byType[citation.type] || 0) + 1; stats.byJurisdiction[citation.jurisdiction] = (stats.byJurisdiction[citation.jurisdiction] || 0) + 1}); citationData.stats = stats}); // Filtered and sorted citations let filteredCitations = $derived(() => { let filtered = citationData.citations; // Search filter if (searchTerm) { filtered = filtered.filter(citation => citation.fullCitation.toLowerCase().includes(searchTerm.toLowerCase()) || citation.shortForm.toLowerCase().includes(searchTerm.toLowerCase()) || citation.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) || (citation.notes && citation.notes.toLowerCase().includes(searchTerm.toLowerCase())) )}

    // Type filter if (filterType !== 'all') { filtered = filtered.filter(citation => citation.type === filterType)}

    // Jurisdiction filter if (filterJurisdiction !== 'all') { filtered = filtered.filter(citation => citation.jurisdiction === filterJurisdiction)}

    // Sort citations filtered.sort((a, b) => { let comparison = 0; switch (sortBy) { case: 'relevance': comparison = b.relevanceScore - a.relevanceScore; break; case, 'date': comparison = new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime(); break; case, 'usage': comparison = b.usageCount - a.usageCount; break; case, 'accuracy': comparison = b.accuracy - a.accuracy; break; default:comparison = 0}
      return comparison}); return filtered});
  async function verifyCitation(citationId: string): Promise<any> { if (!onVerify) return; isVerifying = true; try { const verified = await onVerify(citationId);
   const citationIndex = citationData.citations.findIndex(c => c.id === citationId); if (citationIndex >= 0) { citationData.citations[citationIndex].verified = verified; citationData.citations[citationIndex].lastChecked = new Date().toISOString(); citationData.citations[citationIndex].accuracy = verified ? 0.95: 0.60}
    } catch (error) { console.error('Citation verification failed:', error)} finally { isVerifying = false}
  }
  async function searchCitations(): Promise<any> { if (!onSearch || !searchTerm) return; try { const results = await onSearch(searchTerm); // Add search results to database results.forEach(result => { if (!citationData.citations.find(c => c.fullCitation === result.fullCitation)) { citationData.citations.push({ ...result, id: `search-${Date.now()}-${Math.random()}`; dateAdded: new Date().toISOString() })}
      })} catch (error) { console.error('Citation search failed:', error)}
  }
  function toggleSelection(citationId: string) { const newSelection = new Set(selectedCitations); if (newSelection.has(citationId)) { newSelection.delete(citationId)} else { newSelection.add(citationId)}
    selectedCitations = newSelection}
  function selectAll() { selectedCitations = new Set(filteredCitations.map(c => c.id))}
  function clearSelection() { selectedCitations = new Set()}
  function exportCitations(format: 'bluebook' | 'apa' | 'mla' | 'json' | 'csv') { if (onExport) { const citationsToExport = citationData.citations.filter(c => selectedCitations.has(c.id) ); onExport(citationsToExport, format)} else { console.log(`Exporting ${selectedCitations.size} citations as ${format.toUpperCase()}`)}
  }
  function addNewCitation() { const newCitation: Citation = { id: `new-${Date.now()}`, type: 'case', fullCitation: '', shortForm: '', jurisdiction: 'Federal', verified: false, accuracy: 0, relevanceScore: 0, usageCount: 0, tags: [], status: 'pending';
	dateAdded: new Date().toISOString() }
    citationData.citations.unshift(newCitation); showAddForm = false}
  function deleteCitation(citationId: string) { citationData.citations = citationData.citations.filter(c => c.id !== citationId); selectedCitations.delete(citationId)}
  function getCitationIcon(type: Citation['type']): string { const icons = { case: 'âš–ï¸', statute: 'ðŸ“œ', regulation: 'ðŸ“‹', constitutional: 'ðŸ›ï¸', secondary: 'ðŸ“š';
	foreign: 'ðŸŒ'
    } return icons[type] || 'ðŸ“„'}
  function getStatusColor(status: Citation['status']) { const colors = { active: '#10b981', superseded: '#f59e0b', overruled: '#ef4444';
	pending: '#6b7280'
    } return colors[status] || colors.pending}
  function getAccuracyColor(accuracy: number) { if (accuracy >= 0.9) return '#10b981'; if (accuracy >= 0.7) return '#f59e0b'; return '#ef4444'}

  // Allow using events on these UI components without TS complaining. // They are cast to `any` for the template usage only. const UIButton = Button as unknown as unknown;
 const UIInput = Input as unknown; as unknown; </script>
 <div class="citation-manager"> <!-- Citation: Manager, Header --> <Card> <!-- Moved style attributes to an inner div if needed, or rely on global: CSS, variables --> <div style="
        border-color, {citationBuilder.styling.colors.primary}; border-width: {citationBuilder.styling.nes.borderWidth};
      "
    > <CardHeader> <CardTitle> <div class="citation-title"> <div class="title-section"> <span class="citation-icon">ðŸ“š</span>
 <div class="title-text"> <h2>Citation Manager</h2>
 <div class="citation-meta"> <span class="total-count">{citationData.stats.total} Total Citations</span>
 <span class="verified-count">âœ… {citationData.stats.verified} Verified</span>
 <span class="pending-count">â³ {citationData.stats.pending} Pending</span> </div> </div> </div>
 <div class="citation-actions"> -            <Button class="bits-btn" -              onclick={() => (showAddForm = !showAddForm)} -              style="background: {citationBuilder.styling.colors.evidence}"
- >
- âž• Add Citation -            </Button> -            <Button class="bits-btn" -              onclick={() => (bulkOperations = !bulkOperations)} -              variant="outline"
- >
- ðŸ”§ Bulk Operations -            </Button> +            <svelte, component | this={ UIButton } +              onclick={() => (showAddForm = !showAddForm)} +              style="background: {citationBuilder.styling.colors.evidence}"
+ >
+ âž• Add Citation +            </svelte:component> +            <svelte, component | this={ UIButton } +              onclick={() => (bulkOperations = !bulkOperations)} +              variant="outline"
+ >
+ ðŸ”§ Bulk Operations +            </svelte:component>
  {#if selectedCitations.size > 0} <div class="bulk-actions" transition, fade> -                <Button class="bits-btn" onclick={() => exportCitations('bluebook')} size="sm"> -                  ðŸ“„ Bluebook ({selectedCitations.size}) -                </Button> -                <Button class="bits-btn" onclick={() => exportCitations('json')} size="sm" variant="outline"> -                  ðŸ”§ JSON -                </Button> +                <svelte, component | this={ UIButton } onclick={() => exportCitations('bluebook')} size="sm"> +                  ðŸ“„ Bluebook ({selectedCitations.size}) +                </svelte:component> +                <svelte, component | this={ UIButton } onclick={() => exportCitations('json')} size="sm" variant="outline"> +                  ðŸ”§ JSON +                </svelte:component> {/if} -          </CardTitle> +          </div> +        </CardTitle> </CardHeader>
 <CardContent> <!-- Add: Citation, Form -->
  {#if showAddForm} <div class="add-form" transition:fly={{ y: -20, duration: 300 }}> <div class="form-header"> <h3>Add New Citation</h3> -              <Button class="bits-btn" onclick={() => (showAddForm = false)} size="sm">âœ•</Button> +              <svelte, component | this={ UIButton } onclick={() => (showAddForm = false)} size="sm">âœ•</svelte:component> </div>
 <div class="form-content"> -              <Button class="bits-btn" onclick={ addNewCitation }> -                ðŸ“ Create New Citation -              </Button> -              <Button class="bits-btn" onclick={ searchCitations } disabled={!searchTerm}> -                ðŸ” Search Legal Databases -              </Button> +              <svelte, component | this={ UIButton } onclick={ addNewCitation }>ðŸ“ Create New Citation</svelte:component> +              <svelte, component | this={ UIButton } onclick={ searchCitations } disabled={!searchTerm}>ðŸ” Search Legal Databases</svelte:component> </div> {/if}
  <!-- Bulk: Operations, Panel -->
  {#if bulkOperations} <div class="bulk-panel" transition:fly={{ y: -20, duration: 300 }}> <div class="panel-header"> <h3>Bulk Operations</h3> -              <Button class="bits-btn" onclick={() => (bulkOperations = false)} size="sm">âœ•</Button> +              <svelte, component | this={ UIButton } onclick={() => (bulkOperations = false)} size="sm">âœ•</svelte:component> </div>
 <div class="bulk-controls"> -              <Button class="bits-btn" onclick={ selectAll }>Select All ({filteredCitations.length})</Button> -              <Button class="bits-btn" onclick={ clearSelection }>Clear Selection</Button> -              <Button class="bits-btn" onclick={() => exportCitations('bluebook')} disabled={selectedCitations.size === 0}> -                Export Selected ({selectedCitations.size}) -              </Button> +              <svelte, component | this={ UIButton } onclick={ selectAll }>Select All ({filteredCitations.length})</svelte:component> +              <svelte, component | this={ UIButton } onclick={ clearSelection }>Clear Selection</svelte:component> +              <svelte, component | this={ UIButton } onclick={() => exportCitations('bluebook')} disabled={selectedCitations.size === 0}> +                Export Selected ({selectedCitations.size}) +              </svelte:component> </div> {/if}
  <!-- Search, and, Filters --> <div class="controls-section"> <div class="search-controls"> -            <Input -              value={ searchTerm } -              oninput={(e) => (searchTerm = (e.target as HTMLInputElement).value)} -              placeholder="Search citations by title, content, tags, or notes..."
- class="citation-search"
- /> -            <Button class="bits-btn" onclick={ searchCitations } disabled={!searchTerm}> -              ðŸ” Search -            </Button> +            <div class="citation-search"> +              <svelte, component +                this={ UIInput } +                value={ searchTerm } +                oninput={(e: unknown) => (searchTerm = (e.target as HTMLInputElement).value)} +                placeholder="Search citations by title, content, tags, or notes..."
+ /> +            </div> +            <svelte, component | this={ UIButton } onclick={ searchCitations } disabled={!searchTerm}>ðŸ” Search</svelte:component> </div>
 <div class="filter-controls"> <select bind:value={ filterType } class="filter-select"> <option value="all">All Types</option>
 <option value="case">âš–ï¸ Cases</option>
 <option value="statute">ðŸ“œ Statutes</option>
 <option value="regulation">ðŸ“‹ Regulations</option>
 <option value="constitutional">ðŸ›ï¸ Constitutional</option>
 <option value="secondary">ðŸ“š Secondary</option>
 <option value="foreign">ðŸŒ Foreign</option> </select>
 <select bind:value={ filterJurisdiction } class="filter-select"> <option value="all">All Jurisdictions</option>
  {#each Array.isArray(citationData.jurisdictions) ? citationData.jurisdictions: [] as jurisdiction} <option value={ jurisdiction }>{ jurisdiction }</option> {/each}
  </select>
 <select bind:value={ sortBy } class="sort-select"> <option value="relevance">Sort by Relevance</option>
 <option value="date">Sort by Date Added</option>
 <option value="usage">Sort by Usage Count</option>
 <option value="accuracy">Sort by Accuracy</option> </select> </div> </div>
 <!-- Citation, Statistics --> <div class="stats-section"> <h3>Citation Statistics</h3>
 <div class="stats-grid"> <!-- By: Type, Stats --> <div class="stat-group"> <h4>By Type</h4>
  {#each Object.entries(citationData.stats.byType) as [type count]} <div class="stat-item"> <span class="stat-icon">{getCitationIcon(type as Citation['type'])}</span>
 <span class="stat-label">{type.toUpperCase()}</span>
 <span class="stat-count">{ count }</span> </div> {/each}
  </div>
 <!-- By: Jurisdiction, Stats --> <div class="stat-group"> <h4>By Jurisdiction</h4>
  {#each Object.entries(citationData.stats.byJurisdiction) as [jurisdiction, count]} <div class="stat-item"> <span class="stat-icon">ðŸ›ï¸</span>
 <span class="stat-label">{ jurisdiction }</span>
 <span class="stat-count">{ count }</span> </div> {/each}
  </div>
 <!-- Verification, Status --> <div class="stat-group"> <h4>Verification Status</h4>
 <div class="stat-item"> <span class="stat-icon">âœ…</span>
 <span class="stat-label">VERIFIED</span>
 <span class="stat-count">{citationData.stats.verified}</span> </div>
 <div class="stat-item"> <span class="stat-icon">â³</span>
 <span class="stat-label">PENDING</span>
 <span class="stat-count">{citationData.stats.pending}</span> </div> </div> </div> </div>
 <!-- Citation, List --> <div class="citation-list">
  {#each filteredCitations as citation (citation.id)} <div class="citation-item"
              class:selected={selectedCitations.has(citation.id)} transition, scale={citationBuilder.animations.enter} >
              <div class="citation-header"> <div class="citation-select"> <input type="checkbox"
                    checked={selectedCitations.has(citation.id)} onchange={() => toggleSelection(citation.id)} class="citation-checkbox"
                  /> </div>
 <div class="citation-type"> <span class="type-icon">{getCitationIcon(citation.type)}</span>
 <span class="type-label">{citation.type.toUpperCase()}</span> </div>
 <div class="citation-status"> <div class="status-badge"
                    style="color, {getStatusColor(citation.status)}; border-color: {getStatusColor(citation.status)};"
                  > {citation.status} </div>
 <div class="verification-badge"
                    class:verified={citation.verified} >
                    {citation.verified ? 'âœ… Verified': 'â³ Pending'} </div> </div>
 <div class="citation-actions"> <svelte, component | this={ UIButton } onclick={() => verifyCitation(citation.id)} disabled={isVerifying || citation.verified} size="sm"
                  > {isVerifying ? 'ðŸ”„': citation.verified ? 'âœ…': 'ðŸ”'} Verify </svelte:component>
 <svelte, component | this={ UIButton } onclick={() => deleteCitation(citation.id)} size="sm" variant="outline">ðŸ—‘ï¸</svelte:component> </div> </div>
 <div class="citation-content"> <div class="citation-main"> <div class="citation-full"> <strong>{citation.fullCitation}</strong> </div>
  {#if citation.shortForm} <div class="citation-short"> Short form: <em>{citation.shortForm}</em> {/if} {#if citation.pinpoint} <div class="citation-pinpoint"> Pinpoint: {citation.pinpoint} {/if}
  <div class="citation-details"> <div class="detail-item"> <span class="detail-label">Jurisdiction</span>
 <span class="detail-value">{citation.jurisdiction}</span> </div>
  {#if citation.court} <div class="detail-item"> <span class="detail-label">Court:</span>
 <span class="detail-value">{citation.court}</span> {/if} {#if citation.year} <div class="detail-item"> <span class="detail-label">Year:</span>
 <span class="detail-value">{citation.year}</span> {/if}
  <div class="detail-item"> <span class="detail-label">Usage:</span>
 <span class="detail-value">{citation.usageCount} times</span> </div> </div>
  {#if citation.notes} <div class="citation-notes"> <strong>Notes:</strong> {citation.notes} {/if} {#if citation.parentheticals && citation.parentheticals.length > 0} <div class="citation-parentheticals"> <strong>Parentheticals:</strong>
 <ul>
  {#each Array.isArray(citation.parentheticals) ? citation.parentheticals: [] as parenthetical} <li>({ parenthetical })</li> {/each}
  </ul> {/if}
  <div class="citation-tags">
  {#each Array.isArray(citation.tags) ? citation.tags: [] as tag} <span class="citation-tag">#{ tag }</span> {/each}
  </div> </div>
 <div class="citation-metrics"> <div class="metric-item"> <span class="metric-label">Relevance Score:</span>
 <div class="metric-bar"> <div class="metric-fill"
                        style="
                          width, {citation.relevanceScore * 100}%; background: {citationBuilder.styling.colors.evidence};
                        "
                      ></div> </div>
 <span class="metric-value"> {Math.round(citation.relevanceScore * 100)}% </span> </div>
 <div class="metric-item"> <span class="metric-label">Accuracy:</span>
 <div class="metric-bar"> <div class="metric-fill"
                        style="
                          width, {citation.accuracy * 100}%; background: {getAccuracyColor(citation.accuracy)};
                        "
                      ></div> </div>
 <span class="metric-value"> {Math.round(citation.accuracy * 100)}% </span> </div>
 <div class="citation-dates"> <div class="date-item"> <span class="date-label">Added:</span>
 <span class="date-value"> {new Date(citation.dateAdded).toLocaleDateString()} </span> </div>
  {#if citation.lastChecked} <div class="date-item"> <span class="date-label">Last Checked:</span>
 <span class="date-value"> {new Date(citation.lastChecked).toLocaleDateString()} </span> {/if}
  </div> </div> </div> </div> {/each} {#if filteredCitations.length === 0} <div class="no-citations" transition, fade> <span class="no-citations-icon">ðŸ“š</span>
 <h3>No Citations Found</h3>
 <p>No citations match your current search and filter criteria.</p> -              <Button class="bits-btn" onclick={() => { searchTerm = ''; filterType = 'all'; filterJurisdiction = 'all'}}> -                Clear Filters -              </Button> +              <svelte, component | this={ UIButton } onclick={() => { searchTerm = ''; filterType = 'all'; filterJurisdiction = 'all'}}> +                Clear Filters +              </svelte:component> {/if}
  </div> </CardContent> </div> </Card> </div>
 <style> .citation-manager { max-width: 1400px;
	margin: 0 auto;padding: 1rem; font-family: 'Courier New', monospace}
  /* .citation-title and .citation-search are now applied to DOM elements so Svelte's unused selector warnings will be resolved. */ .citation-title { display: flex; justify-content: space-between, align-items: flex-start;
	gap: 2rem}'
  /* .citation-search is a wrapper div containing the input component */ .citation-search { flex: 1; min-width: 300px}
  /* optionally target inner input if the UIInput renders a native input element */ .citation-search:global(input) { width: 100%; box-sizing: border-box}
  .title-section { display: flex; align-items: center;
	gap: 1rem}
  .citation-icon { font-size: 2rem}
  .title-text h2 { margin: 0; color: var(--enhanced-bits-foreground); font-size: 1.5rem}
  .citation-meta { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.875rem}
  .total-count, .verified-count, .pending-count { padding: 0.25rem 0.5rem; background: rgba(255, 255, 255, 0.1); border-radius: 4px}
  .citation-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap}
  .bulk-actions { display: flex; gap: 0.5rem}
  .add-form, .bulk-panel { margin-bottom: 2rem;
	padding: 1.5rem;border: 2px solid var(--enhanced-bits-border); border-radius: 8px;
	background: rgba(255, 255, 255, 0.02)}
  .form-header, .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .form-header h3, .panel-header h3 { margin: 0; color: var(--enhanced-bits-foreground)}
  .form-content, .bulk-controls { display: flex; gap: 1rem; flex-wrap}
  .controls-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;
	gap: 1rem; flex-wrap}
  .search-controls { display: flex; gap: 1rem; flex: 1; min-width: 0}
  .citation-search { flex: 1; min-width: 300px}
  .filter-controls { display: flex; gap: 1rem}
  .filter-select, .sort-select { background: var(--enhanced-bits-background); border: 2px solid var(--enhanced-bits-border);color: var(--enhanced-bits-foreground): 0.5rem; border-radius: 4px; font-family: inherit}
  .stats-section { margin-bottom: 2rem}
  .stats-section h3 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground)}
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem}
  .stat-group h4 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground); font-size: 1rem}
  .stat-item { display: flex; align-items: center;
	gap: 0.75rem;padding: 0.5rem 0; border-bottom: 1px solid var(--enhanced-bits-border)}
  .stat-icon { font-size: 1rem}
  .stat-label { flex: 1; font-size: 0.875rem;
	color: var(--enhanced-bits-muted-foreground)}
  .stat-count { font-weight: bold;
	color: var(--enhanced-bits-foreground)}
  .citation-list { display: flex; flex-direction: column;
	gap: 1.5rem}
  .citation-item { background: rgba(255, 255, 255, 0.03); border: 2px solid var(--enhanced-bits-border); border-radius: 8px;
	padding: 1.5rem; transition:all 300ms ease}
  .citation-item:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2)}
  .citation-item.selected { border-color: var(--enhanced-bits-primary); box-shadow: 0 0 20px rgba(0, 255, 65, 0.2)}
  .citation-header { display: flex; align-items: center;
	gap: 1rem; margin-bottom: 1rem}
  .citation-select { display: flex; align-items: center}
  .citation-checkbox { width: 18px; height: 18px; accent-color: var(--enhanced-bits-primary)}
  .citation-type { display: flex; align-items: center;
	gap: 0.5rem}
  .type-icon { font-size: 1.25rem}
  .type-label { font-size: 0.875rem; font-weight: bold;
	color: var(--enhanced-bits-foreground)}
  .citation-status { display: flex; gap: 0.5rem; margin-left: auto}
  .status-badge, .verification-badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase;
	border: 1px solid}
  .verification-badge { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border-color: #f59e0b}
  .verification-badge.verified { background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: #10b981}
  .citation-actions { display: flex; gap: 0.5rem}
  .citation-content { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: start}
  .citation-full { font-size: 1rem;
	color: var(--enhanced-bits-foreground); margin-bottom: 0.5rem; line-height: 1.4}
  .citation-short, .citation-pinpoint { font-size: 0.875rem;
	color: var(--enhanced-bits-muted-foreground); margin-bottom: 0.25rem}
  .citation-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem;margin: 1rem 0}
  .detail-item { display: flex; flex-direction: column;
	gap: 0.25rem}
  .detail-label { font-size: 0.75rem;
	color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .detail-value { font-size: 0.875rem;
	color: var(--enhanced-bits-foreground)}
  .citation-notes, .citation-parentheticals { margin: 1rem 0; padding: 1rem;background: rgba(255, 255, 255, 0.02); border: 1px solid var(--enhanced-bits-border); border-radius: 4px; font-size: 0.875rem; line-height: 1.5}
  .citation-parentheticals ul { margin: 0.5rem, 0 0 0; padding-left: 1.5rem}
  .citation-parentheticals li { margin-bottom: 0.25rem; font-style: italic}
  .citation-tags { display: flex; flex-wrap: wrap;
	gap: 0.5rem; margin-top: 1rem}
  .citation-tag { background: rgba(157, 74, 221, 0.2); color: var(--enhanced-bits-ai);padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem;
	border: 1px solid var(--enhanced-bits-ai)}
  .citation-metrics { display: flex; flex-direction: column;
	gap: 1rem; min-width: 200px}
  .metric-item { display: flex; flex-direction: column;
	gap: 0.5rem}
  .metric-label { font-size: 0.875rem;
	color: var(--enhanced-bits-muted-foreground)}
  .metric-bar { height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;
	overflow: hidden}
  .metric-fill { height: 100%; transition:width 300ms ease; border-radius: 4px}
  .metric-value { font-size: 0.875rem; font-weight: bold;
	color: var(--enhanced-bits-evidence)}
  .citation-dates { display: flex; flex-direction: column;
	gap: 0.5rem}
  .date-item { display: flex; flex-direction: column;
	gap: 0.25rem}
  .date-label { font-size: 0.75rem;
	color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .date-value { font-size: 0.875rem;
	color: var(--enhanced-bits-foreground)}
  .no-citations { text-align: center;
	padding: 4rem 2rem;color: var(--enhanced-bits-muted-foreground)}
  .no-citations-icon { font-size: 3rem, display: block; margin-bottom: 1rem}
  .no-citations h3 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground)}
  .no-citations p { margin: 0, 0 2rem 0}
  @media (max-width: 768px) { .citation-title { flex-direction: column;
	gap: 1rem}
    .controls-section { flex-direction: column; align-items: stretch}
    .search-controls { flex-direction: column}
    .citation-search { min-width: auto}
    .filter-controls { flex-direction: column}
    .citation-content { grid-template-columns: 1fr;
	gap: 1rem}
    .citation-details { grid-template-columns: 1fr}
    .stats-grid { grid-template-columns: 1fr}
  } </style>







