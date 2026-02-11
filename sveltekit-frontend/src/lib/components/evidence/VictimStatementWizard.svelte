<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import Button from '$lib/components/ui/button';
 import type { Dialog, DialogContent,
 DialogDescription, DialogHeader, DialogTitle, } from '$lib/components/ui/dialog';
 import Input from '$lib/components/ui/input';
 import Progress from '$lib/components/ui/progress';
 import Textarea from '$lib/components/ui/textarea';

 type Statement = {
 victimName: string;
	victimContact: string;
 incidentDate: string;
	incidentLocation: string;
 incidentDescription: string;
	emotionalImpact: string;
 physicalImpact: string;
	financialImpact: string;
 linkedEvidence: string[];
	additionalNotes: string;
 };

 type Props = {
 open: boolean;
	caseId: string;
 onSave: (data: {
	statement: Statement }) => void;
 onCancel: () => void;
 };

 let {
 open = $bindable(false),
 caseId: onSave,
 onCancel
 } = $props<Props>();

 type WizardStep = 'basic-info' | 'incident-details' | 'impact-assessment' | 'evidence-links' | 'review';

 let currentStep = $state<WizardStep>('basic-info');
 let stepProgress = $state(0);

 // Form data
 let statement = $state<Statement>({
 victimName: '',
 victimContact: '',
 incidentDate: '',
 incidentLocation: '',
 incidentDescription: '',
 emotionalImpact: '',
 physicalImpact: '',
 financialImpact: '',
 linkedEvidence: [],
 additionalNotes: '',
 });

 let aiSuggestions = $state('');
 let isGeneratingSuggestions = $state(false);

 const steps: {
	id: WizardStep, title: string;
	description: string }[] = [
 { id: 'basic-info', title: 'Basic Information', description: 'Victim details and contact information' },
	{ id: 'incident-details', title: 'Incident Details', description: 'What happened, when, and where' },
	{ id: 'impact-assessment', title: 'Impact Assessment', description: 'Effects on the victim' },
	{ id: 'evidence-links', title: 'Evidence Links', description: 'Connect to existing evidence' },
	{ id: 'review', title: 'Review & Submit', description: 'Review and finalize the statement' }];

 function getCurrentStepIndex(): number {
 return steps.findIndex(step => step.id === currentStep);
 }

 function nextStep() {
 const currentIndex = getCurrentStepIndex();
 if (currentIndex < steps.length - 1) {
 currentStep = steps[currentIndex + 1].id;
 updateProgress();
 }
 }

 function prevStep() {
 const currentIndex = getCurrentStepIndex();
 if (currentIndex > 0) {
 currentStep = steps[currentIndex - 1].id;
 updateProgress();
 }
 }

 function updateProgress() {
 const currentIndex = getCurrentStepIndex();
 stepProgress = ((currentIndex + 1) / steps.length) * 100;
 }

 async function generateAISuggestions() {
 isGeneratingSuggestions = true;
 try {
 const response = await fetch('/api/victim-statement/ai/suggestions', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ statement, caseId }),
 });

 const result = await response.json();
 aiSuggestions = result.suggestions;
 } catch (error) {
 console.error('Failed to generate AI suggestions:', error);
 aiSuggestions = 'Unable to generate suggestions at this time.';
 } finally {
 isGeneratingSuggestions = false;
 }
 }

 function saveStatement() {
 onSave({ statement });
 resetWizard();
 }

 function resetWizard() {
 currentStep = 'basic-info';
 stepProgress = 0;
 statement = {
 victimName: '',
 victimContact: '',
 incidentDate: '',
 incidentLocation: '',
 incidentDescription: '',
 emotionalImpact: '',
 physicalImpact: '',
 financialImpact: '',
 linkedEvidence: [],
 additionalNotes: '',
 };
 aiSuggestions = '';
 }

 function cancelWizard() {
 resetWizard();
 onCancel();
 }

 // Reactive progress update
 $effect(() => {() => {
 updateProgress();
 });
</script>

<Dialog bind:open onopenChange={(e) => !e.detail && cancelWizard()}>
 <DialogContent class="victim-wizard-dialog">
 <DialogHeader>
 <DialogTitle>Victim Statement Wizard</DialogTitle>
 <DialogDescription>
 Guided collection of victim statements with AI assistance
 </DialogDescription>
 </DialogHeader>

 <!-- Progress Bar -->
 <div class="wizard-progress">
 <Progress bind:value={stepProgress} class="progress-bar" />
 <div class="step-indicators">
 {#each steps as step, index}
 <div
 class="step-indicator"
 class:active={step.id === currentStep} class:completed={getCurrentStepIndex() > index}
 >
 <span class="step-number">{index + 1}</span>
 <span class="step-title">{step.title}</span>
 </div>
 {/each}
 </div>
 </div>

 <!-- Step Content -->
 <div class="wizard-content">
 {#if currentStep === 'basic-info'}
 <div class="step-content">
 <h3>Basic Information</h3>
 <div class="form-group">
 <label for="victimName">Victim Name:</label>
 <Input
 id="victimName"
 value={statement.victimName}
 oninput={(e) => statement.victimName = e.target.value}
 placeholder="Full name of the victim"
 />
 <div class="form-group">
 <label for="victimContact">Contact Information:</label>
 <Input
 id="victimContact"
 value={statement.victimContact}
 oninput={(e) => statement.victimContact = e.target.value}
 placeholder="Phone, email, or address"
 />
 </div>
 </div>
 </div>
 {/if}

 {#if currentStep === 'incident-details'}
 <div class="form-group">
 <label for="incidentDate">Date of Incident:</label>
 <Input
 id="incidentDate"
 type="date"
 value={statement.incidentDate}
 oninput={(e) => statement.incidentDate = e.target.value}
 />
 <div class="form-group">
 <label for="incidentLocation">Location:</label>
 <Input
 id="incidentLocation"
 value={statement.incidentLocation}
 oninput={(e) => statement.incidentLocation = e.target.value}
 placeholder="Where did the incident occur?"
 />
 <div class="form-group">
 <label for="incidentDescription">Description:</label>
 <Textarea
 value={statement.incidentDescription}
 oninput={(e) => statement.incidentDescription = e.target.value}
 placeholder="Detailed description of what happened"
 rows={ 6 }
 />
 </div>nd:value={statement.incidentDescription}
 placeholder="Detailed description of what happened"
 rows={ 6 }
 />
 </div>
 <Button class="bits-btn"
 onclick={ generateAISuggestions }
 disabled={isGeneratingSuggestions}
 variant="outline"
 size="sm"
 >
 {#if isGeneratingSuggestions}
 Generating...
 {:else}
 Get AI Suggestions
 {/if}
 </Button>
 {#if aiSuggestions}
 <div class="ai-suggestions">
 <h4>AI Suggestions:</h4>
 <p>{aiSuggestions}</p>
 </div>
 {/if}
 </div>
 <div class="form-group">
 <label for="emotionalImpact">Emotional Impact:</label>
 <Textarea
 value={statement.emotionalImpact}
 oninput={(e) => statement.emotionalImpact = e.target.value}
 placeholder="How has this affected you emotionally?"
 rows={ 4 }
 />
 <div class="form-group">
 <label for="physicalImpact">Physical Impact:</label>
 <Textarea
 value={statement.physicalImpact}
 oninput={(e) => statement.physicalImpact = e.target.value}
 placeholder="Any physical effects or injuries?"
 rows={4}
 />
 <div class="form-group">
 <label for="financialImpact">Financial Impact:</label>
 <Textarea
 value={statement.financialImpact}
 oninput={(e) => statement.financialImpact = e.target.value}
 placeholder="Any financial losses or costs incurred?"
 rows={4}
 />
 </div>lass="form-group">
 <label for="financialImpact">Financial Impact:</label>
 <textarea
 bind:value={statement.financialImpact}
 placeholder="Any financial losses or costs incurred?"
 rows={4}
 ></textarea>
 </div>
 </div>
 {/if}

 {#if currentStep === 'evidence-links'}
 <div class="step-content">
 <h3>Evidence Links</h3>
 <p>Link this statement to existing evidence in the case:</p>
 <!-- TODO, Add evidence selection component -->
 <div class="evidence-links-placeholder">
 Evidence selection component will be implemented here
 </div>
 </div>
 {/if}

 {#if currentStep === 'review'}
 <div class="step-content">
 <h3>Review Statement</h3>
 <div class="review-summary">
 <div class="review-section">
 <h4>Victim Information</h4>
 <p><strong>Name:</strong> {statement.victimName}</p>
 <p><strong>Contact:</strong> {statement.victimContact}</p>
 </div>
 <div class="review-section">
 <h4>Incident Details</h4>
 <p><strong>Date:</strong> {statement.incidentDate}</p>
 <p><strong>Location:</strong> {statement.incidentLocation}</p>
 <p><strong>Description:</strong> {statement.incidentDescription}</p>
 </div>
 <div class="review-section">
 <h4>Impact Assessment</h4>
 <p><strong>Emotional:</strong> {statement.emotionalImpact}</p>
 <p><strong>Physical:</strong> {statement.physicalImpact}</p>
 <p><strong>Financial:</strong> {statement.financialImpact}</p>
 </div>
 </div>
 </div>
 {/if}
 </div>

 <!-- Navigation -->
 <div class="wizard-navigation">
 <Button class="bits-btn"
 variant="outline"
 onclick={prevStep}
 disabled={getCurrentStepIndex() === 0}
 >
 Previous
 </Button>

 {#if currentStep !== 'review'}
 <Button class="bits-btn" onclick={nextStep}>
 Next
 </Button>
 {:else}
 <Button class="bits-btn" onclick={ saveStatement }>
 Save Statement
 </Button>
 {/if}
 </div>
 </DialogContent>
</Dialog>

<style>
 .victim-wizard-dialog {
 max-width: 700px;
 max-height: 90vh;
 overflow-y: auto;
 }

 .wizard-progress {
 margin-bottom: 2rem;
 }

 .progress-bar {
 margin-bottom: 1rem;
 }

 .step-indicators {
 display: flex;
 justify-content: space-between;
	gap: 0.5rem;
 }

 .step-indicator {
 display: flex;
 flex-direction: column;
 align-items: center;
	flex: 1;
 padding: 0.5rem;
 border-radius: 4px;
	background: #f3f4f6;
 transition:all 0.2s ease;
 }

 .step-indicator.active {
 background: #3b82f6;
	color: white;
 }

 .step-indicator.completed {
 background: #10b981;
	color: white;
 }

 .step-number {
 font-size: 0.8rem;
 font-weight: bold;
 margin-bottom: 0.25rem;
 }

 .step-title {
 font-size: 0.7rem;
 text-align: center;
 }

 .wizard-content {
 min-height: 300px;
 }

 .step-content {
 padding: 1rem 0;
 }

 .step-content h3 {
 margin: 0 0 1.5rem 0;
 color: #374151;
 font-size: 1.2rem;
 }

 .form-group {
 margin-bottom: 1.5rem;
 }

 .form-group label {
 display: block;
 margin-bottom: 0.5rem;
 font-weight: 600;
	color: #374151;
 }

 .ai-suggestions {
 margin-top: 1rem;
	padding: 1rem;
 background: #f0f9ff;
	border: 1px solid #0ea5e9;
 border-radius: 8px;
 }

 .ai-suggestions h4 {
 margin: 0 0 0.5rem 0;
 color: #0c4a6e;
 }

 .ai-suggestions p {
 margin: 0;
	color: #0c4a6e;
 }

 .evidence-links-placeholder {
 padding: 2rem;
 text-align: center;
	background: #f9fafb;
 border: 2px dashed #d1d5db;
 border-radius: 8px;
	color: #6b7280;
 }

 .review-summary {
 display: flex;
 flex-direction: column;
	gap: 1.5rem;
 }

 .review-section {
 padding: 1rem;
	background: #f9fafb;
 border-radius: 8px;
	border: 1px solid #e5e7eb;
 }

 .review-section h4 {
 margin: 0 0 1rem 0;
 color: #374151;
 }

 .review-section p {
 margin: 0.5rem 0;
 color: #6b7280;
 }

 .wizard-navigation {
 display: flex;
 justify-content: space-between;
 margin-top: 2rem;
 padding-top: 1rem;
 border-top: 1px solid #e5e7eb;
 }
</style>




