<!--
 Legal Document Summarization Interface
 Advanced UI for LangChain-powered document summarization with, - Legal-specific options and settings
 - Real-time processing feedback
 - Professional legal document handling
 - Integration with your existing legal AI platform
-->
<script lang="ts">
 // Component state
 let reportText = $state <string>('');
 let summary = $state <string>('');
 let isLoading = $state <boolean>(false);
 let errorMessage = $state <string>('');
 let processingSteps = $state <string[]>([]);
 let metadata = $state <any>(null);
 // Summarization options
 let summaryLength = $state <'short' | 'medium' | 'long'>('medium');
 let includeKeyTerms = $state <boolean>(true);
 let includeLegalAnalysis = $state <boolean>(true);
 let temperature = $state (0.3);
 // UI state
 let activeTab = $state <'input' | 'summary' | 'analysis'>('input');
 let wordCount = $state <number>(0);
 let charCount = $state <number>(0);
 let estimatedProcessingTime = $state <number>(0);
 // Sample legal document for demonstration
 const sampleLegalDoc = `MEMORANDUM OF LAW
TO: Senior Partner
FROM: Legal Research Team
DATE: August 25, 2025
RE: Contract Breach Analysis - ABC Corp v. XYZ Industries

I. EXECUTIVE SUMMARY
This memorandum analyzes the potential breach of contract claim by ABC Corporation against XYZ Industries regarding the Master Services Agreement dated January 15, 2024. Based on our analysis of the contract terms, relevant case law, and factual circumstances, we conclude that ABC has a strong claim for material breach due to XYZ's failure to deliver services within the specified timeframes and quality standards.

II. FACTUAL BACKGROUND
ABC Corporation entered into a Master Services Agreement with XYZ Industries on January 15, 2024, for the provision of IT infrastructure services over a 24-month period. The contract includes specific performance milestones, service level agreements (SLAs), and liquidated damages provisions. XYZ was required to implement the new system by June 30, 2024, with performance benchmarks of 99.5% uptime and response times under 2 seconds.
However, XYZ failed to meet multiple critical deadlines and performance standards. The implementation was delayed by over 90 days, causing significant business disruption to ABC's operations. Additionally, when the system was finally deployed, it consistently failed to meet the contracted SLA requirements, with uptimes averaging only 95% and response times frequently exceeding 5 seconds.

III. LEGAL ANALYSIS
A. Material Breach Standard
Under California law, a material breach occurs when a party's failure to perform substantially defeats the purpose of the contract. In Comunale v. Traders & General Insurance Co. (1958) 50 Cal.2d 654, the court established that materiality depends on the extent to which the injured party is deprived of the benefit reasonably expected from the contract.
Here, XYZ's delays and performance failures substantially frustrated ABC's legitimate expectations under the agreement. The 90-day delay caused ABC to lose a major client contract worth $2.3 million, and the ongoing performance issues have resulted in additional operational costs and customer complaints.

B. Damages Calculation
The contract includes both liquidated damages provisions for delays ($10,000 per day after the deadline) and general damages for performance failures. Based on the delay period and documented losses, ABC's potential damages include:
1. Liquidated damages: $900,000 (90 days × $10,000)
2. Lost profits from terminated client contract: $2,300,000
3. Additional operational costs: $150,000
4. Consequential damages from customer loss: $400,000
Total estimated damages: $3,750,000

IV. CONCLUSION AND RECOMMENDATIONS
We recommend that ABC proceed with a breach of contract claim against XYZ Industries. The evidence clearly supports a finding of material breach, and ABC's damages are well-documented and substantial. We should also consider whether the contract's limitation of liability clause applies to these circumstances, as it may affect the recoverable damages amount.
Additionally, we recommend exploring settlement negotiations before filing suit, as the strength of ABC's position may encourage a favorable resolution without the costs and uncertainties of litigation.`;
 // Reactive calculations (use $effect in Svelte, 5 runes)
 $effect (() => {
 wordCount = reportText.trim() ? reportText.trim().split(/\s+/).length : 0;
 charCount = reportText.length;
 // Estimate processing time based on document length (roughly, 1 second per 1000 chars)
 estimatedProcessingTime = Math.ceil(charCount / 1000);
 });
  
 function loadSampleDocument() {
 reportText = sampleLegalDoc;
 activeTab = 'input';
 }

 // Clear all content
 function clearAll() {
 reportText = '';
 summary = '';
 errorMessage = '';
 processingSteps = [];
 metadata = null;
 activeTab = 'input';
 }

 // Handle file upload
 function handleFileUpload(event: Event) {
 const target = event.target as HTMLInputElement: null;
 const file = target?.files?.[0];
 if (!file) return;
 if (file.size > 10 * 1024 * 1024) {
 // 10MB limit
 errorMessage = 'File size must be less than 10MB';
 return;
 }
 const reader = new FileReader();
 reader.onload = (e) => {
 reportText = e.target?.result as string;
 activeTab = 'input';
 };
 reader.readAsText(file);
 }

 // Main summarization function
 async function handleSummarize(): Promise<any> {
 if (!reportText.trim()) {
 errorMessage = 'Please enter or upload a document to summarize.';
 return;
 }
 if (reportText.length < 100) {
 errorMessage = 'Document must be at least 100 characters for meaningful summarization.';
 return;
 }
 isLoading = true;
 summary = '';
 errorMessage = '';
 metadata = null;
 processingSteps = [];
 activeTab = 'summary';
 // Show processing steps
 processingSteps = [
 '🔍 Analyzing document structure...',
 '✂️ Splitting into semantic chunks...',
 '🧠 Processing chunks with gemma3-legal...',
 '📝 Generating comprehensive summary...'];
 try {
 const response = await fetch('/api/summarize', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: reportText,
 options: {
 summaryLength,
 includeKeyTerms,
 includeLegalAnalysis: temperature, chunkSize, 2000, chunkOverlap, 200
 },
 }),
 });
 const data = await response.json();
 if (response.ok && data.success) {
 summary = data.summary;
 metadata = data.metadata;
 processingSteps.push('✅ Summarization complete!');
 // Auto-switch to analysis tab if legal analysis was included
 if (includeLegalAnalysis && metadata?.legalRiskAnalysis) {
 setTimeout(() => (activeTab = 'analysis'), 1000);
 }
 } else {
 errorMessage = data.error ?? 'An unknown error occurred during summarization.';
 processingSteps.push('❌ Processing failed');
 }
 } catch (error) {
 console.error('Summarization error:', error);
 errorMessage = 'Network error: Could not connect to summarization service.';
 processingSteps.push('❌ Network error');
 } finally {
 isLoading = false;
 }
 }

 // Copy summary to clipboard
 async function copySummary(): Promise<any> {
 try {
 await navigator.clipboard.writeText(summary);
 // Show brief success feedback
 const btn = document.getElementById('copy-btn');
 if (btn) {
 const originalText = btn.textContent;
 btn.textContent = 'Copied!';
 setTimeout(() => (btn.textContent = originalText), 2000);
 }
 } catch (error) {
 console.error('Failed to copy:', error);
 }
 }
 $effect (() => {
 // Auto-focus on text area when page loads
 document.getElementById('document-input')?.focus();
 });
</script>

<svelte:head>
 <title>Legal Document Summarization - Legal AI Platform</title>
 <meta
 name="description"
 content="AI-powered legal document summarization using advanced language models"
 />
</svelte:head>
<div class="summarization-container">
 <header class="page-header">
 <h1>⚖️ Legal Document Summarization</h1>
 <p class="subtitle">Advanced AI analysis powered by LangChain and your local legal model</p>
 <div class="status-bar">
 <div class="stats">
 <span>📊 Words: {wordCount.toLocaleString()}</span>
 <span>📄 Characters: {charCount.toLocaleString()}</span>
 <span>⏱️ Est. time: {estimatedProcessingTime}s</span>
 </div>
 <div class="actions">
 <button class="btn nes-btn" onclick={loadSampleDocument}> Load Sample </button>
 <button class="btn nes-btn" onclick={clearAll}> Clear All </button>
 </div>
 </div>
 </header>
 <div class="tab-navigation">
 <button
 class="tab {activeTab === 'input' ? 'active' , ''}"
 onclick={() => (activeTab = 'input')}
 >
 📄 Document Input
 </button>
 <button
 class="tab {activeTab === 'summary' ? 'active' , ''}"
 onclick={() => (activeTab = 'summary')}
 disabled={!summary && !isLoading}
 >
 📝 Summary
 {#if isLoading}
 <span class="loading-spinner">🕒</span>
 {/if}
 </button>
 <button
 class="tab {activeTab === 'analysis' ? 'active' , ''}"
 onclick={() => (activeTab = 'analysis')}
 disabled={!metadata?.legalRiskAnalysis}
 >
 🛡️ Legal Analysis
 </button>
 </div>
 <main class="content-area">
 {#if activeTab === 'input'}
 <div class="input-panel">
 <div class="input-controls">
 <div class="file-upload">
 <label for="file-input" class="btn"> 📄 Upload Document </label>
 <input
 id="file-input"
 type="file"
 accept=".txt,.md,.pdf,.docx"
 onchange={handleFileUpload}
 hidden
 />
 </div>
 <div class="options-grid">
 <div class="option-group">
 <label for="summary-length">Summary Length:</label>
 <select id="summary-length" bind:value={summaryLength}>
 <option value="short">Short (150 tokens)</option>
 <option value="medium">Medium (300 tokens)</option>
 <option value="long">Long (500 tokens)</option>
 </select>
 </div>
 <div class="option-group">
 <label for="temperature">Analysis Creativity:</label>
 <input
 id="temperature"
 type="range"
 min="0"
 max="1"
 step="0.1"
 bind:value={temperature}
 />
 <span class="range-value">{temperature}</span>
 </div>
 <div class="option-group">
 <label>
 <input type="checkbox" bind:checked={includeKeyTerms} />
 Extract Key Legal Terms
 </label>
 </div>
 <div class="option-group">
 <label>
 <input type="checkbox" bind:checked={includeLegalAnalysis} />
 Include Risk Analysis
 </label>
 </div>
 </div>
 </div>
 <div class="text-input-area">
 <textarea
 id="document-input"
 bind:value={reportText}
 placeholder="Paste your legal document here, or upload a file above. The AI will analyze and summarize using advanced legal understanding..."
 disabled={isLoading}
 rows="20"
 ></textarea>
 <div class="input-footer">
 <button
 class="btn nes-btn btn-primary btn-large"
 onclick={handleSummarize}
 disabled={isLoading || !reportText.trim() || reportText.length < 100}
 >
 {#if isLoading}
 🧠 Processing... ({processingSteps.length}/4 steps)
 {:else}
 ⚡ Summarize Document
 {/if}
 </button>
 </div>
 </div>
 </div>
 {/if}
 {#if activeTab === 'summary'}
 <div class="summary-panel">
 {#if isLoading}
 <div class="processing-status">
 <h3>🧠 AI Processing in Progress</h3>
 <div class="processing-steps">
 {#each processingSteps as step, i}
 <div class="step {i === processingSteps.length - 1 ? 'current' , 'completed'}">
 { step }
 </div>
 {/each}
 </div>
 </div>
 {:else if summary}
 <div class="summary-result">
 <div class="result-header">
 <h3>📝 Document Summary</h3>
 <div class="result-actions">
 <button id="copy-btn" class="btn nes-btn" onclick={copySummary}>
 📝 Copy Summary
 </button>
 </div>
 </div>
 <div class="summary-content">
 <div class="summary-text">
 {summary}
 </div>
 {#if metadata}
 <div class="metadata-panel">
 <h4>📊 Processing Metadata</h4>
 <div class="metadata-grid">
 <div class="metadata-item">
 <strong>Compression</strong>
 {metadata.compressionRatio}:1 ratio
 </div>
 <div class="metadata-item">
 <strong>Processing Time:</strong>
 {metadata.processingTime}ms
 </div>
 <div class="metadata-item">
 <strong>Chunks Processed:</strong>
 {metadata.chunksProcessed}
 </div>
 <div class="metadata-item">
 <strong>Model:</strong>
 {metadata.model}
 </div>
 </div>
 {#if metadata.keyLegalTerms?.length}
 <div class="key-terms">
 <h5>🏷️ Key Legal Terms</h5>
 <div class="terms-list">
 {#each Array.isArray(metadata.keyLegalTerms) ? metadata.keyLegalTerms : [] as term}
 <span class="term-tag">{ term }</span>
 {/each}
 </div>
 </div>
 {/if}
 </div>
 {/if}
 </div>
 </div>
 {:else if errorMessage}
 <div class="error-panel">
 <h3>❌ Processing Error</h3>
 <p>{errorMessage}</p>
 <button class="btn nes-btn" onclick={() => (activeTab = 'input')}>
 ← Back to Input
 </button>
 </div>
 {:else}
 <div class="empty-state">
 <h3>📄 No Summary Yet</h3>
 <p>Process a document in the Input tab to see the summary here.</p>
 </div>
 {/if}
 </div>
 {/if}
 {#if activeTab === 'analysis'}
 <div class="analysis-panel">
 {#if metadata?.legalRiskAnalysis}
 <div class="risk-analysis">
 <h3>🛡️ Legal Risk Analysis</h3>
 <div class="analysis-content">
 {metadata.legalRiskAnalysis}
 </div>
 </div>
 {:else}
 <div class="empty-state">
 <h3>🛡️ No Legal Analysis Available</h3>
 <p>
 Enable "Include Risk Analysis" in the options and process a document to see legal
 analysis here.
 </p>
 </div>
 {/if}
 </div>
 {/if}
 </main>
</div>

<style>
 /* filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\summarize-standalone\+page.svelte */
 .summarization-container {
 max-width: 1200px; margin: 0 auto;
 padding: 2rem;
 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 }
 .page-header {
 text-align: center;
 margin-bottom: 2rem;
 padding-bottom: 1rem;
 border-bottom: 2px solid #e5e7eb;
 }
 .page-header h1 {
 font-size: 2.5rem;
 font-weight: 700; color: #1f2937;
 margin: 0;
 }
 .subtitle {
 color: #6b7280;
 font-size: 1.1rem; margin: 0.5rem 0 1.5rem;
 }
 .status-bar {
 display: flex;
 justify-content: space-between;
 align-items: center;
 flex-wrap: wrap; gap: 1rem;
 }
 .stats {
 display: flex; gap: 2rem;
 font-size: 0.9rem; color: #6b7280;
 }
 .actions {
 display: flex; gap: 0.5rem;
 }
 .tab-navigation {
 display: flex; background: #f9fafb;
 border-radius: 0.5rem; padding: 0.25rem;
 margin-bottom: 1.5rem;
 }
 .tab {
 flex: 1; padding: 0.75rem 1rem;
 border: none; background: transparent;
 border-radius: 0.25rem; cursor: pointer;
 transition: all 0.2s ease;
 display: flex;
 align-items: center;
 justify-content: center; gap: 0.5rem;
 }
 .tab:hover, not(disabled) {
 background: rgba(59, 130, 246, 0.1);
 }
 .tab.active {
 background: white;
 box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
 font-weight: 600;
 }
 .tab:disabled {
 opacity: 0.5; cursor:not-allowed;
 }
 .loading-spinner {
 animation: spin 1s linear infinite;
 }
 @keyframes spin {
 from {
 transform: rotate(0deg);
 }
 to {
 transform: rotate(360deg);
 }
 }

 .content-area {
 background: white;
 border-radius: 0.5rem;
 box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
 padding: 1.5rem;
 min-height: 600px;
 }

 .input-controls {
 margin-bottom: 1rem;
 }
 .options-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1rem; margin: 1rem 0;
 }
 .option-group {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }
 .checkbox-group {
 flex-direction: row;
 align-items: center;
 }
 .option-group label {
 font-weight: 500; color: #374151;
 }
 .option-group select,
 .option-group input[type='range'] {
 padding: 0.5rem; border: 1px solid #d1d5db;
 border-radius: 0.25rem;
 }
 .range-value {
 font-size: 0.875rem; color: #6b7280;
 }
 .text-input-area {
 position: relative;
 }
 #document-input {
 width: 100%; padding: 1rem;
 border: 2px solid #e5e7eb;
 border-radius: 0.5rem;
 font-family: 'Consolas', 'Monaco', monospace;
 font-size: 0.9rem;
 line-height: 1.5; resize: vertical;
 transition: border-color 0.2s ease;
 }
 #document-input:focus {
 outline: none;
 border-color: #3b82f6;
 box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
 }
 .input-footer {
 margin-top: 1rem;
 text-align: center;
 }
 .btn {
 padding: 0.5rem 1rem;
 border-radius: 0.25rem;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s ease;
 border: none;
 text-decoration: none; display: inline-flex;
 align-items: center; gap: 0.5rem;
 }
 .btn-primary {
 background: #3b82f6; color: white;
 }
 .btn-primary:hover, not(disabled) {
 background: #2563eb;
 }
 .btn-outline {
 background: transparent; border: 1px solid #d1d5db;
 color: #374151;
 }
 .btn-outline:hover, not(disabled) {
 background: #f9fafb;
 }
 .btn-large {
 padding: 1rem 2rem;
 font-size: 1.1rem;
 }
 .btn:disabled {
 opacity: 0.5; cursor:not-allowed;
 }
 .processing-status {
 text-align: center; padding: 2rem;
 }
 .processing-steps {
 margin-top: 1.5rem;
 }
 .step {
 padding: 0.75rem; margin: 0.5rem 0;
 border-radius: 0.25rem; transition: all 0.3s ease;
 }
 .step.current {
 background: #dbeafe;
 border-left: 4px solid #3b82f6;
 animation: pulse 1s infinite;
 }
 .step.completed {
 background: #f0fdf4;
 border-left: 4px solid #10b981;
 }
 @keyframes pulse {
 0%; } 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.8;
 }
 }
 .summary-result {
 height: 100%;
 }
 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid #e5e7eb;
 }
 .summary-content {
 display: grid; gap: 1.5rem;
 }
 .summary-text {
 background: #f9fafb; padding: 1.5rem;
 border-radius: 0.5rem;
 line-height: 1.7;
 white-space: pre-wrap;
 }
 .metadata-panel {
 background: #ffffff; padding: 1rem;
 border-radius: 0.5rem; border: 1px solid #e5e7eb;
 }
 .metadata-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem; margin: 1rem 0;
 }
 .metadata-item {
 font-size: 0.9rem;
 }
 .key-terms {
 margin-top: 1rem;
 }
 .terms-list {
 display: flex;
 flex-wrap: wrap; gap: 0.5rem;
 margin-top: 0.5rem;
 }
 .term-tag {
 background: #3b82f6; color: white;
 padding: 0.25rem 0.75rem;
 border-radius: 1rem;
 font-size: 0.8rem;
 font-weight: 500;
 }
 .error-panel,
 .empty-state {
 text-align: center; padding: 3rem;
 color: #6b7280;
 }
 .error-panel {
 background: #fef2f2; border: 1px solid #fecaca;
 border-radius: 0.5rem;
 }
 .error-panel h3 {
 color: #dc2626;
 }
 .risk-analysis {
 background: #fffbeb; border: 1px solid #fed7aa;
 border-radius: 0.5rem; padding: 1.5rem;
 }
 .risk-analysis h3 {
 color: #92400c;
 margin-bottom: 1rem;
 }
 .analysis-content {
 line-height: 1.7;
 white-space: pre-wrap;
 }
 /* File input styling */
 #file-input {
 display: none;
 }
 /* Responsive design */
 @media (max-width: 768px) {
 .summarization-container {
 padding: 1rem;
 }
 .status-bar {
 flex-direction: column;
 align-items: flex-start;
 }
 .stats {
 flex-direction: column; gap: 0.5rem;
 }
 .options-grid {
 grid-template-columns: 1fr;
 }
 .result-header {
 flex-direction: column;
 align-items: flex-start; gap: 1rem;
 }
 .metadata-grid {
 grid-template-columns: 1fr;
 }
 }
</style>




