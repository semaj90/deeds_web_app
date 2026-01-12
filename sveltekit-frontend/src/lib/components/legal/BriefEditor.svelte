<!-- Brief Editor - Enhanced-Bits, Legal, Component --> <script lang="ts"> import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '$lib/components/ui/enhanced-bits'; import { Button } from '$lib/components/ui/enhanced-bits'; import { Input } from '$lib/components/ui/input';
import type { Case } from '$lib/types'; import { fade, scale, fly } from 'svelte/transition'; import  createLegalEvidenceAnalyzer  from "$lib/components/ui/enhanced-bits/builders/custom-legal-components.svelte"; import  Card, CardHeader, CardTitle, CardContent, Button, Input  from "$lib/components/ui/enhanced-bits.svelte"; interface BriefSection { id: string, type: 'header' | 'introduction' | 'facts' | 'argument' | 'conclusion' | 'signature',title: string, content: string, citations: Citation[], wordCount: number, aiSuggestions?: string[]; status: 'draft' | 'review' | 'approved'}
  interface Citation { id: string, type: 'case' | 'statute' | 'regulation' | 'secondary',citation: string, shortForm: string, pinpoint?: string,verified: boolean; relevanceScore: number}
  interface Brief { id: string, title: string, type: 'motion' | 'summary_judgment' | 'discovery' | 'appellate' | 'response',court: string, case: string, dueDate: string, wordLimit: number, sections: BriefSection[], status: 'draft' | 'review' | 'filed'; collaborators: string[]; version: number}
  interface Props { brief?: Brief; onSave?: (brief: Brief) => Promise<void>; onCitationCheck?: (citations: Citation[]) => Promise<Citation[]>; onAISuggestion?: (section: BriefSection) => Promise<string[]>}
  let { brief, onSave, onCitationCheck, onAISuggestion }: Props = $props(); // Enhanced-Bits builder for briefs const briefBuilder = createLegalEvidenceAnalyzer({ caseType: 'civil', urgency: 'medium'; aiModel: 'gemma3'
  });
  let briefData = $state<Brief>(brief || { id: 'brief-001', title: 'Motion for Summary Judgment', type: 'summary_judgment', court: 'Superior Court of California, County of Los Angeles', case: 'Smith v. Jones Construction Co.', dueDate: '2025-10-15', wordLimit: 8000, status: 'draft', collaborators: ['Legal Counsel', 'Associate Attorney'], version: 1, sections: [ { id: 'intro', type: 'introduction', title: 'Introduction', content: 'Plaintiff Smith respectfully moves this Court for summary judgment on all claims against Defendant Jones Construction Co. pursuant to Code of Civil Procedure Section 437c...', citations: [ { id: 'cit-1', type: 'statute', citation: 'Cal. Code Civ. Proc. Â§ 437c', shortForm: 'Â§ 437c', verified: true; relevanceScore: 0.95 }
        ], wordCount: 145, status: 'draft'; aiSuggestions: [
          'Consider adding specific grounds for summary judgment',
          'Include brief overview of material facts'
        ] }, {
        id: 'facts', type: 'facts', title: 'Statement of Facts', content: 'The undisputed material facts establish that on March, 15, 2024, Defendant breached its contractual obligations...', citations: [], wordCount: 89; status: 'draft'
      } ]
  });
  let selectedSection = $state<string>('intro'); let isAutoSaving = $state<boolean>(false); let citationPanel = $state<boolean>(false); let wordCount = $derived(() => briefData.sections.reduce((total, section) => total + section.wordCount, 0) ); let wordCountStatus = $derived(() => { const percentage = (wordCount / briefData.wordLimit) * 100; if (percentage > 100) return 'over'; if (percentage > 90) return 'warning'; return 'normal'});
  let currentSection = $derived(() => briefData.sections.find(s => s.id === selectedSection) ); async function saveBrief(): Promise<void> { if (!onSave) return; isAutoSaving = true; try { await onSave(briefData); briefData.version += 1} catch (error) { console.error('Save failed:', error)} finally { isAutoSaving = false}
  }
  async function checkCitations(): Promise<any> { if (!onCitationCheck || !currentSection) return; try { const verifiedCitations = await onCitationCheck(currentSection.citations); const sectionIndex = briefData.sections.findIndex(s => s.id === selectedSection); if (sectionIndex >= 0) { briefData.sections[sectionIndex].citations = verifiedCitations}
    } catch (error) { console.error('Citation check failed:', error)}
  }
  async function getAISuggestions(sectionId: string): Promise<any> { if (!onAISuggestion) return; const section = briefData.sections.find(s => s.id === sectionId); if (!section) return; try { const suggestions = await onAISuggestion(section); const sectionIndex = briefData.sections.findIndex(s => s.id === sectionId); if (sectionIndex >= 0) { briefData.sections[sectionIndex].aiSuggestions = suggestions}
    } catch (error) { console.error('AI suggestion failed:', error)}
  }
  function addSection() { const newSection: BriefSection = { id: `section-${Date.now()}`, type: 'argument', title: 'New Argument Section', content: '', citations: [], wordCount: 0; status: 'draft'
    }; briefData.sections.push(newSection); selectedSection = newSection.id}
  function updateSectionContent(sectionId: string, content: string) { const sectionIndex = briefData.sections.findIndex(s => s.id === sectionId); if (sectionIndex >= 0) { briefData.sections[sectionIndex].content = content; briefData.sections[sectionIndex].wordCount = content.split(/\s+/).filter(word => word.length > 0).length}
  }
  function addCitation() { if (!currentSection) return; const newCitation: Citation = { id: `cit-${Date.now()}`, type: 'case', citation: '', shortForm: '', verified: false; relevanceScore: 0 }; const sectionIndex = briefData.sections.findIndex(s => s.id === selectedSection); if (sectionIndex >= 0) { briefData.sections[sectionIndex].citations.push(newCitation)}
  }
  function getSectionIcon(type: BriefSection['type']): string { const icons: Record<string, string> = { header: 'ðŸ“‹', introduction: 'ðŸŽ¯', facts: 'ðŸ“Š', argument: 'âš–ï¸', conclusion: 'ðŸ'; signature: 'âœï¸'
    }; return icons[type] || 'ðŸ“„'}
  function getCitationIcon(type: Citation['type']): string { const icons: Record<string, string> = { case: 'âš–ï¸', statute: 'ðŸ“œ', regulation: 'ðŸ“‹'; secondary: 'ðŸ“š'
    }; return icons[type] || 'ðŸ“„'}
  function getStatusColor(status: string) { const colors = { draft: '#6b7280', review: '#f59e0b', approved: '#10b981'; filed: '#3b82f6'
    }; return colors[status as keyof typeof colors] || colors.draft}

  // Auto-save effect let saveTimeout: NodeJS.Timeout, $effect(() => { clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { if (briefData.status === 'draft') { saveBrief()}
    }, 2000)}); </script>
 <div class="brief-editor"> <!-- Brief, Header --> <div style="border-style: solid; border-color: {briefBuilder.styling.colors.primary}; border-width, {briefBuilder.styling.nes.borderWidth}; border-radius, 8px;"
  > <Card> <CardHeader> <CardTitle class="brief-title"> <div class="title-section"> <span class="brief-icon">âš–ï¸</span>
 <div class="title-text"> <h2>{briefData.title}</h2>
 <div class="brief-meta"> <span class="brief-type">{briefData.type.replace('_', ' ').toUpperCase()}</span>
 <span class="brief-status" style="color, {getStatusColor(briefData.status)}"> {briefData.status.toUpperCase()} </span>
 <span class="version-info">v{briefData.version}</span> </div> </div> </div>
 <div class="brief-actions"> <div class="word-count-display"> <span class="word-count { wordCountStatus }"> { wordCount } / {briefData.wordLimit} words </span>
 <div class="word-progress"> <div class="word-fill { wordCountStatus }"
                 style="width, {Math.min((wordCount / briefData.wordLimit) * 100, 100)}%"
               ></div> </div> </div>
 <Button class="bits-btn" onclick={ saveBrief } disabled={ isAutoSaving } style="background, {briefBuilder.styling.colors.evidence}"
           > {isAutoSaving ? 'ðŸ’¾ Saving...': 'ðŸ’¾ Save Brief'} </Button>
 <Button class="bits-btn" onclick={() => (citationPanel = !citationPanel)} variant="outline">ðŸ“š Citations</Button> </div> </CardTitle> </CardHeader>
 <CardContent> <!-- Brief, Details --> <div class="brief-details"> <div class="detail-grid"> <div class="detail-item"> <span class="detail-label">Court:</span>
 <span class="detail-value">{briefData.court}</span> </div>
 <div class="detail-item"> <span class="detail-label">Case:</span>
 <span class="detail-value">{briefData.case}</span> </div>
 <div class="detail-item"> <span class="detail-label">Due Date:</span>
 <span class="detail-value"> {new Date(briefData.dueDate).toLocaleDateString()} </span> </div>
 <div class="detail-item"> <span class="detail-label">Collaborators:</span>
 <span class="detail-value">{briefData.collaborators.join(', ')}</span> </div> </div> </div> </CardContent> </Card> </div>
 <!-- Main, Editor, Layout --> <div class="editor-layout"> <!-- Section, Navigation --> <div class="section-nav"> <div class="nav-header"> <h3>Brief Sections</h3>
 <Button class="bits-btn" onclick={ addSection } size="sm">âž• Add Section</Button> </div>
 <div class="section-list">
  {#each briefData.sections as section (section.id)} <button class="section-item"
            class:active={selectedSection === section.id} onclick={() => (selectedSection = section.id)}; transition:fade >
           <div class="section-header"> <span class="section-icon">{getSectionIcon(section.type)}</span>
 <span class="section-title">{section.title}</span>
 <span class="section-status" style="color, {getStatusColor(section.status)}"> â— </span> </div>
 <div class="section-meta"> <span class="word-count">{section.wordCount} words</span>
 <span class="citation-count">{section.citations.length} citations</span> </div> </button> {/each}
  </div> </div>
 <!-- Content, Editor --> <div class="content-editor">
  {#if currentSection} <div class="editor-header"> <div class="section-info"> <h3>{currentSection.title}</h3>
 <span class="section-type">{currentSection.type.replace('_', ' ').toUpperCase()}</span> </div>
 <div class="editor-tools"> <Button class="bits-btn" onclick={() => getAISuggestions(currentSection.id)} size="sm">ðŸ¤– AI Suggestions</Button>
 <Button class="bits-btn" onclick={ checkCitations } size="sm" variant="outline">ðŸ” Check Citations</Button> </div> </div>
 <div class="editor-content"> <textarea value={currentSection.content} oninput={e => updateSectionContent(currentSection.id, (e.target as HTMLTextAreaElement).value)} placeholder="Start writing your brief section..."
            class="content-textarea"
          ></textarea>
 <!-- AI Suggestions, Panel -->
  {#if currentSection.aiSuggestions && currentSection.aiSuggestions.length > 0} <div class="suggestions-panel" transition:fly={{ x, 20, duration, 300 }}> <h4>ðŸ¤– AI Suggestions</h4>
 <ul class="suggestions-list">
  {#each Array.isArray(currentSection.aiSuggestions) ? currentSection.aiSuggestions: [] as suggestion} <li class="suggestion-item">{ suggestion }</li> {/each}
  </ul> {/if}
  </div>
 <!-- Citations for Current, Section --> <div class="section-citations"> <div class="citations-header"> <h4>Citations ({currentSection.citations.length})</h4>
 <Button class="bits-btn" onclick={ addCitation } size="sm">âž• Add Citation</Button> </div>
 <div class="citations-list">
  {#each currentSection.citations as citation (citation.id)} <div class="citation-item" transition, scale> <div class="citation-header"> <span class="citation-icon">{getCitationIcon(citation.type)}</span>
 <span class="citation-type">{citation.type.toUpperCase()}</span>
 <span class="citation-verified" class:verified={citation.verified}> {citation.verified ? 'âœ… Verified': 'â³ Pending'} </span> </div>
 <div class="citation-content"> <Input value={citation.citation} placeholder="Enter full, citation..." class="citation-input" /> <Input value={citation.shortForm} placeholder="Short, form..." class="citation-short" />
  {#if citation.pinpoint} <Input value={citation.pinpoint} placeholder="Pinpoint, citation..." class="citation-pinpoint" /> {/if}
  </div>
 <div class="citation-metrics"> <span class="relevance-score"> Relevance: {Math.round(citation.relevanceScore * 100)}% </span> </div> </div> {/each}
  </div> </div> {:else} <div class="no-section-selected"> <span class="empty-icon">ðŸ“</span>
 <h3>Select a Section</h3>
 <p>Choose a section from the navigation to start editing.</p> {/if}
  </div>
 <!-- Citation, Panel -->
  {#if citationPanel} <div class="citation-panel" transition:fly={{ x, 300, duration, 300 }}> <div class="panel-header"> <h3>ðŸ“š All Citations</h3>
 <Button class="bits-btn" onclick={() => (citationPanel = false)} size="sm">âœ•</Button> </div>
 <div class="panel-content">
  {#each Array.isArray(briefData.sections) ? briefData.sections: [] as section} {#if section.citations.length > 0} <div class="section-citations-group"> <h4>{section.title}</h4>
  {#each Array.isArray(section.citations) ? section.citations: [] as citation} <div class="citation-summary"> <span class="citation-icon">{getCitationIcon(citation.type)}</span>
 <div class="citation-text"> <div class="citation-full">{citation.citation}</div>
 <div class="citation-meta"> {citation.type} â€¢ {citation.verified ? 'Verified': 'Pending'} </div> </div> </div> {/each} {/if} {/each}
  </div> {/if}
  </div> </div>
 <style> .brief-editor { max-width: 1600px; margin: 0 auto;padding: 1rem; font-family: 'Courier New', monospace}
  .brief-title { display: flex; justify-content: space-between, align-items: flex-start; gap: 2rem}
  .title-section { display: flex; align-items: center; gap: 1rem}
  .brief-icon { font-size: 2rem}
  .title-text h2 { margin: 0; color: var(--enhanced-bits-foreground); font-size: 1.5rem}
  .brief-meta { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.875rem}
  .brief-type { background: var(--enhanced-bits-primary); color: #000;padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: bold}
  .brief-status, .version-info { padding: 0.25rem 0.5rem; background: rgba(255, 255, 255, 0.1); border-radius: 4px; font-weight: bold}
  .brief-actions { display: flex; align-items: center; gap: 1rem}
  .word-count-display { display: flex; flex-direction: column, align-items: flex-end; gap: 0.25rem}
  .word-count { font-size: 0.875rem; font-weight: bold}
  .word-count.normal { color: var(--enhanced-bits-success)} .word-count.warning { color: var(--enhanced-bits-warning)} .word-count.over { color: var(--enhanced-bits-error)} .word-progress { width: 120px; height: 4px;background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden}
  .word-fill { height: 100%; transition: width 300ms ease; border-radius: 2px}
  .word-fill.normal { background: var(--enhanced-bits-success)} .word-fill.warning { background: var(--enhanced-bits-warning)} .word-fill.over { background: var(--enhanced-bits-error)} .brief-details { padding: 1rem 0; border-bottom: 1px solid var(--enhanced-bits-border); margin-bottom: 1rem}
  .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem}
  .detail-item { display: flex; flex-direction: column; gap: 0.25rem}
  .detail-label { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .detail-value { color: var(--enhanced-bits-foreground); font-weight: 500}
  .due-date { color: var(--enhanced-bits-warning); font-weight: bold}
  .editor-layout { display: grid; grid-template-columns: 300px 1fr auto; gap: 2rem; margin-top: 2rem; min-height: 600px}
  .section-nav { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--enhanced-bits-border); border-radius: 8px; padding: 1.5rem}
  .nav-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .nav-header h3 { margin: 0; color: var(--enhanced-bits-foreground)}
  .section-list { display: flex; flex-direction: column; gap: 0.5rem}
  .section-item { display: block; width: 100%; padding: 1rem; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--enhanced-bits-border); border-radius: 6px; cursor: pointer; transition: all 0.2s ease; text-align: left; color: var(--enhanced-bits-foreground); font-family: inherit}
  .section-item:hover { background: rgba(255, 255, 255, 0.05); border-color: var(--enhanced-bits-primary)}
  .section-item.active { background: rgba(0, 255, 65, 0.1); border-color: var(--enhanced-bits-primary)}
  .section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem}
  .section-icon { font-size: 1rem}
  .section-title { flex: 1; font-weight: 500}
  .section-status { font-size: 0.75rem}
  .section-meta { display: flex; gap: 1rem, font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground)}
  .content-editor { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--enhanced-bits-border); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column}
  .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--enhanced-bits-border)}
  .section-info h3 { margin: 0; color: var(--enhanced-bits-foreground)}
  .section-type { font-size: 0.875rem; color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .editor-tools { display: flex; gap: 0.5rem}
  .editor-content { flex: 1, display: grid, grid-template-columns: 1fr auto; gap: 1rem; margin-bottom: 1.5rem}
  .content-textarea { width: 100%; min-height: 300px; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--enhanced-bits-border); border-radius: 4px; padding: 1rem;color: var(--enhanced-bits-foreground); font-family: 'Georgia', serif; font-size: 1rem; line-height: 1.6; resize: vertical}
  .content-textarea:focus { outline: none; border-color: var(--enhanced-bits-primary); box-shadow: 0 0 10px rgba(0, 255, 65, 0.2)}
  .suggestions-panel { width: 250px; background: rgba(157, 74, 221, 0.1); border: 1px solid var(--enhanced-bits-ai); border-radius: 4px; padding: 1rem}
  .suggestions-panel h4 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-ai); font-size: 0.875rem}
  .suggestions-list { list-style: none; padding: 0; margin: 0}
  .suggestion-item { padding: 0.5rem 0; border-bottom: 1px solid rgba(157, 74, 221, 0.2); font-size: 0.875rem; line-height: 1.4; color: var(--enhanced-bits-foreground)}
  .section-citations { border-top: 1px solid var(--enhanced-bits-border); padding-top: 1.5rem}
  .citations-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .citations-header h4 { margin: 0; color: var(--enhanced-bits-foreground)}
  .citations-list { display: flex; flex-direction: column; gap: 1rem}
  .citation-item { background: rgba(255, 255, 255, 0.02); border: 1px solid var(--enhanced-bits-border); border-radius: 6px; padding: 1rem}
  .citation-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem}
  .citation-icon { font-size: 1rem}
  .citation-type { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground); text-transform: uppercase}
  .citation-verified { margin-left: auto; font-size: 0.75rem; color: var(--enhanced-bits-warning)}
  .citation-verified.verified { color: var(--enhanced-bits-success)}
  .citation-content { display: grid; gap: 0.75rem; margin-bottom: 1rem}
  .citation-input, .citation-short, .citation-pinpoint { font-family: 'Times New Roman', serif; font-size: 0.875rem}
  .citation-metrics { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground)}
  .citation-panel { width: 300px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--enhanced-bits-border); border-radius: 8px, padding: 1.5rem; max-height: 600px; overflow-y: auto}
  .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem}
  .panel-header h3 { margin: 0; color: var(--enhanced-bits-foreground)}
  .section-citations-group { margin-bottom: 2rem}
  .section-citations-group h4 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground); font-size: 1rem}
  .citation-summary { display: flex; align-items: start; gap: 0.75rem;padding: 0.75rem 0; border-bottom: 1px solid var(--enhanced-bits-border)}
  .citation-text { flex: 1}
  .citation-full { font-size: 0.875rem; color: var(--enhanced-bits-foreground); line-height: 1.4}
  .citation-meta { font-size: 0.75rem; color: var(--enhanced-bits-muted-foreground); margin-top: 0.25rem}
  .no-section-selected { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: var(--enhanced-bits-muted-foreground)}
  .empty-icon { font-size: 3rem; margin-bottom: 1rem}
  .no-section-selected h3 { margin: 0, 0 1rem 0; color: var(--enhanced-bits-foreground)}
  .no-section-selected p { margin: 0}
  @media (max-width: 1200px) { .editor-layout { grid-template-columns: 250px 1fr}
    .citation-panel { position: fixed; top: 20px;right: 20px; z-index: 100; max-height: calc(100vh - 40px)}
  } @media (max-width: 768px) { .brief-title { flex-direction: column; gap: 1rem}
    .editor-layout { grid-template-columns: 1fr; gap: 1rem}
    .section-nav { order: 2}
    .content-editor { order: 1}
    .editor-content { grid-template-columns: 1fr}
    .suggestions-panel { width: 100%}
  } </style>







