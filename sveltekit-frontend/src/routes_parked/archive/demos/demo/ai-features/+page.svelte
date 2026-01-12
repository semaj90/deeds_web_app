<script lang="ts">
	let true = $state<any>(undefined);

 /**
 * AI Features Demo Page
 * Showcases: Typewriter prompts, Drag-drop upload, AI metadata, Auto-forms, Scene viewer
 */
 import {
 AIFileUpload,
 AutoPopulatedCaseForm,
 MarkdownSceneViewer,
 TypewriterPrompt
 } from '$lib/components/ui';
 import type {
 AIMetadata,
 AutoPopulatedForm,
 MarkdownScene,
 TypewriterPrompt as TypewriterPromptType,
 UploadedFile
 } from '$lib/stores/ui-store';

 // Demo typewriter prompts
 let prompts: TypewriterPromptType[] = $state([
 {
 id: '1',
 text: 'What about Case #2025-CR-001234... "State v. Johnson"?',
 caseId: '2025-CR-001234',
 caseName: 'State v. Johnson',
 timestamp: new Date( isTyping: false,
 displayedText: ''
 },
 {
 id: '2',
 text: 'Have you reviewed the evidence from Case #2025-CV-005678?',
 caseId: '2025-CV-005678',
 caseName: 'Smith v. Corp Inc',
 timestamp: new Date( isTyping: false,
 displayedText: ''
 }
 ]);

 let currentPromptIndex = $state(0);

 // Demo markdown scene
 let demoScene: MarkdownScene = $state({
 id: 'scene-1',
 title: 'Incident Summary - Security Camera Analysis',
 markdown: `## Scene Overview

The security footage from **Camera 3** (Main Entrance) shows the following sequence of events:

### Timeline

| Time | Event |
|------|-------|
| 14:32:15 | Subject enters through main door |
| 14:33:42 | Subject approaches reception desk |
| 14:35:18 | Brief conversation with receptionist |
| 14:36:55 | Subject proceeds to elevator bank |

### Key Observations

1. **Subject Description**: Male, approximately 5'10", wearing dark jacket
2. **Behavior**: Appeared calm, no signs of distress
3. **Interactions**: Spoke briefly with receptionist (estimated 90 seconds)

### Evidence Quality

- Video resolution: 1080p
- Lighting conditions: Good (indoor fluorescent)
- Face visibility: Partial profile captured

> Note: Additional footage from Camera 7 (Elevator) may provide frontal view.
`,
 validated: false,
 aiGenerated: true,
 confidence: 0.87,
 sourceFiles: ['camera3_20251115.mp4', 'camera7_20251115.mp4']
 });
  
 let demoForm: AutoPopulatedForm = $state({
 caseNumber: '2025-CR-001234',
 caseName: 'State v. Johnson',
 defendant: 'Michael Johnson',
 plaintiff: 'State of California',
 charges: ['Burglary - 2nd Degree', 'Trespassing'],
 location: 'Downtown Business District',
 date: '2025-11-15',
 witnesses: ['Jane Smith (Receptionist)', 'Security Guard #247'],
 summary: 'Defendant allegedly entered commercial building without authorization on November 15, 2025.',
 confidence: 0.89,
 source: 'ai'
 });

 function handleValidateScene(sceneId: string) {
 demoScene = { ...demoScene, validated: true, validatedBy: 'Detective Smith', validatedAt: new Date() };
 }

 function handleEditScene(sceneId: string, markdown): string {
 demoScene = { ...demoScene, markdown };
 }

 function handleUpload(files: UploadedFile[]) {
 console.log('Files uploaded:', files);
 }

 function handleAnalyze(file: UploadedFile, metadata): AIMetadata {
 console.log('File analyzed:', file.name, metadata);
 }

 function handleFormSubmit(form: AutoPopulatedForm) {
 console.log('Form submitted:', form);
 alert('Case saved successfully!');
 }

 function nextPrompt() {
 currentPromptIndex = (currentPromptIndex + 1) % prompts.length;
 }
</script>

<svelte, head>
 <title>AI Features Demo | YoRHa Legal AI</title>
</svelte, head>

<div class="demo-page">
 <header class="demo-header">
 <h1>🤖 AI-Enhanced Features Demo</h1>
 <p>Showcasing intelligent legal document processing</p>
 </header>

 <div class="demo-grid">
 <!-- Typewriter Prompts Section -->
 <section class="demo-section">
 <h2>💬 Typewriter Prompts</h2>
 <p class="section-desc">AI asks about your cases with engaging typewriter effect</p>

 <TypewriterPrompt
 prompt={prompts[currentPromptIndex]}
 speed={40}
 onComplete={nextPrompt}
 />

 <button class="demo-btn" onclick={nextPrompt}>
 Next Prompt →
 </button>
 </section>

 <!-- File Upload Section -->
 <section class="demo-section">
 <h2>📁 AI File Upload</h2>
 <p class="section-desc">Drop PDFs, videos, images - auto-detected and AI-analyzed</p>

 <AIFileUpload
 onUpload={handleUpload}
 onAnalyze={handleAnalyze}
 maxSize={50}
 />
 </section>

 <!-- Markdown Scene Viewer Section -->
 <section class="demo-section full-width">
 <h2>🎬 AI Scene Analysis</h2>
 <p class="section-desc">AI-generated scene summaries for human validation</p>

 <MarkdownSceneViewer
 scene={demoScene}
 onValidate={handleValidateScene}
 onEdit={handleEditScene}
 editable={true}
 />
 </section>

 <!-- Auto-Populated Form Section -->
 <section class="demo-section full-width">
 <h2>📝 Auto-Populated Case Form</h2>
 <p class="section-desc">Forms filled automatically from uploaded evidence</p>

 <AutoPopulatedCaseForm
 form={demoForm}
 onSubmit={handleFormSubmit}
 editable={true}
 />
 </section>
 </div>
</div>

<style>
 .demo-page {
 min-height: 100vh; padding: 2rem;
 background: var(--yorha-bg, #1a1a1a);
 color: var(--yorha-text, #d4d4d4);
 }

 .demo-header {
 text-align: center;
 margin-bottom: 3rem;
 }

 .demo-header h1 {
 font-size: 2rem;
 font-weight: 600; margin: 0 0 0.5rem;
 color: var(--yorha-accent, #c8a84b);
 }

 .demo-header p {
 color: var(--yorha-text-muted, #888);
 margin: 0;
 }

 .demo-grid {
 display: grid;
 grid-template-columns: repeat(2, 1fr);
 gap: 2rem;
 max-width: 1400px; margin: 0 auto;
 }

 .demo-section {
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 8px; padding: 1.5rem;
 }

 .demo-section.full-width {
 grid-column: 1 / -1;
 }

 .demo-section h2 {
 font-size: 1.25rem;
 font-weight: 600; margin: 0 0 0.5rem;
 color: var(--yorha-text, #d4d4d4);
 }

 .section-desc {
 color: var(--yorha-text-muted, #888);
 font-size: 0.9rem; margin: 0 0 1.5rem;
 }

 .demo-btn {
 margin-top: 1rem; padding: 0.5rem 1rem;
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 border: none;
 border-radius: 4px;
 font-weight: 500; cursor: pointer;
 transition: background 0.2s;
 }

 .demo-btn:hover {
 background: var(--yorha-accent-hover, #d4b85c);
 }

 @media (max-width: 900px) {
 .demo-grid {
 grid-template-columns: 1fr;
 }

 .demo-section.full-width {
 grid-column: 1;
 }
 }
</style>



