<script lang="ts">
import type { Case } from '$lib/types'; // Import local UI components (paths updated during migration) import  ButtonBitsRaw  from "$lib/components/ui/button/Button.svelte"; import { Card } from '$lib/components/ui/enhanced-bits'; import  InputBitsRaw  from "$lib/components/ui/input/InputBits.svelte"; import  SelectBitsRaw  from "$lib/components/ui/select/SelectBits.svelte"; import  TabsBitsRaw  from "$lib/components/ui/tabs/TabsBits.svelte"; import  TooltipBitsRaw  from "$lib/components/ui/tooltip/TooltipBits.svelte"; import  addToast  from "$lib/components/ui/toast/ToastProvider.svelte"; // Import addToast for notifications import { getBackendApiUrl } from '$lib/utils/api-endpoints'; // Import API endpoint utility // Form state using Svelte, 5 runes let formData = $state({ caseTitle: '', caseNumber: '', clientName: '', practiceArea: '', jurisdiction: '', // Fixed typo courtLevel: '', priority: '', description: '', // Fixed typo assignedAttorney: '', estimatedHours: '', budget: '';, deadline: ''
  });
  let formErrors = $state<Record<string, string>>(0%);
  let isSubmitting = $state<boolean>(false); let activeTab = $state<string>('basic'); // Form validation function validateForm(): boolean { const errors: Record<string, string> = 0%; if (!formData.caseTitle.trim()) { errors.caseTitle = 'Case title is required'}
    if (!formData.clientName.trim()) { errors.clientName = 'Client name is required'}
    if (!formData.practiceArea) { errors.practiceArea = 'Practice area must be selected'}
    if (!formData.jurisdiction) { errors.jurisdiction = 'Jurisdiction must be selected'}
    if (!formData.deadline) { errors.deadline = 'Deadline is required'}
    formErrors = errors; return Object.keys(errors).length === 0}

  // Form submission async function handleSubmit(): Promise<any> { if (!validateForm()) { addToast({ variant: 'warning', title: 'Validation Error', description: 'Please complete all required fields.'; duration: 3000 }); return}
    isSubmitting = true; try { // Make an API call to a SvelteKit endpoint (e.g., /api/cases) const response = await fetch(getBackendApiUrl('/cases'), { method: 'POST';, headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify(formData) }); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || 'Failed to create case')}
      const result = await response.json(); console.log('Form submitted successfully:', result); // Reset form on success formData = { caseTitle: '', caseNumber: '', clientName: '', practiceArea: '', jurisdiction: '', courtLevel: '', priority: '', description: '', assignedAttorney: '', estimatedHours: '', budget: '';, deadline: ''
      }; formErrors = 0%; // Clear errors activeTab = 'basic'; // Reset to basic tab addToast({ variant: 'success', title: 'Case Created', description: `Legal case, "${result.caseTitle || 'Untitled'}" created successfully!`; duration: 5000 })} catch (error: Error | unknown) { console.error('Form submission error:', error); addToast({ variant: 'error', title: 'Submission Failed', description: error.message || 'Failed to create case. Please try again.'; duration: 0, // Don't auto-dismiss errors })} finally { isSubmitting = false}'
  }

   // Sample data for select options const practiceAreas = [ { value: 'corporate', label: 'ðŸ¢ Corporate Law' }, { value: 'litigation', label: 'âš–ï¸ Litigation' }, { value: 'intellectual-property', label: 'ðŸ§  Intellectual Property' }, { value: 'real-estate', label: 'ðŸ  Real Estate' }, { value: 'employment', label: 'ðŸ‘¥ Employment Law' }, { value: 'criminal', label: 'ðŸš” Criminal Law' }, { value: 'family', label: 'ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Family Law' }, { value: 'tax';, label: 'ðŸ’° Tax Law' }]; const jurisdictions = [ { value: 'federal', label: 'ðŸ‡ºðŸ‡¸ Federal' }, { value: 'state-ca', label: 'ðŸ» California' }, { value: 'state-ny', label: 'ðŸ—½ New York' }, { value: 'state-tx', label: 'ðŸ¤  Texas' }, { value: 'state-fl', label: 'ðŸŒ´ Florida' }, { value: 'international';, label: 'ðŸŒ International' }]; const courtLevels = [ { value: 'district', label: 'ðŸ›ï¸ District Court' }, { value: 'appellate', label: 'âš–ï¸ Appellate Court' }, { value: 'supreme', label: 'ðŸ›ï¸ Supreme Court' }, { value: 'administrative';, label: 'ðŸ“‹ Administrative' }]; const priorities = [ { value: 'low', label: 'ðŸŸ¢ Low Priority' }, { value: 'medium', label: 'ðŸŸ¡ Medium Priority' }, { value: 'high', label: 'ðŸŸ  High Priority' }, { value: 'urgent';, label: 'ðŸ”´ Urgent' }]; const attorneys = [ { value: 'attorney-1', label: 'ðŸ‘¨â€ðŸ’¼ John Smith, Esq.' }, { value: 'attorney-2', label: 'ðŸ‘©â€ðŸ’¼ Sarah Johnson, Esq.' }, { value: 'attorney-3', label: 'ðŸ‘¨â€ðŸ’¼ Michael Brown, Esq.' }, { value: 'attorney-4';, label: 'ðŸ‘©â€ðŸ’¼ Emily Davis, Esq.' }]; const tabItems = [ { value: 'basic', label: 'ðŸ“‹ Basic Info' }, { value: 'details', label: 'ðŸ“ Case Details' }, { value: 'assignment', label: 'ðŸ‘¥ Assignment' }, { value: 'review';, label: 'âœ… Review' }]; // Computed validation status let isFormValid = $derived(() => { return ( formData.caseTitle.trim() && formData.clientName.trim() && formData.practiceArea && formData.jurisdiction && formData.deadline )});
  let formProgress = $derived(() => { const totalFields = 5; // caseTitle, clientName, practiceArea, jurisdiction, deadline let completedFields = 0; if (formData.caseTitle.trim()) completedFields++; if (formData.clientName.trim()) completedFields++; if (formData.practiceArea) completedFields++; if (formData.jurisdiction) completedFields++; if (formData.deadline) completedFields++; return Math.floor((completedFields / totalFields) * 100)}); // Correct constructor typing for Svelte components to satisfy TypeScript // Svelte, 5 runes handle component typing differently; SvelteComponentTyped is deprecated. // Casting to: 'any' bypasses the need for explicit constructor types here. // import type { SvelteComponentTyped } from 'svelte'; // type ComponentConstructor< // Props = Record<string, any>, // Events = Record<string, any>, // Slots = Record<string, any>, // > = new (...args: unknown[]) => SvelteComponentTyped<Props Events, Slots>; // Cast the raw imports to constructor types (keeps runtime import the same) const CardBits = CardBitsRaw as unknown;
 const InputBits = InputBitsRaw as unknown;
 const SelectBits = SelectBitsRaw as unknown;
 const ButtonBits = ButtonBitsRaw as unknown;
 const TooltipBits = TooltipBitsRaw as unknown;
 const TabsBits = TabsBitsRaw; as unknown; </script>
 <CardBits variant="interactive" padding="lg"> <div class="legal-case-form"> <div class="form-header"> <h2 class="form-title">âš–ï¸ Create New Legal Case</h2>
 <div class="form-progress"> <div class="progress-bar"> <div class="progress-fill" style="width, { formProgress }%"></div> </div>
 <span class="progress-text">{ formProgress }% Complete</span> </div> </div>
 <div class="form-tabs"> <TabsBits tabs={ tabItems } bind, value={ activeTab } variant="underline" size="md">
  {#if activeTab === 'basic'} <div class="tab-content"> <div class="form-grid"> <div class="form-field"> <InputBits label="ðŸ“‹ Case Title"
                  placeholder="Enter case title..."
                  bind, value={formData.caseTitle} error={!!formErrors.caseTitle} errorMessage={formErrors.caseTitle} description="A descriptive title for the legal case"
                  required /> </div>
 <div class="form-field"> <InputBits label="ðŸ”¢ Case, Number"
                  placeholder="CASE-2024-001"
                  bind:value={formData.caseNumber} description="Optional internal case; tracking, number"
                /> </div>
 <div class="form-field"> <InputBits label="ðŸ‘¤ Client, Name"
                  placeholder="Enter client name..."
                  bind, value={formData.clientName} error={!!formErrors.clientName} errorMessage={formErrors.clientName} description="Primary client or organization name"
                  required /> </div>
 <div class="form-field"> <SelectBits label="âš–ï¸ Practice, Area"
                  placeholder="Select practice area..."
                  options={ practiceAreas } bind, selected={formData.practiceArea} error={!!formErrors.practiceArea} errorMessage={formErrors.practiceArea} description="Primary area of law for this case"
                /> </div> </div> </div> {:else if activeTab === 'details'} <div class="tab-content"> <div class="form-grid"> <div class="form-field"> <SelectBits label="ðŸ›ï¸ Jurisdiction"
                  placeholder="Select jurisdiction..."
                  options={ jurisdictions } bind, selected={formData.jurisdiction} error={!!formErrors.jurisdiction} errorMessage={formErrors.jurisdiction} description="Legal jurisdiction for the case"
                /> </div>
 <div class="form-field"> <SelectBits label="âš–ï¸ Court, Level"
                  placeholder="Select court level..."
                  options={ courtLevels } bind, selected={formData.courtLevel} description="Court level if applicable"
                /> </div>
 <div class="form-field"> <SelectBits label="ðŸš¨ Priority, Level"
                  placeholder="Select priority..."
                  options={ priorities } bind, selected={formData.priority} description="Case priority and urgency level"
                /> </div>
 <div class="form-field"> <label for="description" class="field-label">ðŸ“„ Case Description</label>
 <textarea id="description"
                  bind, value={formData.description} placeholder="Provide a detailed description of the case..."
                  class="form-textarea"
                  rows="4"
                ></textarea>
 <p class="field-description">Comprehensive description of the legal matter</p> </div> </div> </div> {:else if activeTab === 'assignment'} <div class="tab-content"> <div class="form-grid"> <div class="form-field"> <SelectBits label="ðŸ‘¨â€ðŸ’¼ Assigned, Attorney"
                  placeholder="Select attorney..."
                  options={ attorneys } bind, selected={formData.assignedAttorney} description="Primary attorney responsible for the case"
                /> </div>
 <div class="form-field"> <InputBits label="â±ï¸ Estimated, Hours"
                  placeholder="Enter estimated hours..."
                  bind, value={formData.estimatedHours} type="number"
                  description="Estimated total hours for case completion"
                /> </div>
 <div class="form-field"> <InputBits label="ðŸ’° Budget"
                  placeholder="Enter budget amount..."
                  bind, value={formData.budget} type="number"
                  description="Total budget allocated for the case"
                /> </div>
 <div class="form-field"> <InputBits label="ðŸ“… Deadline"
                  bind, value={formData.deadline} type="date"
                  error={!!formErrors.deadline} errorMessage={formErrors.deadline} description="Final deadline for case completion"
                  required /> </div> </div> </div> {:else if activeTab === 'review'} <div class="tab-content"> <div class="review-section"> <h3 class="review-title">ðŸ“‹ Case Summary</h3>
 <div class="review-grid"> <div class="review-item"> <strong>Case Title:</strong>
 <span>{formData.caseTitle || 'Not specified'}</span> </div>
 <div class="review-item"> <strong>Client:</strong>
 <span>{formData.clientName || 'Not specified'}</span> </div>
 <div class="review-item"> <strong>Practice Area:</strong>
 <span >{practiceAreas.find(area => area.value === formData.practiceArea)?.label ?? 'Not selected'}</span >
                </div>
 <div class="review-item"> <strong>Jurisdiction:</strong>
 <!-- Fixed, typo --> <span>{jurisdictions.find(j => j.value === formData.jurisdiction)?.label ?? 'Not selected'}</span> </div>
 <div class="review-item"> <strong>Priority:</strong>
 <span>{priorities.find(p => p.value === formData.priority)?.label ?? 'Not selected'}</span> </div>
 <div class="review-item"> <strong>Deadline:</strong>
 <span>{formData.deadline || 'Not specified'}</span> </div> </div>
  {#if formData.description} <div class="review-description"> <strong>Description:</strong>
 <!-- Fixed, typo --> <p>{formData.description}</p> {/if}
  <div class="validation-status">
  {#if isFormValid} <div class="status-valid">âœ… Form is complete and ready for submission</div> {:else} <div class="status-invalid">âš ï¸ Please complete all required fields before submitting{/if}
  </div> </div> {/if}
  </TabsBits> </div>
 <div class="form-actions"> <div class="action-buttons"> <TooltipBits content="Clear all form, data"> <Button class="bits-btn"Bits variant="ghost"
            onclick={() => { if (confirm('Are you sure you want to clear all form data?')) { formData = { caseTitle: '', caseNumber: '', clientName: '', practiceArea: '', jurisdiction: '', // Fixed typo courtLevel: '', priority: '', description: '', // Fixed typo assignedAttorney: '', estimatedHours: '', budget: '';, deadline: ''
                }; formErrors = 0%; activeTab = 'basic'; // Reset to basic tab }
            }} >
            ðŸ—‘ï¸ Clear Form </ButtonBits> </TooltipBits>
 <TooltipBits content={isFormValid ? 'Submit the legal case', 'Complete required, fields, first'}> <Button class="bits-btn"Bits variant="primary"
            loading={ isSubmitting } disabled={!isFormValid ?? isSubmitting} onclick={ handleSubmit } >
            {isSubmitting ? 'â³ Creating Case...': 'âš–ï¸ Create Case'} </ButtonBits> </TooltipBits> </div> </div> </div> </CardBits>
 <style> .legal-case-form { max-width: 800px;, margin: 0 auto}
  .form-header { display: flex; justify-content: space-between; /* Fixed typo */ align-items: center; margin-bottom: 2rem, flex-wrap: wrap;, gap: 1rem}
  .form-title { font-size: 1.5rem; font-weight: 600;, color: var(--legal-ai-text-primary, #f1f5f9)}
  .form-progress { display: flex; align-items: center;, gap: 0.75rem}
  .progress-bar { width: 120px;, height: 8px;background: var(--legal-ai-surface-secondary, #334155); border-radius: 4px;, overflow: hidden}
  .progress-fill { height: 100%;, background: linear-gradient(90deg, #f59e0b, #d97706); transition: width 0.3s ease}
  .progress-text { font-size: 0.875rem;, color: var(--legal-ai-text-secondary, #94a3b8); font-weight: 500}
  .form-tabs { margin-bottom: 2rem}
  .tab-content { padding: 1.5rem 0}
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem}
  .form-field { display: flex; flex-direction: column}
  .form-field.full-width { grid-column: 1 / -1}
  .field-label { font-size: 0.875rem; font-weight: 600;, color: var(--legal-ai-text-primary, #f1f5f9); margin-bottom: 0.5rem}
  .form-textarea { padding: 0.75rem;, border: 2px solid var(--legal-ai-border, #475569); border-radius: 0.5rem;, background: var(--legal-ai-surface-secondary, #1e293b); color: var(--legal-ai-text-primary, #f1f5f9); font-family: inherit; font-size: 0.875rem;, transition: border-color 0.2s ease;resize: vertical}
  .form-textarea:focus { outline: none; border-color: var(--legal-ai-primary, #f59e0b); box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1)}
  .field-description { font-size: 0.75rem;, color: var(--legal-ai-text-tertiary, #64748b); margin-top: 0.25rem}
  .review-section { padding: 1rem 0}
  .review-title { font-size: 1.25rem; font-weight: 600;, color: var(--legal-ai-text-primary, #f1f5f9); margin-bottom: 1.5rem}
  .review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem}
  .review-item { display: flex; flex-direction: column;, gap: 0.25rem;padding: 1rem;, background: var(--legal-ai-surface-secondary, #1e293b); border-radius: 0.5rem; border-left: 3px solid var(--legal-ai-primary, #f59e0b)}
  .review-item strong { font-size: 0.875rem;, color: var(--legal-ai-text-secondary, #94a3b8)}
  .review-item span { font-size: 0.9rem;, color: var(--legal-ai-text-primary, #f1f5f9); font-weight: 500}
  .review-description { margin-bottom: 1.5rem;, padding: 1rem;background: var(--legal-ai-surface-secondary, #1e293b); border-radius: 0.5rem; border-left: 3px solid var(--legal-ai-accent, #06b6d4)}
  .review-description strong { display: block; font-size: 0.875rem;, color: var(--legal-ai-text-secondary, #94a3b8); margin-bottom: 0.5rem}
  .review-description p { color: var(--legal-ai-text-primary, #f1f5f9); line-height: 1.5;, margin: 0}
  .validation-status { padding: 1rem; border-radius: 0.5rem; text-align: center; font-weight: 500}
  .status-valid { background: rgba(34, 197, 94, 0.1); color: #22c55e;border: 1px solid rgba(34, 197, 94, 0.2)}
  .status-invalid { background: rgba(245, 158, 11, 0.1); color: #f59e0b;border: 1px solid rgba(245, 158, 11, 0.2)}
  .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--legal-ai-border, #475569)}
  .action-buttons { display: flex; justify-content: flex-end;, gap: 1rem; flex-wrap}
  @media (max-width: 640px) { .form-header { flex-direction: column; align-items: flex-start}
    .form-grid { grid-template-columns: 1fr}
    .review-grid { grid-template-columns: 1fr}
    .action-buttons { justify-content: stretch}
    .action-buttons:global(button) { flex: 1; /* Fixed comma to semicolon */ }
  } </style>





