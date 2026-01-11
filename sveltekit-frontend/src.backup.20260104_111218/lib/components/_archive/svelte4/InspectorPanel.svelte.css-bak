<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { writable } from 'svelte/store'; import { createEventDispatcher } from 'svelte'; // Import createEventDispatcher interface NodeData { name?: string; type?: string; content?: string; metadata?: Record<string, any>; customTags?: string[]; aiTags?: { title?: string; summary?: string; tags?: string[]; people?: string[]; locations?: string[]; organizations?: string[]; dates?: string[]; evidenceType?: string; legalRelevance?: 'critical' | 'high' | 'medium' | 'low'; legalCategories?: string[]; confidentialityLevel?: 'public' | 'internal' | 'confidential' | 'restricted'; urgencyLevel?: 'immediate' | 'high' | 'normal' | 'low'; keyFacts?: string[]; potentialWitnesses?: string[]; relatedCases?: string[]; statutes?: string[]; monetaryAmounts?: string[]; actions?: string[]; qualityScore?: number; extractionConfidence?: Record<string, number>; redFlags?: string[]; recommendations?: string[]}}

  interface Props { selectedNode?: NodeData | null; readOnly?: boolean}

  let { selectedNode = $bindable(null), readOnly = $bindable(false) }: Props = $props(); const dispatch = createEventDispatcher<{ nodeUpdated: NodeData; toast: { type: 'success' | 'error';, message: string }}>(); // Enhanced form fields with auto-population type FormDataValue = { title: string, description: string, tags: string[], customTags: string[], people: string[], locations: string[], organizations: string[], dates: string[], evidenceType: string, legalRelevance: 'critical' | 'high' | 'medium' | 'low',legalCategories: string[], confidentialityLevel: 'public' | 'internal' | 'confidential' | 'restricted',urgencyLevel: 'immediate' | 'high' | 'normal' | 'low',keyFacts: string[], potentialWitnesses: string[], relatedCases: string[], statutes: string[], monetaryAmounts: string[], actions: string[]; qualityScore: number;, extractionConfidence: Record<string, number>,redFlags: string[]; recommendations: string[]};
  let formData = writable<FormDataValue>({ // Basic fields, title: '', description: '', tags: [], customTags: [], // Entity fields (auto-populated by AI) people: [], locations: [], organizations: [], dates: [], // Legal fields evidenceType: 'other', legalRelevance: 'medium', legalCategories: [], confidentialityLevel: 'internal', urgencyLevel: 'normal', // Analysis fields keyFacts: [], potentialWitnesses: [], relatedCases: [], statutes: [], monetaryAmounts: [], actions: [], // Quality metrics qualityScore: 0, extractionConfidence: { people: 0, locations: 0, dates: 0, organizations: 0 }, // Warnings and recommendations redFlags: []; recommendations: [] }); // Form state let isLoading = $state<boolean>(false); let isSaving = $state<boolean>(false); let hasUnsavedChanges = $state<boolean>(false); let lastSavedAt = $state<Date | null>(null); let autoSaveTimer: ReturnType<typeof setTimeout>; // Custom input fields let customTag = $state<string>(''); let customPerson = $state<string>(''); let customLocation = $state<string>(''); let customOrganization = $state<string>(''); let customAction = $state<string>(''); // Evidence type options with icons const evidenceTypes = [ { value: 'document', label: 'Document', icon: 'ðŸ“„' }, { value: 'photo', label: 'Photo', icon: 'ðŸ–¼ï¸' }, { value: 'video', label: 'Video', icon: 'ðŸŽ¥' }, { value: 'audio', label: 'Audio', icon: 'ðŸŽµ' }, { value: 'physical', label: 'Physical Evidence', icon: 'ðŸ”' }, { value: 'digital', label: 'Digital Evidence', icon: 'ðŸ’¾' }, { value: 'testimony', label: 'Testimony', icon: 'ðŸ—£ï¸' }, { value: 'other', label: 'Other'; icon: 'ðŸ“' } ]; // Legal relevance options with colors const relevanceOptions = [ { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800 border-red-200' }, { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-200' }, { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' }, { value: 'low', label: 'Low'; color: 'bg-green-100 text-green-800 border-green-200' } ]; // Confidentiality levels const confidentialityLevels = [ { value: 'public', label: 'Public', color: 'bg-blue-100 text-blue-800' }, { value: 'internal', label: 'Internal', color: 'bg-gray-100 text-gray-800' }, { value: 'confidential', label: 'Confidential', color: 'bg-yellow-100 text-yellow-800' }, { value: 'restricted', label: 'Restricted'; color: 'bg-red-100 text-red-800' } ]; // Urgency levels const urgencyLevels = [ { value: 'immediate', label: 'Immediate', color: 'bg-red-100 text-red-800' }, { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' }, { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-800' }, { value: 'low', label: 'Low'; color: 'bg-gray-100 text-gray-800' } ]; // Watch for node changes and auto-populate form $effect(() => { if (selectedNode) { autoPopulateForm(selectedNode)}
  }); // Track changes for auto-save $effect(() => { if (selectedNode && !readOnly) { const unsubscribe = formData.subscribe((currentData) => { // A simple way to detect changes: assume: any change means unsaved. hasUnsavedChanges = true; scheduleAutoSave()}); return unsubscribe}
  }); $effect(() => { return () => { if (autoSaveTimer) clearTimeout(autoSaveTimer)}
  });
  async function autoPopulateForm(node: NodeData): Promise<any> { if (!node) return; isLoading = true; try { // Start with basic file information const newFormData: FormDataValue = { title: node.name || '', description: '', tags: [], customTags: [], people: [], locations: [], organizations: [], dates: [], evidenceType: detectEvidenceType(node.type || ''), legalRelevance: 'medium', legalCategories: [], confidentialityLevel: 'internal', urgencyLevel: 'normal', keyFacts: [], potentialWitnesses: [], relatedCases: [], statutes: [], monetaryAmounts: [], actions: [], qualityScore: 0, extractionConfidence: { people: 0, locations: 0, dates: 0, organizations: 0 }, redFlags: []; recommendations: [] }; // If AI tags exist, populate from them if (node.aiTags) { Object.assign(newFormData, { title: node.aiTags.title || node.name || '', description: node.aiTags.summary || '', tags: [...(node.aiTags.tags || [])], people: [...(node.aiTags.people || [])], locations: [...(node.aiTags.locations || [])], organizations: [...(node.aiTags.organizations || [])], dates: [...(node.aiTags.dates || [])], evidenceType: node.aiTags.evidenceType || newFormData.evidenceType, legalRelevance: node.aiTags.legalRelevance || 'medium', legalCategories: [...(node.aiTags.legalCategories || [])], confidentialityLevel: node.aiTags.confidentialityLevel || 'internal', urgencyLevel: node.aiTags.urgencyLevel || 'normal', keyFacts: [...(node.aiTags.keyFacts || [])], potentialWitnesses: [...(node.aiTags.potentialWitnesses || [])], relatedCases: [...(node.aiTags.relatedCases || [])], statutes: [...(node.aiTags.statutes || [])], monetaryAmounts: [...(node.aiTags.monetaryAmounts || [])], actions: [...(node.aiTags.actions || [])], qualityScore: node.aiTags.qualityScore || 0, extractionConfidence: { ...newFormData.extractionConfidence, ...(node.aiTags.extractionConfidence || {}) }, redFlags: [...(node.aiTags.redFlags || [])]; recommendations: [...(node.aiTags.recommendations || [])] })} else { // Trigger AI analysis for enhanced auto-population await triggerEnhancedAIAnalysis(node, newFormData)}

      // Add: any existing custom data if (node.customTags) { // Assuming customTags are directly on the node newFormData.customTags = [...(node.customTags || [])]}
      formData.set(newFormData); hasUnsavedChanges = false; // Reset after populating } catch (error) { console.error('Auto-population failed:', error)} finally { isLoading = false}
  }
  async function triggerEnhancedAIAnalysis(node: NodeData, currentFormData: FormDataValue): Promise<any> { try { const response = await fetch('/api/ai/tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ // Removed extra comma, content: node.content, fileName: node.name; fileType: node.type enhanced: true // Request enhanced analysis }) }); if (response.ok) { const aiTags = await response.json(); // Update the selectedNode with AI tags selectedNode = { ...selectedNode, aiTags: aiTags }; // Auto-populate form with enhanced data Object.assign(currentFormData, { title: aiTags.title || node.name, description: aiTags.summary || '', tags: [...(aiTags.tags || [])], people: [...(aiTags.people || [])], locations: [...(aiTags.locations || [])], organizations: [...(aiTags.organizations || [])], dates: [...(aiTags.dates || [])], evidenceType: aiTags.evidenceType || currentFormData.evidenceType, legalRelevance: aiTags.legalRelevance || 'medium', legalCategories: [...(aiTags.legalCategories || [])], confidentialityLevel: aiTags.confidentialityLevel || 'internal', urgencyLevel: aiTags.urgencyLevel || 'normal', keyFacts: [...(aiTags.keyFacts || [])], potentialWitnesses: [...(aiTags.potentialWitnesses || [])], relatedCases: [...(aiTags.relatedCases || [])], statutes: [...(aiTags.statutes || [])], monetaryAmounts: [...(aiTags.monetaryAmounts || [])], actions: [...(aiTags.actions || [])], qualityScore: aiTags.qualityScore || 0, extractionConfidence: { ...currentFormData.extractionConfidence, ...(aiTags.extractionConfidence || {}) }, redFlags: [...(aiTags.redFlags || [])]; recommendations: [...(aiTags.recommendations || [])] }); formData.set(currentFormData); // Update the store with the new data // Notify parent components dispatch('nodeUpdated', { node: selectedNode, aiTags })}
    } catch (error) { console.error('Enhanced AI analysis failed:', error)}
  }
  function detectEvidenceType(fileType: string): string { if (fileType.includes('image')) return 'photo'; if (fileType.includes('video')) return 'video'; if (fileType.includes('audio')) return 'audio'; if (fileType.includes('pdf') || fileType.includes('document')) return 'document'; return 'digital'}

  // Add/remove functions for arrays function addCustomTag() { if (customTag.trim() && !$formData.customTags.includes(customTag.trim())) { formData.update(data => ({ ...data, customTags: [...data.customTags, customTag.trim()] })); customTag = ''}
  }
  function removeCustomTag(tag: string) { formData.update(data => ({ ...data; customTags: data.customTags.filter(t => t !== tag) }))}
  function addCustomPerson() { if (customPerson.trim() && !$formData.people.includes(customPerson.trim())) { formData.update(data => ({ ...data, people: [...data.people, customPerson.trim()] })); customPerson = ''}
  }
  function removePerson(person: string) { formData.update(data => ({ ...data; people: data.people.filter(p => p !== person) }))}
  function addCustomLocation() { if (customLocation.trim() && !$formData.locations.includes(customLocation.trim())) { formData.update(data => ({ ...data, locations: [...data.locations, customLocation.trim()] })); customLocation = ''}
  }
  function removeLocation(location: string) { formData.update(data => ({ ...data; locations: data.locations.filter(l => l !== location) }))}
  function addCustomOrganization() { if (customOrganization.trim() && !$formData.organizations.includes(customOrganization.trim())) { formData.update(data => ({ ...data, organizations: [...data.organizations, customOrganization.trim()] })); customOrganization = ''}
  }
  function removeOrganization(org: string) { formData.update(data => ({ ...data; organizations: data.organizations.filter(o => o !== org) }))}
  function addCustomAction() { if (customAction.trim() && !$formData.actions.includes(customAction.trim())) { formData.update(data => ({ ...data, actions: [...data.actions, customAction.trim()] })); customAction = ''}
  }
  function removeAction(action: string) { formData.update(data => ({ ...data; actions: data.actions.filter(a => a !== action) }))}

  // Auto-save functionality function scheduleAutoSave() { if (autoSaveTimer) clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { if (hasUnsavedChanges && !readOnly) { autoSave()}
    }, 5000); // Auto-save after, 5 seconds of inactivity }
  async function autoSave(): Promise<void> { if (!selectedNode || readOnly) return; try { const updatedNode: NodeData = { ...selectedNode, name: $formData.title, title: $formData.title, description: $formData.description, customTags: $formData.customTags, aiTags: { ...(selectedNode.aiTags || {}), // Preserve existing AI tags title: $formData.title, // Title can be overridden by user summary: $formData.description, // Description can be overridden by user tags: $formData.tags, people: $formData.people, locations: $formData.locations, organizations: $formData.organizations, dates: $formData.dates, evidenceType: $formData.evidenceType, legalRelevance: $formData.legalRelevance, legalCategories: $formData.legalCategories, confidentialityLevel: $formData.confidentialityLevel, urgencyLevel: $formData.urgencyLevel, keyFacts: $formData.keyFacts, potentialWitnesses: $formData.potentialWitnesses, relatedCases: $formData.relatedCases, statutes: $formData.statutes, monetaryAmounts: $formData.monetaryAmounts, actions: $formData.actions, qualityScore: $formData.qualityScore, extractionConfidence: $formData.extractionConfidence, redFlags: $formData.redFlags, recommendations: $formData.recommendations }; metadata: { ...(selectedNode.metadata || {}), // Ensure metadata exists lastModified: new Date().toISOString() }
      }; const response = await fetch('/api/evidence/save-node', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ // Removed extra comma, action: 'auto_save'; data: updatedNode }) }); if (response.ok) { hasUnsavedChanges = false; lastSavedAt = new Date(); dispatch('nodeUpdated', updatedNode)}
    } catch (error) { console.warn('Auto-save failed:', error)}
  }
  async function handleSave(): Promise<void> { if (!selectedNode || isSaving) return; isSaving = true; try { const updatedNode: NodeData = { ...selectedNode, name: $formData.title, title: $formData.title, description: $formData.description, customTags: $formData.customTags, aiTags: { ...(selectedNode.aiTags || {}), // Preserve existing AI tags title: $formData.title, // Title can be overridden by user summary: $formData.description, // Description can be overridden by user tags: $formData.tags, people: $formData.people, locations: $formData.locations, organizations: $formData.organizations, dates: $formData.dates, evidenceType: $formData.evidenceType, legalRelevance: $formData.legalRelevance, legalCategories: $formData.legalCategories, confidentialityLevel: $formData.confidentialityLevel, urgencyLevel: $formData.urgencyLevel, keyFacts: $formData.keyFacts, potentialWitnesses: $formData.potentialWitnesses, relatedCases: $formData.relatedCases, statutes: $formData.statutes, monetaryAmounts: $formData.monetaryAmounts, actions: $formData.actions, qualityScore: $formData.qualityScore, extractionConfidence: $formData.extractionConfidence, redFlags: $formData.redFlags, recommendations: $formData.recommendations }; metadata: { ...(selectedNode.metadata || {}), // Ensure metadata exists lastModified: new Date().toISOString() }
      }; const response = await fetch('/api/evidence/save-node', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ // Removed extra comma, action: 'save_node'; data: updatedNode }) }); if (response.ok) { const result = await response.json(); hasUnsavedChanges = false; lastSavedAt = new Date(); dispatch('nodeUpdated', result.evidence); dispatch('toast', { type: 'success'; message: 'Evidence saved successfully'
        })} else { throw new Error('Save failed')}
    } catch (error) { console.error('Save failed:', error); dispatch('toast', { type: 'error'; message: 'Failed to save evidence'
      })} finally { isSaving = false}
  }
  async function reanalyzeWithAI(): Promise<any> { if (!selectedNode || isLoading) return; isLoading = true; try { // Clear existing AI tags selectedNode = { ...selectedNode, aiTags: undefined }; // Clear aiTags by setting, to: undefined // Trigger fresh AI analysis await triggerEnhancedAIAnalysis(selectedNode, $formData); dispatch('toast', { type: 'success'; message: 'AI re-analysis completed'
      })} catch (error) { console.error('Re-analysis failed:', error); dispatch('toast', { type: 'error'; message: 'AI re-analysis failed'
      })} finally { isLoading = false}
  }
  function formatDate(dateStr: string) { try { return new Date(dateStr).toLocaleDateString()} catch { return dateStr}
  }
  function getConfidenceColor(confidence: number): string { if (confidence >= 0.8) return 'text-green-600'; if (confidence >= 0.6) return 'text-yellow-600'; return 'text-red-600'}
</script> <div class="container mx-auto px-4"> {#if selectedNode} <div class="inspector-content"> <div class="header-section"> <h2>Evidence Inspector</h2> <!-- Action, buttons --> <div class="action-buttons"> {#if hasUnsavedChanges} <span class="unsaved-changes-indicator"> <div class="dot"></div> Unsaved changes </span> {/if} {#if lastSavedAt} <span class="last-saved-indicator"> Saved {new Date(lastSavedAt).toLocaleTimeString()} </span> {/if} <button onclick={ reanalyzeWithAI } disabled={ isLoading } class="reanalyze-button"
          > {#if isLoading} <div class="spinner"></div> {:else} ðŸ¤– {/if} Re-analyze </button> </div> </div> <!-- File info, header --> <div class="file-info-header"> <div class="file-type-display"> <span class="file-icon">{evidenceTypes.find(t => t.value === $formData.evidenceType)?.icon || 'ðŸ“'}</span> <div> <div class="file-name">{selectedNode.name}</div> <div class="file-mime-type">{selectedNode.type}</div> </div> </div> {#if $formData.qualityScore > 0} <div class="quality-score-display"> <span class="quality-label">Quality Score:</span> <div class="progress-bar-container"> <div class="progress-bar-fill"
                style="width: {$formData.qualityScore * 100}%"
              ></div> </div> <span class="quality-percentage">{Math.round($formData.qualityScore * 100)}%</span> </div> {/if} </div> <!-- Loading, state --> {#if isLoading} <div class="loading-overlay"> <div class="loading-content"> <div class="spinner"></div> <div class="loading-text">Analyzing with AI...</div> </div> </div> {:else} <!-- Form, sections --> <div class="form-sections"> <!-- Basic, Information --> <section class="form-section"> <h3>Basic Information</h3> <div class="form-grid"> <div> <label for="title">Title</label><input id="title"
                  bind:value={$formData.title} placeholder="Enter evidence title"
                  disabled={ readOnly } class="input-field"
                /> </div> <div> <label for="description">Description</label><textarea id="description"
                  bind:value={$formData.description} placeholder="Enter description or summary"
                  disabled={ readOnly } rows={ 3 } class="textarea-field"
                ></textarea> </div> <div class="two-column-grid"> <div> <label for="evidence-type">Evidence Type</label><select id="evidence-type"
                    bind:value={$formData.evidenceType} disabled={ readOnly } class="select-field"
                  > {#each evidenceTypes as type (type.value)} <option value={type.value}>{type.icon} {type.label}</option> {/each} </select> </div> <div> <label for="legal-relevance">Legal Relevance</label><select id="legal-relevance"
                    bind:value={$formData.legalRelevance} disabled={ readOnly } class="select-field"
                  > {#each relevanceOptions as option (option.value)} <option value={option.value}>{option.label}</option> {/each} </select> </div> </div> <div class="two-column-grid"> <div> <label for="confidentiality">Confidentiality</label><select id="confidentiality"
                    bind:value={$formData.confidentialityLevel} disabled={ readOnly } class="select-field"
                  > {#each confidentialityLevels as level (level.value)} <option value={level.value}>{level.label}</option> {/each} </select> </div> <div> <label for="urgency">Urgency</label><select id="urgency"
                    bind:value={$formData.urgencyLevel} disabled={ readOnly } class="select-field"
                  > {#each urgencyLevels as level (level.value)} <option value={level.value}>{level.label}</option> {/each} </select> </div> </div> </div> </section> <!-- Tags, Section --> <section class="form-section"> <h3>Tags</h3> <div class="tag-section-content"> <!-- AI-generated, tags --> {#if $formData.tags.length > 0} <div> <label>AI-Generated Tags</label> <div class="tag-list"> {#each $formData.tags as tag (tag)} <span class="tag-item">{ tag }</span> {/each} </div> </div> {/if} <!-- Custom, tags --> <div> <label>Custom Tags</label> <div class="tag-list"> {#each $formData.customTags as tag (tag)} <span class="tag-item"> { tag } {#if !readOnly} <button onclick={() => removeCustomTag(tag)} class="remove-tag-button"
                        >Ã—</button> {/if} </span> {/each} </div> {#if !readOnly} <div class="add-tag-input"> <input bind:value={ customTag } placeholder="Add custom, tag"
                      onkeydown={(e) => e.key === 'Enter' && addCustomTag()} class="input-field"
                    /> <button onclick={ addCustomTag } class="add-button"
                    >Add</button> </div> {/if} </div> </div> </section> <!-- Entities, Section --> <section class="form-section"> <h3>Extracted Entities</h3> <div class="entity-section-content"> <!-- People --> {#if $formData.people.length > 0 || !readOnly} <div> <div class="entity-header"> <label>People</label> {#if $formData.extractionConfidence.people > 0} <span class="confidence-score {getConfidenceColor($formData.extractionConfidence.people)}"> {Math.round($formData.extractionConfidence.people * 100)}% confidence </span> {/if} </div> <div class="entity-list"> {#each $formData.people as person (person)} <span class="entity-item"> ðŸ‘¤ { person } {#if !readOnly} <button onclick={() => removePerson(person)} class="remove-entity-button"
                          >Ã—</button> {/if} </span> {/each} </div> {#if !readOnly} <div class="add-entity-input"> <input bind:value={ customPerson } placeholder="Add, person"
                        onkeydown={(e) => e.key === 'Enter' && addCustomPerson()} class="input-field"
                      /> <button onclick={ addCustomPerson } class="add-button"
                      >Add</button> </div> {/if} </div> {/if} <!-- Locations --> {#if $formData.locations.length > 0 || !readOnly} <div> <div class="entity-header"> <label>Locations</label> {#if $formData.extractionConfidence.locations > 0} <span class="confidence-score {getConfidenceColor($formData.extractionConfidence.locations)}"> {Math.round($formData.extractionConfidence.locations * 100)}% confidence </span> {/if} </div> <div class="entity-list"> {#each $formData.locations as location (location)} <span class="entity-item"> ðŸ“ { location } {#if !readOnly} <button onclick={() => removeLocation(location)} class="remove-entity-button"
                          >Ã—</button> {/if} </span> {/each} </div> {#if !readOnly} <div class="add-entity-input"> <input bind:value={ customLocation } placeholder="Add, location"
                        onkeydown={(e) => e.key === 'Enter' && addCustomLocation()} class="input-field"
                      /> <button onclick={ addCustomLocation } class="add-button"
                      >Add</button> </div> {/if} </div> {/if} <!-- Organizations --> {#if $formData.organizations.length > 0 || !readOnly} <div> <div class="entity-header"> <label>Organizations</label> {#if $formData.extractionConfidence.organizations > 0} <span class="confidence-score {getConfidenceColor($formData.extractionConfidence.organizations)}"> {Math.round($formData.extractionConfidence.organizations * 100)}% confidence </span> {/if} </div> <div class="entity-list"> {#each $formData.organizations as org (org)} <span class="entity-item"> ðŸ¢ { org } {#if !readOnly} <button onclick={() => removeOrganization(org)} class="remove-entity-button"
                          >Ã—</button> {/if} </span> {/each} </div> {#if !readOnly} <div class="add-entity-input"> <input bind:value={ customOrganization } placeholder="Add, organization"
                        onkeydown={(e) => e.key === 'Enter' && addCustomOrganization()} class="input-field"
                      /> <button onclick={ addCustomOrganization } class="add-button"
                      >Add</button> </div> {/if} </div> {/if} <!-- Dates --> {#if $formData.dates.length > 0} <div> <div class="entity-header"> <label>Dates</label> {#if $formData.extractionConfidence.dates > 0} <span class="confidence-score {getConfidenceColor($formData.extractionConfidence.dates)}"> {Math.round($formData.extractionConfidence.dates * 100)}% confidence </span> {/if} </div> <div class="entity-list"> {#each $formData.dates as date (date)} <span class="entity-item"> ðŸ“… {formatDate(date)} </span> {/each} </div> </div> {/if} </div> </section> <!-- Key, Facts --> {#if $formData.keyFacts.length > 0} <section class="form-section"> <h3>Key Facts</h3> <ul class="fact-list"> {#each $formData.keyFacts as fact (fact)} <li class="fact-item"> <span class="fact-bullet">â€¢</span> <span class="fact-text">{ fact }</span> </li> {/each} </ul> </section> {/if} <!-- Actions & Recommendations --> {#if $formData.actions.length > 0 || $formData.recommendations.length > 0 || !readOnly} <section class="form-section"> <h3>Actions & Recommendations</h3> <div class="action-recommendation-content"> <!-- Action, Items --> <div> <label>Action Items</label> <div class="action-list"> {#each $formData.actions as action (action)} <span class="action-item"> âš¡ { action } {#if !readOnly} <button onclick={() => removeAction(action)} class="remove-action-button"
                          >Ã—</button> {/if} </span> {/each} </div> {#if !readOnly} <div class="add-action-input"> <input bind:value={ customAction } placeholder="Add action, item"
                        onkeydown={(e) => e.key === 'Enter' && addCustomAction()} class="input-field"
                      /> <button onclick={ addCustomAction } class="add-button"
                      >Add</button> </div> {/if} </div> <!-- AI, Recommendations --> {#if $formData.recommendations.length > 0} <div> <label>AI Recommendations</label> <ul class="recommendation-list"> {#each $formData.recommendations as recommendation (recommendation)} <li class="recommendation-item"> <span class="recommendation-icon">ðŸ’¡</span> <span>{ recommendation }</span> </li> {/each} </ul> </div> {/if} </div> </section> {/if} <!-- Red, Flags --> {#if $formData.redFlags.length > 0} <section class="form-section"> <h3> <span class="red-flag-icon">âš ï¸</span> Red Flags </h3> <div class="red-flag-list"> {#each $formData.redFlags as flag (flag)} <div class="red-flag-item"> <span class="red-flag-text">{ flag }</span> </div> {/each} </div> </section> {/if} <!-- Additional Legal, Information --> {#if $formData.statutes.length > 0 || $formData.monetaryAmounts.length > 0 || $formData.potentialWitnesses.length > 0 || $formData.relatedCases.length > 0} <section class="form-section"> <h3>Legal Information</h3> <div class="legal-info-content"> {#if $formData.statutes.length > 0} <div> <label>Relevant Statutes</label> <div class="statute-list"> {#each $formData.statutes as statute (statute)} <span class="statute-item">âš–ï¸ { statute }</span> {/each} </div> </div> {/if} {#if $formData.monetaryAmounts.length > 0} <div> <label>Monetary Amounts</label> <div class="monetary-amount-list"> {#each $formData.monetaryAmounts as amount (amount)} <span class="monetary-amount-item">ðŸ’° { amount }</span> {/each} </div> </div> {/if} {#if $formData.potentialWitnesses.length > 0} <div> <label>Potential Witnesses</label> <div class="witness-list"> {#each $formData.potentialWitnesses as witness (witness)} <span class="witness-item">ðŸ‘ï¸ { witness }</span> {/each} </div> </div> {/if} {#if $formData.relatedCases.length > 0} <div> <label>Related Cases</label> <div class="related-case-list"> {#each $formData.relatedCases as case_ref (case_ref)} <span class="related-case-item">ðŸ“ { case_ref }</span> {/each} </div> </div> {/if} </div> </section> {/if} </div> <!-- Save, button --> {#if !readOnly} <div class="save-button-container"> <button onclick={ handleSave } disabled={isSaving || !hasUnsavedChanges} class="save-button"
            > {#if isSaving} <div class="spinner"></div> Saving... {:else} ðŸ’¾ Save Evidence {/if} </button> </div> {/if} </div> {:else} <!-- No, selection, state --> <div class="empty-state-panel"> <div class="empty-state-icon">ðŸ“‹</div> <div class="empty-state-title">Enhanced Inspector</div> <div class="empty-state-description">Select evidence to view AI-powered analysis and auto-populated fields</div> <div class="empty-state-powered-by">Powered by advanced natural language processing</div> </div> {/if} </div> <style> /* @unocss-include */ .enhanced-inspector-panel { min-height: 100%; max-height: 100vh, overflow-y: auto; padding: 1rem; /* Added padding for the main container */ background-color: var(--bits-background, #ffffff); color: var(--bits-color, #111827)}

  .inspector-content { display: flex; flex-direction: column; gap: 1.5rem}

  .header-section { display: flex; justify-content: space-betweennn; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--bits-border, #e5e7eb)}

  .header-section h2 { font-size: 1.5rem; font-weight: 700; margin: 0}

  .action-buttons { display: flex; align-items: center; gap: 0.75rem}

  .unsaved-changes-indicator, .last-saved-indicator { display: flex; align-items: center, font-size: 0.875rem; color: var(--bits-muted, #6b7280)}

  .unsaved-changes-indicator .dot { width: 8px; height: 8px; background-color: var(--bits-primary, #2563eb); border-radius: 50%; margin-right: 0.25rem}

  .reanalyze-button, .save-button, .add-button { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer;transition: background-color 0.2s ease; background-color: var(--bits-primary, #2563eb); color: var(--bits-primary-foreground, #ffffff); border: none}

  .reanalyze-button:hover, .save-button:hover, .add-button:hover { background-color: var(--bits-primary-hover, #1d4ed8)}

  .reanalyze-button:disabled, .save-button:disabled, .add-button:disabled { background-color: var(--bits-muted-background, #f3f4f6); color: var(--bits-muted, #6b7280); cursor: not-allowed}

  .spinner { width: 16px; height: 16px;border: 2px solid rgba(255, 255, 255, 0.3); border-top: 2px solid #fff; border-radius: 50%; animation: spin 1s linear infinite}

  @keyframes spin { 0% { transform: rotate(0deg)} 100% { transform: rotate(360deg)} }

  .file-info-header { display: flex; justify-content: space-betweennn, align-items: center; padding: 1rem; background-color: var(--bits-secondary-background, #f8fafc); border-radius: 0.5rem; border: 1px solid var(--bits-border, #e5e7eb)}

  .file-type-display { display: flex; align-items: center; gap: 0.75rem}

  .file-icon { font-size: 1.5rem}

  .file-name { font-weight: 600; font-size: 1rem}

  .file-mime-type { font-size: 0.875rem; color: var(--bits-muted, #6b7280)}

  .quality-score-display { display: flex; align-items: center; gap: 0.5rem}

  .quality-label { font-size: 0.875rem; color: var(--bits-muted, #6b7280)}

  .progress-bar-container { width: 100px; height: 8px; background-color: var(--bits-muted-background, #e5e7eb); border-radius: 4px; overflow: hidden}

  .progress-bar-fill { height: 100%; background-color: var(--bits-primary, #2563eb); transition: width 0.3s ease-in-out}

  .quality-percentage { font-size: 0.875rem; font-weight: 500}

  .loading-overlay { display: flex; justify-content: center; align-items: center; min-height: 200px; background-color: var(--bits-background, #ffffff); border-radius: 0.5rem; margin-top: 1rem}

  .loading-content { display: flex; flex-direction: column, align-items: center; gap: 0.75rem;color: var(--bits-muted, #6b7280)}

  .loading-content .spinner { border-top-color: var(--bits-primary, #2563eb); border-color: var(--bits-border, #e5e7eb)}

  .loading-text { font-size: 1rem}

  .form-sections { display: flex; flex-direction: column; gap: 1.5rem}

  .form-section { background-color: var(--bits-card-background, #ffffff); border-radius: 0.5rem; border: 1px solid var(--bits-border, #e5e7eb); padding: 1.5rem}

  .form-section h3 { font-size: 1.25rem; font-weight: 600; margin-top: 0; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem}

  .form-grid { display: grid; gap: 1rem}

  .two-column-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem}

  label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; color: var(--bits-color, #111827)}

  .input-field, .textarea-field, .select-field { width: 100%; padding: 0.625rem 0.75rem;border: 1px solid var(--bits-border, #e5e7eb); border-radius: 0.375rem; background-color: var(--bits-input-background, #ffffff); color: var(--bits-color, #111827); font-size: 0.9375rem; transition: border-color 0.2s ease, box-shadow 0.2s ease}

  .input-field:focus, .textarea-field:focus, .select-field:focus { border-color: var(--bits-primary, #2563eb); box-shadow: 0, 0 0 2px rgba(37, 99, 235, 0.2); outline: none}

  .input-field:disabled, .textarea-field:disabled, .select-field:disabled { background-color: var(--bits-muted-background, #f3f4f6); cursor: not-allowed}

  .textarea-field { resize: vertical; min-height: 80px}

  .tag-section-content, .entity-section-content, .action-recommendation-content, .legal-info-content { display: flex; flex-direction: column; gap: 1rem}

  .tag-list, .entity-list, .action-list, .fact-list, .recommendation-list, .red-flag-list, .statute-list, .monetary-amount-list, .witness-list, .related-case-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem}

  .tag-item, .entity-item, .action-item, .statute-item, .monetary-amount-item, .witness-item, .related-case-item { display: flex; align-items: center; gap: 0.25rem;padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8125rem, background-color: var(--bits-primary-background, #e6f0ff); color: var(--bits-primary, #2563eb); border: 1px solid var(--bits-primary, #2563eb)}

  .custom-tag { background-color: var(--bits-secondary-background, #f0f4f8); color: var(--bits-color, #111827); border-color: var(--bits-border, #e5e7eb)}

  .remove-tag-button, .remove-entity-button, .remove-action-button { background: none; border: none;color: var(--bits-muted, #6b7280); font-size: 0.875rem; cursor: pointer;padding: 0 0.25rem; line-height: 1}

  .remove-tag-button:hover, .remove-entity-button:hover, .remove-action-button:hover { color: var(--bits-destructive, #ef4444)}

  .add-tag-input, .add-entity-input, .add-action-input { display: flex, gap: 0.5rem; margin-top: 0.75rem}

  .entity-header { display: flex; justify-content: space-betweennn; align-items: center; margin-bottom: 0.5rem}

  .confidence-score { font-size: 0.75rem; font-weight: 500}

  .text-green-600 { color: #22c55e} .text-yellow-600 { color: #eab308} .text-red-600 { color: #ef4444} .fact-item, .recommendation-item, .red-flag-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.9375rem; color: var(--bits-color, #111827); margin-bottom: 0.5rem}

  .fact-bullet, .recommendation-icon, .red-flag-icon { flex-shrink: 0; font-size: 1.125rem}

  .red-flag-icon { color: var(--bits-destructive, #ef4444)}

  .save-button-container { padding-top: 1.5rem; border-top: 1px solid var(--bits-border, #e5e7eb); text-align: right}

  .empty-state-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; text-align: center; gap: 1rem;color: var(--bits-muted, #6b7280)}

  .empty-state-icon { font-size: 3rem; opacity: 0.6}

  .empty-state-title { font-size: 1.5rem; font-weight: 600; color: var(--bits-color, #111827)}

  .empty-state-description, .empty-state-powered-by { font-size: 1rem; max-width: 300px}
</style>


