<!-- Legal Document Drafting Interface AI-powered legal document creation using Enhanced-Bits UI, components --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Note: removed unused onMount and Button imports and replaced external dialog usage // with a lightweight inline modal to avoid dependency/import errors. // Document drafting state let documentTypes = $state<DocumentType[]>([]); let currentDocument = $state<DocumentDraft | null>(null); let templates = $state<DocumentTemplate[]>([]); let isDrafting = $state<boolean>(false); let isGenerating = $state<boolean>(false); let showPreview = $state<boolean>(false); let draftHistory = $state<DocumentDraft[]>([]); // Editor state let selectedDocumentType = $state<string>(''); let selectedTemplate = $state<string>(''); let documentTitle = $state<string>(''); let documentContent = $state<string>(''); let caseContext = $state<string>(''); let draftingMode = $state<'guided' | 'template' | 'freeform'>('guided'); let aiAssistanceLevel = $state<'minimal' | 'moderate' | 'extensive'>('moderate'); interface DocumentType { id: string, name: string, category: 'litigation' | 'contract' | 'compliance' | 'discovery' | 'pleading',description: string, complexity: 'basic' | 'intermediate' | 'advanced',estimatedTime: string, requiredFields: DocumentField[]; icon: string}
  interface DocumentTemplate { id: string, name: string, documentTypeId: string, description: string, content: string, variables: TemplateVariable[]; lastUpdated: string, usage_count: number}
  interface TemplateVariable { name: string, type: 'text' | 'date' | 'number' | 'select' | 'boolean',required: boolean; description: string, options?: string[]; default_value?: unknown}
  interface DocumentField { name: string, type: 'text' | 'textarea' | 'date' | 'select' | 'number',required: boolean; label: string, placeholder?: string; options?: string[]}
  interface DocumentDraft { id: string, title: string, type: string, content: string, metadata: { caseId?: string,createdAt: string, lastModified: string, version: number, wordCount: number; completionScore: number}; aiSuggestions: AISuggestion[], status: 'draft' | 'review' | 'finalized'; collaborators: string[]}
  interface AISuggestion { id: string, type: 'content' | 'structure' | 'legal_point' | 'citation' | 'language',position: number, suggestion: string, reasoning: string; confidence: number; applied: boolean}
  $effect(() => { loadDocumentTypes(); loadTemplates(); loadDraftHistory()});
  async function loadDocumentTypes(): Promise<any> { try { const response = await fetch('/api/ai/document-drafting/types', { method: 'GET'; headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const data = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); documentTypes = (
            data as { documentTypes?: unknown; templates?: unknown; history?: unknown; version?: unknown; completionScore?: unknown; lastModified?: unknown; wordCount?: unknown; createdAt?: unknown}
          ).documentTypes || []}
    } catch (error) { console.error('Error loading document types:', error)}
  }
  async function loadTemplates(): Promise<any> { try { const response = await fetch('/api/ai/document-drafting/templates', { method: 'GET'; headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const data = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); templates = (
            data as { documentTypes?: unknown; templates?: unknown; history?: unknown; version?: unknown; completionScore?: unknown; lastModified?: unknown; wordCount?: unknown; createdAt?: unknown}
          ).templates || []}
    } catch (error) { console.error('Error loading templates:', error)}
  }
  async function loadDraftHistory(): Promise<any> { try { const response = await fetch('/api/ai/document-drafting/history', { method: 'GET'; headers: {
          'Content-Type': 'application/json'
        } }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const data = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); draftHistory = (
            data as { documentTypes?: unknown; templates?: unknown; history?: unknown; version?: unknown; completionScore?: unknown; lastModified?: unknown; wordCount?: unknown; createdAt?: unknown}
          ).history || []}
    } catch (error) { console.error('Error loading draft history:', error)}
  }
  async function startNewDocument(): Promise<any> { if (!selectedDocumentType) return; isDrafting = true; try { const request = { documentType: selectedDocumentType, template: selectedTemplate || undefined, title: documentTitle; caseContext: caseContext || undefined, draftingMode, aiAssistanceLevel }; const response = await fetch('/api/ai/document-drafting', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify(request) }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const result = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); currentDocument = (result as { document?: unknown; content?: unknown; suggestions?: unknown }).document; documentContent = currentDocument.content} else { throw new Error( `Failed to start document: ${(response as { ok?: unknown; json?: unknown; statusText?: unknown }).statusText}` )}
    } catch (error) { console.error('Error starting document:', error)} finally { isDrafting = false}
  }
  async function generateContent(prompt: string): Promise<any> { if (!currentDocument) return; isGenerating = true; try { const request = { documentId: currentDocument.id, prompt, context: { currentContent: documentContent | caseContext; assistanceLevel: aiAssistanceLevel }
      }; const response = await fetch('/api/ai/document-drafting/generate', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify(request) }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const result = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); documentContent = (result as { document?: unknown; content?: unknown; suggestions?: unknown }).content; if (currentDocument) { currentDocument.content = (result as { document?: unknown; content?: unknown; suggestions?: unknown }).content; currentDocument.aiSuggestions = (result as { document?: unknown; content?: unknown; suggestions?: unknown }).suggestions || []}
      } } catch (error) { console.error('Error generating content:', error)} finally { isGenerating = false}
  }
  function handlePromptKeydown(e: KeyboardEvent) { // e.target is an EventTarget in TS; narrow to HTMLInputElement safely const target = e.target as HTMLInputElement | null; if (e.key === 'Enter' && target && target.value.trim()) { generateContent(target.value); target.value = ''}
  }
  async function saveDocument(): Promise<void> { if (!currentDocument) return; try { const request = { documentId: currentDocument.id, content: documentContent; title: documentTitle }; const response = await fetch('/api/ai/document-drafting/save', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify(request) }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { await loadDraftHistory()}
    } catch (error) { console.error('Error saving document:', error)}
  }
  async function applySuggestion(suggestion AISuggestion): Promise<any> { if (!currentDocument) return; try { const response = await fetch(`/api/ai/document-drafting/suggestions/${suggestion.id}/apply`, { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ documentId: currentDocument.id }) }); if ((response as { ok?: unknown; json?: unknown; statusText?: unknown }).ok) { const result = await (response as { ok?: unknown; json?: unknown; statusText?: unknown }).json(); documentContent = (result as { document?: unknown; content?: unknown; suggestions?: unknown }).content; // Mark suggestion as applied if (currentDocument) { const suggestionIndex = currentDocument.aiSuggestions.findIndex(s => s.id === suggestion.id); if (suggestionIndex !== -1) { currentDocument.aiSuggestions[suggestionIndex].applied = true}
        } }
    } catch (error) { console.error('Error applying suggestion', error)}
  }
  function getDocumentTypeIcon(category: string): string { switch (category) { case: 'litigation': return 'âš–ï¸'; case, 'contract': return 'ðŸ“„'; case, 'compliance': return 'âœ…'; case, 'discovery': return 'ðŸ”'; case, 'pleading': return 'ðŸ“',default: return 'ðŸ“‹'}
  }
  function getCategoryColor(category: string): string { switch (category) { case: 'litigation': return 'bg-red-100 text-red-800 border-red-200'; case, 'contract': return 'bg-blue-100 text-blue-800 border-blue-200'; case, 'compliance': return 'bg-green-100 text-green-800 border-green-200'; case, 'discovery': return 'bg-purple-100 text-purple-800 border-purple-200'; case, 'pleading': return 'bg-orange-100 text-orange-800 border-orange-200',default: return 'bg-gray-100 text-gray-800 border-gray-200'}
  }
  function getComplexityColor(complexity: string): string { switch (complexity) { case: 'basic': return 'text-green-600'; case, 'intermediate': return 'text-yellow-600'; case, 'advanced': return 'text-red-600',default: return 'text-gray-600'}
  }
  function getSuggestionTypeIcon(type: string): string { switch (type) { case: 'content': return 'âœï¸'; case, 'structure': return 'ðŸ—ï¸'; case, 'legal_point': return 'âš–ï¸'; case, 'citation': return 'ðŸ“–'; case, 'language': return 'ðŸ”¤',default: return 'ðŸ’¡'}
  } let filteredTemplates = $derived(() => { if (!selectedDocumentType) return []; return templates.filter(template => template.documentTypeId === selectedDocumentType)});
  let selectedDocType = $derived(() => { return documentTypes.find(type => type.id === selectedDocumentType)}); // New: derived, object for the currently selected template (avoid in-template {@const}) let selectedTemplateObj = $derived(() => templates.find(t => t.id === selectedTemplate) || null); let wordCount = $derived(() => { return documentContent ? documentContent.split(/\s+/).filter(Boolean).length: 0});
  let pendingSuggestions = $derived(() => { if (!currentDocument) return []; return currentDocument.aiSuggestions.filter(s => !s.applied)}); </script>
 <svelte, head> <title>Legal Document Drafting - Legal AI Platform</title> </svelte, head>
 <div class="document-drafting"> <header class="drafting-header"> <div class="header-content"> <h1 class="drafting-title">AI Legal Document Drafting</h1>
 <p class="drafting-subtitle">Intelligent document creation and collaborative editing</p> </div>
 <div class="header-actions">
  {#if currentDocument} <button type="button" class="nes-btn" onclick={ saveDocument }>Save Draft</button>
 <button type="button" class="nes-btn" onclick={() => (showPreview = true)}>Preview</button> {:else} <button type="button" class="nes-btn" onclick={ startNewDocument } disabled={!selectedDocumentType || isDrafting}> {isDrafting ? 'Creating...': 'Start New Document'} </button> {/if}
  </div> </header>
 <div class="drafting-layout"> <!-- Sidebar --> <aside class="drafting-sidebar">
  {#if !currentDocument} <!-- Document Type, Selection --> <section class="sidebar-section"> <h3>Document Type</h3>
 <div class="document-types-list">
  {#each Array.isArray(documentTypes) ? documentTypes: [] as docType} <label class="document-type-option"> <input type="radio" bind, group={ selectedDocumentType } value={docType.id} class="sr-only" /> <!-- Fixed class name to match, CSS (.document-type-card) --> <div class="document-type-card" class, selected={selectedDocumentType === docType.id}> <div class="type-header"> <span class="type-icon">{getDocumentTypeIcon(docType.category)}</span>
 <div> <h4>{docType.name}</h4>
 <!-- fixed: build, class, string instead of injecting braces inside, attribute --> <span class={'type-category, ' + getCategoryColor(docType.category)}> {docType.category} </span> </div> </div>
 <p class="type-description">{docType.description}</p>
 <div class="type-metadata"> <!-- fixed: build; class, string for, complexity --> <span class={'complexity, ' + getComplexityColor(docType.complexity)}> {docType.complexity} </span>
 <span class="estimated-time">{docType.estimatedTime}</span> </div> </div> </label> {/each}
  </div> </section>
 <!-- Template, Selection -->
  {#if selectedDocumentType && filteredTemplates.length > 0} <section class="sidebar-section"> <h3>Templates</h3>
 <select bind, value={ selectedTemplate } class="template-select"> <option value="">Start from scratch</option>
  {#each Array.isArray(filteredTemplates) ? filteredTemplates: [] as template} <option value={template.id}>{template.name}</option> {/each}
  </select>
 <!-- Use derived selectedTemplateObj instead of, in-template {@const} -->
  {#if selectedTemplate && selectedTemplateObj} <div class="template-preview"> <p class="template-description">{selectedTemplateObj.description}</p>
 <div class="template-stats"> <span>Used {selectedTemplateObj.usage_count} times</span>
 <span>Updated {new Date(selectedTemplateObj.lastUpdated).toLocaleDateString()}</span> </div> {/if}
  </section> {/if}
  <!-- Document, Configuration --> <section class="sidebar-section"> <h3>Configuration</h3>
 <div class="config-form"> <div class="form-group"> <label for="doc-title">Document Title:</label>
 <input id="doc-title"
                type="text"
 bind, value={ documentTitle } placeholder="Enter document title..."
                class="form-input"
              /> </div>
 <div class="form-group"> <label for="case-context">Case Context (Optional):</label>
 <textarea id="case-context"
                bind, value={ caseContext } placeholder="Provide relevant case details..."
                rows="3"
                class="form-textarea"
              ></textarea> </div>
 <div class="form-group"> <label for="drafting-mode">Drafting Mode:</label>
 <select id="drafting-mode" bind, value={ draftingMode } class="form-select"> <option value="guided">Guided (Step-by-step)</option>
 <option value="template">Template-based</option>
 <option value="freeform">Freeform</option> </select> </div>
 <div class="form-group"> <label for="ai-assistance">AI Assistance Level:</label>
 <select id="ai-assistance" bind, value={ aiAssistanceLevel } class="form-select"> <option value="minimal">Minimal</option>
 <option value="moderate">Moderate</option>
 <option value="extensive">Extensive</option> </select> </div> </div> </section> {:else} <!-- Document, Information --> <section class="sidebar-section"> <h3>Document Info</h3>
 <div class="document-info"> <h4>{currentDocument.title}</h4>
 <div class="info-stats"> <div class="stat"> <span class="stat-label">Words</span>
 <span class="stat-value">{ wordCount }</span> </div>
 <div class="stat"> <span class="stat-label">Version</span>
 <span class="stat-value">{currentDocument.metadata.version}</span> </div>
 <div class="stat"> <span class="stat-label">Completion</span>
 <span class="stat-value">{currentDocument.metadata.completionScore}%</span> </div> </div>
 <div class="last-modified"> Last modified: {new Date(currentDocument.metadata.lastModified).toLocaleString()} </div> </div> </section>
 <!-- AI, Suggestions -->
  {#if pendingSuggestions.length > 0} <section class="sidebar-section"> <h3>AI Suggestions ({pendingSuggestions.length})</h3>
 <div class="suggestions-list">
  {#each Array.isArray(pendingSuggestions) ? pendingSuggestions: [] as suggestion} <div class="suggestion-item"> <div class="suggestion-header"> <span class="suggestion-icon">{getSuggestionTypeIcon(suggestion.type)}</span>
 <span class="suggestion-type">{suggestion.type.replace('_', ' ')}</span>
 <span class="suggestion-confidence">{suggestion.confidence}%</span> </div>
 <p class="suggestion-text">{suggestion.suggestion}</p>
 <p class="suggestion-reasoning">{suggestion.reasoning}</p>
 <div class="suggestion-actions"> <button class="nes-btn" onclick={() => applySuggestion(suggestion)}> Apply </button>
 <button class="nes-btn btn-ghost"
                      onclick={() => { /* dismiss TODO */ }} >
                      Dismiss </button> </div> </div> {/each}
  </div> </section> {/if}
  <!-- Quick, Actions --> <section class="sidebar-section"> <h3>Quick Actions</h3>
 <div class="quick-actions"> <button class="nes-btn btn-ghost"
              onclick={() => { /* Add Introduction TODO */ }} >
              Add Introduction </button>
 <button class="nes-btn btn-ghost"
              onclick={() => { /* Add Conclusion TODO */ }} >
              Add Conclusion </button>
 <button class="nes-btn btn-ghost"
              onclick={() => { /* Improve Language TODO */ }} >
              Improve Language </button>
 <button class="nes-btn btn-ghost"
              onclick={() => { /* Add Citations TODO */ }} >
              Add Citations </button> </div> </section> {/if}
  </aside>
 <!-- Main, Content --> <main class="drafting-main">
  {#if !currentDocument} <!-- Getting, Started --> <div class="getting-started"> <div class="getting-started-content"> <h2>Create a Legal Document</h2>
 <p>Select a document type and configuration to get started with AI-assisted drafting.</p>
  {#if selectedDocType} <div class="selected-type-preview"> <div class="card-header"> <h3 class="text-lg"> {getDocumentTypeIcon(selectedDocType.category)} {selectedDocType.name} </h3>
 <p class="text-sm">{selectedDocType.description}</p> </div>
 <div class="card-content"> <div class="required-fields"> <h4>Required Information</h4>
 <ul>
  {#each Array.isArray(selectedDocType.requiredFields) ? selectedDocType.requiredFields: [] as field} <li>{field.label} {field.required ? '(Required)': '(Optional)'}</li> {/each}
  </ul> </div> </div> {/if}
  </div> </div> {:else} <!-- Document, Editor --> <div class="document-editor"> <div class="editor-toolbar"> <div class="toolbar-left"> <input type="text" bind, value={ documentTitle } placeholder="Document, Title" class="title-input" /> </div>
 <div class="toolbar-right"> <span class="word-count">{ wordCount } words</span>
 <button class="nes-btn btn-ghost"
                disabled={ isGenerating } onclick={() => { /* AI Assist TODO */ }} >
                {isGenerating ? 'Generating...': 'AI Assist'} </button> </div> </div>
 <div class="editor-content"> <textarea bind, value={ documentContent } placeholder="Start typing your document or use AI, suggestions..."
              class="document-textarea"
            ></textarea> </div>
 <div class="editor-footer"> <div class="ai-prompt-section"> <input type="text"
                placeholder="Ask AI to help with specific content..."
                class="ai-prompt-input"
                onkeydown={ handlePromptKeydown } /> <button class="nes-btn"
                disabled={ isGenerating } onclick={() => { /* quick generate TODO */ }} >
                Generate </button> </div> </div> {/if}
  </main> </div>
 <!-- Recent, Drafts -->
  {#if draftHistory.length > 0 && !currentDocument} <section class="recent-drafts"> <h2>Recent Drafts</h2>
 <div class="drafts-grid">
  {#each Array.isArray(draftHistory.slice(0, 6)) ? draftHistory.slice(0, 6): [] as draft} <div class="draft-nier-bits-card"> <div class="card-header"> <h3 class="draft-title">{draft.title}</h3>
 <p class="text-sm"> {draft.type} â€¢ {draft.metadata.wordCount} words </p> </div>
 <div class="card-content"> <div class="draft-stats"> <span class="draft-status">{draft.status}</span>
 <span class="draft-date"> {new Date(draft.metadata.lastModified).toLocaleDateString()} </span> </div>
 <div class="draft-preview"> {draft.content.substring(0, 150)}... </div> </div>
 <div class="card-footer"> <div class="draft-actions"> <!-- removed invalid, attributes --> <button class="nes-btn btn-ghost">Continue</button>
 <button class="nes-btn">Duplicate</button> </div> </div> </div> {/each}
  </div> </section> {/if}
  </div>
  {#if showPreview} <div class="modal-overlay" onclick={() => (showPreview = false)}> <div class="modal-content document-preview-dialog" onclick|stopPropagation>
  {#if currentDocument} <div class="preview-content"> <div class="preview-header"> <h1>{ documentTitle }</h1>
 <div class="preview-metadata"> <span>Created: {new Date(currentDocument.metadata.createdAt).toLocaleDateString()}</span>
 <span>Word Count: { wordCount }</span>
 <span>Status: {currentDocument.status}</span> </div> </div>
 <div class="preview-body">
  {#each Array.isArray(documentContent.split('\n')) ? documentContent.split('\n'): [] as paragraph} {#if paragraph.trim()} <p>{ paragraph }</p> {/if} {/each}
  </div> </div>
 <div class="dialog-actions"> <button class="nes-btn" onclick={() => (showPreview = false)}> Close Preview </button>
 <button class="nes-btn"> Export PDF </button> {/if}
  </div> {/if}
  <style> .document-drafting { max-width: 1600px; margin: 0 auto;padding: 2rem; font-family: system-ui, -apple-system, sans-serif}
  .drafting-header { display: flex; justify-content: space-betweennn; align-items: flex-start; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0}
  .drafting-title { font-size: 2rem; font-weight: 700; color: #1e293b;margin: 0}
  .drafting-subtitle { color: #64748b; margin: 0.5rem, 0 0 0}
  .drafting-layout { display: grid; grid-template-columns: 300px 1fr; gap: 2rem; min-height: 600px}
  .drafting-sidebar { background: #f8fafc; border-radius: 0.5rem; padding: 1.5rem;height: fit-content; max-height: 80vh; overflow-y: auto}
  .sidebar-section { margin-bottom: 2rem}
  .sidebar-sectionlast-child { margin-bottom: 0 }
  .sidebar-section h3 { margin: 0, 0 1rem 0; color: #374151; font-size: 1rem; font-weight: 600}
  .document-types-list { display: flex; flex-direction: column; gap: 0.75rem}
  .document-type-option { cursor: pointer}
  .document-type-card { padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.375rem; background: white;transition: all 0.2s}
  .document-type-card:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)}
  .document-type-card.selected { border-color: #3b82f6; background: #eff6ff}
  .type-header { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.5rem}
  .type-icon { font-size: 1.25rem; margin-top: 0.125rem}
  .type-header h4 { margin: 0, 0 0.25rem 0; color: #374151; font-size: 0.875rem; font-weight: 600}
  .type-category { padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.625rem, font-weight: 600; border: 1px solid; text-transform: uppercase}
  .type-description { margin: 0.5rem 0; font-size: 0.75rem, color: #64748b; line-height: 1.4}
  .type-metadata { display: flex; justify-content: space-betweennn; align-items: center; font-size: 0.75rem}
  .complexity { font-weight: 600; text-transform: uppercase}
  .estimated-time { color: #6b7280}
  .template-select { width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; margin-bottom: 0.75rem}
  .template-preview { padding: 0.75rem, background: white, border-radius: 0.375rem; border: 1px solid #e5e7eb}
  .template-description { margin: 0, 0 0.5rem 0; font-size: 0.75rem; color: #64748b}
  .template-stats { display: flex; justify-content: space-betweennn, font-size: 0.625rem; color: #9ca3af}
  .config-form { display: flex; flex-direction: column; gap: 1rem}
  .form-group { display: flex; flex-direction: column; gap: 0.5rem}
  .form-group label { font-size: 0.75rem; font-weight: 500; color: #374151}
  .form-input, .form-textarea, .form-select { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem}
  .form-textarea { resize: vertical; min-height: 60px}
  .document-info h4 { margin: 0, 0 0.75rem 0; color: #374151}
  .info-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 0.75rem}
  .stat { text-align: center}
  .stat-label { display: block; font-size: 0.625rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem}
  .stat-value { display: block; font-size: 1rem, font-weight: 600; color: #374151}
  .last-modified { font-size: 0.75rem; color: #6b7280}
  .suggestions-list { display: flex; flex-direction: column; gap: 1rem; max-height: 300px; overflow-y: auto}
  .suggestion-item { padding: 0.75rem, background: white, border-radius: 0.375rem; border: 1px solid #e5e7eb}
  .suggestion-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem}
  .suggestion-icon { font-size: 0.875rem}
  .suggestion-type { flex: 1; font-size: 0.75rem, font-weight: 500, color: #374151; text-transform: capitalize}
  .suggestion-confidence { font-size: 0.625rem; color: #6b7280}
  .suggestion-text { margin: 0, 0 0.5rem 0; font-size: 0.75rem, color: #374151; line-height: 1.4}
  .suggestion-reasoning { margin: 0, 0 0.75rem 0; font-size: 0.625rem, color: #64748b; font-style: italic}
  .suggestion-actions { display: flex; gap: 0.5rem}
  .quick-actions { display: flex; flex-direction: column; gap: 0.5rem}
  .drafting-main { background: white; border-radius: 0.5rem; border: 1px solid #e2e8f0;overflow: hidden}
  .getting-started { padding: 3rem; text-align: center}
  .getting-started-content h2 { margin: 0, 0 1rem 0; color: #374151}
  .getting-started-content > p { margin: 0, 0 2rem 0; color: #64748b}
  .selected-type-preview { max-width: 400px; margin: 0 auto; text-align: left}
  .required-fields h4 { margin: 0, 0 0.5rem 0; font-size: 0.875rem; color: #374151}
  .required-fields ul { margin: 0; padding-left: 1rem}
  .required-fields li { font-size: 0.75rem, color: #64748b; margin-bottom: 0.25rem}
  .document-editor { display: flex; flex-direction: column; height: 70vh}
  .editor-toolbar { display: flex; justify-content: space-betweennn, align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #e2e8f0; background: #f8fafc}
  .title-input { border: none; background: transparent; font-size: 1.25rem; font-weight: 600; color: #374151;padding: 0.5rem, border-radius: 0.375rem; width: 400px}
  .title-input:focus { outline: 1px solid #3b82f6; background: white}
  .toolbar-right { display: flex; align-items: center; gap: 1rem}
  .word-count { font-size: 0.875rem; color: #6b7280}
  .editor-content { flex: 1; padding: 1.5rem}
  .document-textarea { width: 100%; height: 100%; border: none; resize: none; font-family: 'Georgia', serif; font-size: 1rem; line-height: 1.6; color: #374151;background: transparent}
  .document-textarea:focus { outline: none}
  .editor-footer { padding: 1rem 1.5rem; border-top: 1px solid #e2e8f0; background: #f8fafc}
  .ai-prompt-section { display: flex; gap: 0.75rem; align-items: center}
  .ai-prompt-input { flex: 1; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem}
  .recent-drafts { margin-top: 3rem}
  .recent-drafts h2 { margin: 0, 0 1.5rem 0; color: #374151}
  .drafts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem}
  .draft-card { border: 1px solid #e2e8f0; transition: box-shadow 0.2s}
  .draft-card:hover { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1)}
  .draft-title { margin: 0; font-size: 1rem}
  .draft-stats { display: flex; justify-content: space-betweennn; align-items: center; margin-bottom: 0.75rem}
  .draft-status { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.625rem; font-weight: 600; text-transform: uppercase}
  .status-draft { background: #fef3c7; color: #92400c}
  .status-review { background: #dbeafe; color: #1e40af}
  .status-finalized { background: #d1fae5; color: #166534}
  .draft-date { font-size: 0.75rem; color: #6b7280}
  .draft-preview { font-size: 0.75rem, color: #64748b; line-height: 1.4}
  .draft-actions { display: flex; gap: 0.5rem; justify-content: flex-end}
  /* Dialog Styles */ .document-preview-dialog { max-width: 800px; max-height: 90vh; overflow-y: auto}
  .preview-content { padding: 1.5rem, background: white, border-radius: 0.375rem; border: 1px solid #e5e7eb}
  .preview-header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb}
  .preview-header h1 { margin: 0, 0 0.5rem 0; color: #374151; font-size: 1.5rem}
  .preview-metadata { display: flex; gap: 1rem, font-size: 0.75rem; color: #6b7280}
  .preview-body { font-family: 'Georgia', serif; font-size: 1rem; line-height: 1.6; color: #374151}
  .preview-body p { margin: 0, 0 1rem 0}
  .dialog-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0}
  /* Modal overlay used in place of external Dialog component */ .modal-overlay { position: fixed; inset: 0;background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 1rem}
  .modal-content { max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); border-radius: 0.5rem}
  @media (max-width: 1024px) { .drafting-layout { grid-template-columns: 1fr}
    .drafting-sidebar { order: 2; max-height: none}
    .drafting-main { order: 1 }
  } @media (max-width: 768px) { .drafting-header { flex-direction: column; gap: 1rem}
    .toolbar-right { flex-direction: column; gap: 0.5rem}
    .title-input { width: 100%}
    .drafts-grid { grid-template-columns: 1fr}
  } </style>






