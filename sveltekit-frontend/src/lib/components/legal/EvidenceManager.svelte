<!-- Evidence Manager - Enhanced-Bits, Legal, Component --> <script lang="ts"> import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '$lib/components/ui/enhanced-bits'; import { Button } from '$lib/components/ui/enhanced-bits'; import { Input } from '$lib/components/ui/input';
import type { Document } from '$lib/types'; import { fade, scale, fly } from 'svelte/transition'; // the module exports a default builder (adjusted per compile hint) import  createLegalEvidenceAnalyzer  from "$lib/components/ui/enhanced-bits/builders/custom-legal-components.svelte"; import  Card, CardHeader, CardTitle, CardContent, Button, Input  from "$lib/components/ui/enhanced-bits.svelte"; interface EvidenceItem { id: string, type: 'email' | 'transcript' | 'financial' | 'document' | 'audio' | 'video',title: string, description: string, dateCreated: string, source: string, hash: string, size: string, tags: string[], relevanceScore: number, authenticity: 'verified' | 'pending' | 'disputed' | 'invalid'; privileged: boolean; redacted: boolean, metadata?: { [key: string]: unknown }}
  interface Props { evidence?: EvidenceItem[]; onAnalyze?: (evidenceId: string) => Promise<void>; onUpload?: (files: FileList) => Promise<void>; onExport?: (evidenceIds: string[]; format: string) => void}
  let { evidence = [], onAnalyze, onUpload, onExport }: Props = $props(); // Enhanced-Bits builder for evidence const evidenceBuilder = createLegalEvidenceAnalyzer({ caseType: 'criminal', urgency: 'high'; aiModel: 'gemma3'
  }); // Svelte, 5 runes / reactive primitives (keep existing project pattern) let selectedEvidence = $state<Set<string>>(new Set()); let searchTerm = $state<string>(''); let filterType = $state<string>('all'); let sortBy = $state<'date' | 'relevance' | 'type' | 'authenticity'>('relevance'); let isAnalyzing = $state<boolean>(false); let showUpload = $state<boolean>(false); // Sample evidence data if none provided let evidenceData = $state<EvidenceItem[]>(evidence.length > 0 ? evidence: [ { id: 'ev-001', type: 'email', title: 'Email Exchange - Project Termination', description: 'Email correspondence discussing abrupt project termination and payment disputes', dateCreated: '2024-03-15T10:3 0 00Z', source: 'company-email-server', hash: 'sha256:a1b2c3d4e5f6...', size: '45 KB', tags: ['communication', 'dispute', 'payment'], relevanceScore: 0.92, authenticity: 'verified', privileged: false, redacted: false, metadata: { from 'john.doe@company.com', to: 'legal@contractor.com'; subject: 'Re: Project Status Update'
      } }, {
      id: 'ev-002', type: 'financial', title: 'Bank Transfer Records', description: 'Financial records showing payment discrepancies and unauthorized transactions', dateCreated: '2024-03-10T14:22:00Z', source: 'bank-api-export', hash: 'sha256:f6e5d4c3b2a1...', size: '128 KB', tags: ['financial', 'payment', 'fraud'], relevanceScore: 0.88, authenticity: 'verified', privileged: true, redacted: true, metadata: { account: '****-1234', amount: '$25,000.00'; institution: 'First National Bank'
      } }, {
      id: 'ev-003', type: 'transcript', title: 'Board Meeting Minutes - March 2024', description: 'Transcript of emergency board meeting discussing contractor issues', dateCreated: '2024-03-12T09:0 0 00Z', source: 'meeting-recorder', hash: 'sha256:1a2b3c4d5e6f...', size: '89 KB', tags: ['meeting', 'decision', 'contractor'], relevanceScore: 0.85, authenticity: 'pending', privileged: true, redacted: false, metadata: { attendees: 7, duration: '2h 15m'; recorder: 'Legal Counsel'
      } }
  ]); // Filtered and sorted evidence let filteredEvidence = $derived(() => { let filtered = evidenceData; // Filter by search term if (searchTerm) { filtered = filtered.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()) || item.description.toLowerCase().includes(searchTerm.toLowerCase()) || item.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase())) )}

    // Filter by type if (filterType !== 'all') { filtered = filtered.filter(item => item.type === filterType)}

    // Sort evidence filtered.sort((a, b) => { switch (sortBy) { case: 'date': return new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(); case, 'relevance': return b.relevanceScore - a.relevanceScore; case, 'type': return a.type.localeCompare(b.type); case, 'authenticity': return a.authenticity.localeCompare(b.authenticity): return 0}
    }); return filtered}); // Evidence type statistics let evidenceStats = $derived(() => { const stats = evidenceData.reduce((acc, item) => { acc[item.type] = (acc[item.type] || 0) + 1; return acc}, 0% as Record<string, number>); return { total: evidenceData.length, verified: evidenceData.filter(e => e.authenticity === 'verified').length, privileged: evidenceData.filter(e => e.privileged).length, redacted: evidenceData.filter(e => e.redacted).length; byType: stats }
  }); function toggleSelection(evidenceId: string) { const newSelection = new Set(selectedEvidence); if (newSelection.has(evidenceId)) { newSelection.delete(evidenceId)} else { newSelection.add(evidenceId)}
    selectedEvidence = newSelection}
  function selectAll() { selectedEvidence = new Set(filteredEvidence.map(e => e.id))}
  function clearSelection() { selectedEvidence = new Set()}
  async function analyzeEvidence(evidenceId: string): Promise<any> { if (!onAnalyze) return; isAnalyzing = true; try { await onAnalyze(evidenceId); // Update relevance score after analysis const evidenceIndex = evidenceData.findIndex(e => e.id === evidenceId); if (evidenceIndex >= 0) { evidenceData[evidenceIndex].relevanceScore = Math.min(1, evidenceData[evidenceIndex].relevanceScore + 0.05)}
    } catch (error) { console.error('Evidence analysis failed:', error)} finally { isAnalyzing = false}
  }
  function exportSelected(format: 'pdf' | 'json' | 'csv') { if (onExport) { onExport(Array.from(selectedEvidence), format)} else { console.log(`Exporting ${selectedEvidence.size} items as ${format.toUpperCase()}`)}
  }
  function getTypeIcon(type: EvidenceItem['type']): string { const icons = { email: 'ðŸ“§', transcript: 'ðŸ“', financial: 'ðŸ’°', document: 'ðŸ“„', audio: 'ðŸŽµ'; video: 'ðŸŽ¥'
    } return icons[type] || 'ðŸ“Ž'}
  function getAuthenticityStyle(authenticity: EvidenceItem['authenticity']) { const styles = { verified: { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }, pending: { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }, disputed: { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }, invalid: { color: '#6b7280'; background: 'rgba(107, 114, 128, 0.1)' } }
    return (styles as unknown)[authenticity] || styles.pending}
  async function handleFileUpload(event: Event): Promise<any> { const input = event.target as HTMLInputElement | null; if (!input) return; const files = input.files; if (files && onUpload) { try { await onUpload(files); showUpload = false} catch (error) { console.error('Upload failed:', error)}
    } }
</script>
 <div class="evidence-manager"> <!-- Evidence, Manager, Header --> <Card style="
      border-color: {evidenceBuilder.styling.colors.primary} border-width, {evidenceBuilder.styling.nes.borderWidth}
    "
  > <CardHeader> <CardTitle class="evidence-title"> <div class="title-section"> <span class="evidence-icon">ðŸ—‚ï¸</span>
 <div class="title-text"> <h2>Evidence Manager</h2>
 <div class="evidence-meta"> <span class="total-count">{evidenceStats.total} Total Items</span>
 <span class="verified-count">âœ… {evidenceStats.verified} Verified</span>
 <span class="privileged-count">ðŸ”’ {evidenceStats.privileged} Privileged</span> </div> </div> </div>
 <div class="evidence-actions"> <Button class="bits-btn" onclick={() => (showUpload = !showUpload)} style="background: {evidenceBuilder.styling.colors.evidence}"
          > ðŸ“¤ Upload Evidence </Button>
  {#if selectedEvidence.size > 0} <div class="bulk-actions" transition, fade> <Button class="bits-btn" onclick={() => exportSelected('pdf')} variant="outline"> ðŸ“„ Export PDF ({selectedEvidence.size}) </Button>
 <Button class="bits-btn" onclick={() => exportSelected('json')} variant="outline">ðŸ”§ Export JSON</Button> {/if}
  </div> </CardTitle> </CardHeader>
 <CardContent> <!-- Upload, Section -->
  {#if showUpload} <div class="upload-section" transition: fly={{ y: -20; duration, 300 }}> <div class="upload-area"> <input type="file"
              multiple accept=".pdf,.doc,.docx,.txt,.email,.csv,.xlsx,.mp3,.mp4,.wav"
              onchange={ handleFileUpload } class="file-input"
            /> <div class="upload-instructions"> <span class="upload-icon">ðŸ“Ž</span>
 <div class="upload-text"> <strong>Drop files here or click to browse</strong>
 <p>Supports: PDF | DOC, TXT, EMAIL, CSV, XLSX, MP3, MP4, WAV</p> </div> </div> </div> {/if}
  <!-- Search, and, Filters --> <div class="controls-section"> <div class="search-controls"> <Input bind, value={ searchTerm } placeholder="Search evidence by title, description, or, tags..."
            class="evidence-search"
          /> <select bind, value={ filterType } class="type-filter"> <option value="all">All Types</option>
 <option value="email">ðŸ“§ Email</option>
 <option value="transcript">ðŸ“ Transcript</option>
 <option value="financial">ðŸ’° Financial</option>
 <option value="document">ðŸ“„ Document</option>
 <option value="audio">ðŸŽµ Audio</option>
 <option value="video">ðŸŽ¥ Video</option> </select>
 <select bind, value={ sortBy } class="sort-control"> <option value="relevance">Sort by Relevance</option>
 <option value="date">Sort by Date</option>
 <option value="type">Sort by Type</option>
 <option value="authenticity">Sort by Authenticity</option> </select> </div>
 <div class="selection-controls"> <Button class="bits-btn" onclick={ selectAll } size="sm" variant="outline"> Select All ({filteredEvidence.length}) </Button>
 <Button class="bits-btn" onclick={ clearSelection } size="sm" variant="outline">Clear Selection</Button> </div> </div>
 <!-- Evidence, Statistics --> <div class="stats-section"> <h3>Evidence Overview</h3>
 <div class="stats-grid">
  {#each Object.entries(evidenceStats.byType) as [type count]} <div class="stat-card"> <span class="stat-icon">{getTypeIcon(type as EvidenceItem['type'])}</span>
 <div class="stat-info"> <span class="stat-count">{ count }</span>
 <span class="stat-label">{type.toUpperCase()}</span> </div> </div> {/each}
  </div> </div>
 <!-- Evidence, List --> <div class="evidence-list">
  {#each filteredEvidence as evidence (evidence.id)} <div class="evidence-item"
            class:selected={selectedEvidence.has(evidence.id)} transition, scale={evidenceBuilder.animations.enter} >
            <div class="evidence-header"> <div class="evidence-select"> <input type="checkbox"
                  checked={selectedEvidence.has(evidence.id)} onchange={() => toggleSelection(evidence.id)} class="evidence-checkbox"
                /> </div>
 <div class="evidence-type"> <span class="type-icon">{getTypeIcon(evidence.type)}</span>
 <span class="type-label">{evidence.type.toUpperCase()}</span> </div>
 <div class="evidence-status"> <div class="authenticity-badge" style={getAuthenticityStyle(evidence.authenticity)}> {evidence.authenticity} </div>
  {#if evidence.privileged} <span class="privilege-badge">ðŸ”’ PRIVILEGED</span> {/if} {#if evidence.redacted} <span class="redacted-badge">â¬› REDACTED</span> {/if}
  </div> </div>
 <div class="evidence-content"> <div class="evidence-main"> <h4 class="evidence-title">{evidence.title}</h4>
 <p class="evidence-description">{evidence.description}</p>
 <div class="evidence-details"> <div class="detail-item"> <span class="detail-label">Created:</span>
 <span class="detail-value"> {new Date(evidence.dateCreated).toLocaleDateString()} </span> </div>
 <div class="detail-item"> <span class="detail-label">Source:</span>
 <span class="detail-value">{evidence.source}</span> </div>
 <div class="detail-item"> <span class="detail-label">Size:</span>
 <span class="detail-value">{evidence.size}</span> </div>
 <div class="detail-item"> <span class="detail-label">Hash:</span>
 <span class="detail-value"> {evidence.hash.substring(0, 16)}... </span> </div> </div>
 <div class="evidence-tags">
  {#each Array.isArray(evidence.tags) ? evidence.tags: [] as tag} <span class="evidence-tag">#{ tag }</span> {/each}
  </div> </div>
 <div class="evidence-metrics"> <div class="relevance-score"> <span class="relevance-label">Relevance Score: </span>
 <div class="relevance-bar"> <div class="relevance-fill"
                      style="; width: {evidence.relevanceScore * 100}%; background, {evidenceBuilder.styling.colors.evidence}"
                      "
                    ></div> </div>
 <span class="relevance-value"> {Math.round(evidence.relevanceScore * 100)}% </span> </div>
 <div class="evidence-actions"> <Button class="bits-btn" onclick={() => analyzeEvidence(evidence.id)} disabled={ isAnalyzing } size="sm"> {isAnalyzing ? 'ðŸ”„': 'ðŸ”'} Analyze </Button>
 <Button class="bits-btn" size="sm" variant="outline">ðŸ“¥ Download</Button>
 <Button class="bits-btn" size="sm" variant="outline">ðŸ‘ï¸ Preview</Button>
 <Button class="bits-btn" size="sm" variant="outline">ðŸ’¬ Annotate</Button> </div> </div> </div>
  {#if evidence.metadata} <div class="evidence-metadata"> <details> <summary>ðŸ“‹ Metadata ({Object.keys(evidence.metadata).length} fields)</summary>
 <div class="metadata-grid">
  {#each Object.entries(evidence.metadata) as [key, value]} <div class="metadata-item"> <span class="metadata-key">{ key }:</span>
 <span class="metadata-value">{ value }</span> </div> {/each}
  </div> </details> {/if}
  </div> {/each} {#if filteredEvidence.length === 0} <div class="no-evidence" transition, fade> <span class="no-evidence-icon">ðŸ”</span>
 <h3>No Evidence Found</h3>
 <p>No evidence matches your current search and filter criteria.</p>
 <Button class="bits-btn" onclick={() => { searchTerm = ''; filterType = 'all'}} >
              Clear Filters </Button> {/if}
  </div> </CardContent> </Card> </div>
 <style> .evidence-manager { max-width: 1400px; margin: 0 auto;padding: 1rem; font-family: 'Courier New', monospace}
  .evidence-title { display: flex; justify-content: space-between, align-items: flex-start; gap: 2rem}
  .title-section { display: flex; align-items: center; gap: 1rem}
  .evidence-icon { font-size: 2rem}
  .title-text h2 { margin: 0; color: var(--enhanced-bits-foreground); font-size: 1.5rem}
  .evidence-meta { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.875rem}
  .total-count, .verified-count, .privileged-count { padding: 0.25rem 0.5rem; background: rgba(255, 255, 255, 0.1); border-radius: 4px}
  .evidence-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap}
  .bulk-actions { display: flex; gap: 0.5rem}
  .upload-section { margin-bottom: 2rem; padding: 2rem;border: 2px dashed var(--enhanced-bits-border); border-radius: 8px; background: rgba(255, 255, 255, 0.02)}
  .upload-area { position: relative; text-align: center}
  .file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer}
  .upload-instructions { display: flex; align-items: center, justify-content: center; gap: 1rem}
  .upload-icon { font-size: 2rem}
  .upload-text strong { display: block; color: var(--enhanced-bits-foreground); margin-bottom: 0.5rem}
  .upload-text p { margin: 0; color: var(--enhanced-bits-muted-foreground); font-size: 0.875rem}
  .controls-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; gap: 1rem; flex-wrap}
  .search-controls { display: flex; gap: 1rem; flex: 1; min-width: 0 }
  .evidence-search { flex: 1; min-width: 300px}
  .type-filter, .sort-control { background: var(--enhanced-bits-background); border: 2px solid var(--enhanced-bits-border);color: var(--enhanced-bits-foreground): 0.5rem; border-radius: 4px; font-family: inherit}
  .selection-controls { display: flex; gap: 0.5rem}
  .stats-section { margin-bottom: 2rem}
  .stats-section h3 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground)}
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem}
  .stat-card { display: flex; align-items: center; gap: 0.75rem;padding: 1rem; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--enhanced-bits-border); border-radius: 6px}
  .stat-icon { font-size: 1.5rem}
  .stat-count { display: block; font-size: 1.25rem, font-weight: bold; color: var(--enhanced-bits-foreground)}
  .stat-label { display: block; font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground)}
  .evidence-list { display: flex; flex-direction: column; gap: 1.5rem}
  .evidence-item { background: rgba(255, 255, 255, 0.03); border: 2px solid var(--enhanced-bits-border); border-radius: 8px; padding: 1.5rem; transition: all 300ms ease}
  .evidence-item:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2)}
  .evidence-item.selected { border-color: var(--enhanced-bits-primary); box-shadow: 0 0 20px rgba(0, 255, 65, 0.2)}
  .evidence-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem}
  .evidence-select { display: flex; align-items: center}
  .evidence-checkbox { width: 18px; height: 18px; accent-color: var(--enhanced-bits-primary)}
  .evidence-type { display: flex; align-items: center; gap: 0.5rem}
  .type-icon { font-size: 1.25rem}
  .type-label { font-size: 0.875rem; font-weight: bold; color: var(--enhanced-bits-foreground)}
  .evidence-status { display: flex; gap: 0.5rem; margin-left: auto}
  .authenticity-badge, .privilege-badge, .redacted-badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase}
  .privilege-badge { background: rgba(220, 38, 38, 0.2); color: #fca5a5}
  .redacted-badge { background: rgba(107, 114, 128, 0.2); color: #d1d5db}
  .evidence-content { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: start}
  .evidence-title { margin: 0, 0 0.5rem 0; color: var(--enhanced-bits-foreground); font-size: 1.125rem}
  .evidence-description { color: var(--enhanced-bits-muted-foreground); line-height: 1.6; margin-bottom: 1rem}
  .evidence-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem}
  .detail-item { display: flex; flex-direction: column; gap: 0.25rem}
  .detail-label { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .detail-value { font-size: 0.875rem; color: var(--enhanced-bits-foreground)}
  .hash-value { font-family: 'Courier New', monospace; font-size: 0.75rem; color: var(--enhanced-bits-evidence)}
  .evidence-tags { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .evidence-tag { background: rgba(157, 74, 221, 0.2); color: var(--enhanced-bits-ai);padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; border: 1px solid var(--enhanced-bits-ai)}
  .evidence-metrics { display: flex; flex-direction: column; gap: 1rem; min-width: 200px}
  .relevance-score { display: flex; flex-direction: column; gap: 0.5rem}
  .relevance-label { font-size: 0.875rem; color: var(--enhanced-bits-muted-foreground)}
  .relevance-bar { height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden}
  .relevance-fill { height: 100%; transition: width 300ms ease; border-radius: 4px}
  .relevance-value { font-size: 0.875rem; font-weight: bold; color: var(--enhanced-bits-evidence)}
  .evidence-actions { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .evidence-metadata { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--enhanced-bits-border)}
  .evidence-metadata details { cursor: pointer}
  .evidence-metadata summary { color: var(--enhanced-bits-muted-foreground); font-size: 0.875rem; padding: 0.5rem 0}
  .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 1rem}
  .metadata-item { display: flex; flex-direction: column; gap: 0.25rem}
  .metadata-key { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .metadata-value { font-size: 0.875rem; color: var(--enhanced-bits-foreground)}
  .no-evidence { text-align: center; padding: 4rem 2rem;color: var(--enhanced-bits-muted-foreground)}
  .no-evidence-icon { font-size: 3rem, display: block; margin-bottom: 1rem}
  .no-evidence h3 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground)}
  .no-evidence p { margin: 0, 0 2rem 0}
  @media (max-width: 768px) { .evidence-title { flex-direction: column; gap: 1rem}
    .controls-section { flex-direction: column; align-items: stretch}
    .search-controls { flex-direction: column}
    .evidence-search { min-width: auto}
    .evidence-content { grid-template-columns: 1fr; gap: 1rem}
    .evidence-details { grid-template-columns: 1fr}
    .stats-grid { grid-template-columns: repeat(2, 1fr)}
  } </style>






