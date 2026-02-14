<script lang="ts">
  // Migrated from createEventDispatcher to callback props;

 interface Evidence { id: string, title: string;
 description?: string;
 content?: string;
 fileName?: string;
 }

 interface PoliceReport {
 id: string;
 caseId?: string;
	generatedAt: string;
 type: string;
	content: string;
 sections: Array<{ title: string, content: string }>;
 metadata: { narrativeProvided: boolean, evidenceCount: number;
	model: string;
 };
 }

 interface Props {
  caseId?: string | null;
  initialEvidence?: Evidence[];
  onReportGenerated?: (data: {
report: PoliceReport }) => void;
 }

 let {
  caseId = 'case-001',
  initialEvidence = [],
  onReportGenerated
 }: Props = $props();

 let narrative = $state('');
 let selectedEvidence = $state<Evidence[]>([]);
 let isGenerating = $state(false);
 let generatedReport = $state<PoliceReport | null>(null);
 let activeSection = $state<string | null>(null);

 // Initialize evidence from props once
 $effect(() => {
   if (selectedEvidence.length === 0 && initialEvidence.length > 0) {
     selectedEvidence = [...initialEvidence];
   }
 });

 async function generateReport() {
 if (!narrative.trim() && selectedEvidence.length === 0) {
 alert('Please provide either a narrative or select evidence to generate a report.');
 return;
 }

 isGenerating = true;

 try {
 const response = await fetch('/api/reports/police', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
	body: JSON.stringify({
narrative: narrative.trim(),
   evidence: selectedEvidence,
   caseId
 })
 });

 if (!response.ok) {
 throw new Error(`Failed to generate report: ${response.status}`);
 }

 const report = await response.json();
 generatedReport = report;

 if (onReportGenerated) onReportGenerated({ report });
 } catch (error) {
 console.error('Error generating police report:', error);
 alert('Failed to generate police report. Please try again.');
 } finally {
 isGenerating = false;
 }
 }

 function addEvidence(evidence: Evidence) {
 if (!selectedEvidence.find(e => e.id === evidence.id)) {
 selectedEvidence = [...selectedEvidence, evidence];
 }
 }

 function removeEvidence(evidenceId: string) {
 selectedEvidence = selectedEvidence.filter(e => e.id !== evidenceId);
 }

 function clearAll() {
 narrative = '';
 selectedEvidence = [];
 generatedReport = null;
 activeSection = null;
 }

 function exportReport() {
 if (!generatedReport) return;

 const blob = new Blob([generatedReport.content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `police-report-${generatedReport.id}.txt`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function printReport() {
 if (!generatedReport) return;

 const printWindow = window.open('', '_blank');
 if (printWindow) {
 printWindow.document.write(`
 <html>
 <head>
 <title>Police Report - ${generatedReport.id}</title>
 <style>
 body { font-family: 'Times New Roman', serif, margin: 40px; line-height: 1.6; }
 h1 { color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 10px; }
 h2 { color: #374151; margin-top: 30px; }
 .metadata { background: #f3f4f6;
		padding: 15px; border-radius: 5px;
	margin: 20px 0; }
 .section { margin: 20px 0; }
 </style>
 </head>
 <body>
 <h1>POLICE REPORT</h1>
 <div class="metadata">
 <p><strong>Report, ID:</strong> ${generatedReport.id}</p>
 <p><strong>Generated:</strong> ${new Date(generatedReport.generatedAt).toLocaleString()}</p>
 <p><strong>Case ID:</strong> ${generatedReport.caseId || 'N/A'}</p>
 </div>
 ${generatedReport.sections.map(section => `
 <div class="section">
 <h2>${section.title}</h2>
 <p>${section.content.replace(/\n/g, '<br>')}</p>
 </div>
 `).join('')}
 </body>
 </html>
 `);
 printWindow.document.close();
 printWindow.print();
 }
 }
</script>

<div class="police-report-generator bg-panel rounded-lg p-6">
 <div class="flex items-center gap-3 mb-6">
 <div class="text-2xl">👮</div>
 <h2 class="text-xl font-bold text-info/80">Auto Police Report Generator</h2>
 </div>

 <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <!-- Input Section -->
 <div class="space-y-6">
 <!-- Narrative Input -->
 <div>
 <label for="narrative-input" class="block text-sm font-medium text-sand/40 mb-2">
 Victim/Reporting Party Narrative
 </label>
 <textarea
 id="narrative-input"
 bind:value={narrative}
 placeholder="Describe what happened... (e.g., 'I was walking home when I noticed someone following me...')"
 class="w-full h-32 bg-panelSoft border border-sand/30 rounded-lg px-3 py-2 text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info resize-none"
 ></textarea>
 </div>

 <!-- Evidence Selection -->
 <div>
 <span class="block text-sm font-medium text-sand/40 mb-2">
 Evidence to Include
 </span>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-3 min-h-32">
 {#if selectedEvidence.length === 0}
 <p class="text-sand/60 text-center py-8">
 No evidence selected. Add evidence from your case to include in the report.
 </p>
 {:else}
 <div class="space-y-2">
 {#each selectedEvidence as evidence (evidence.id)}
 <div class="flex items-center justify-between bg-panelSoft rounded px-3 py-2">
 <div class="flex-1 min-w-0">
 <p class="text-sm font-medium text-white truncate">{evidence.title}</p>
 <p class="text-xs text-sand/40 truncate">{evidence.fileName || evidence.description}</p>
 </div>
 <button
 onclick={() => removeEvidence(evidence.id)}
 class="ml-2 text-danger/80 hover:text-danger/60 text-sm"
 >
 ✕
 </button>
 </div>
 {/each}
 </div>
 {/if}
 </div>
 </div>

 <!-- Action Buttons -->
 <div class="flex gap-3">
 <button
 onclick={generateReport}
 disabled={isGenerating || (!narrative.trim() && selectedEvidence.length === 0)}
 class="flex-1 bg-gradient-to-r from-info to-info/80 hover:from-info hover:to-info disabled:from-panelSoft disabled to-panelSoft text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
 >
 {#if isGenerating}
 <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
 Generating...
 {:else}
 📝 Generate Report
 {/if}
 </button>
 <button
 onclick={ clearAll }
 class="px-4 py-3 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded-lg transition-colors"
 >
 Clear
 </button>
 </div>
 </div>

 <!-- Output Section -->
 <div class="space-y-4">
 {#if generatedReport}
 <!-- Report Header -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-3">
 <h3 class="text-lg font-bold text-accent">Generated Police Report</h3>
 <div class="flex gap-2">
 <button
 onclick={exportReport}
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Download as text file"
 >
 💾
 </button>
 <button
 onclick={printReport}
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Print report"
 >
 🖨️
 </button>
 </div>
 </div>

 <div class="text-xs text-sand/40 space-y-1">
 <p>Report ID: {generatedReport.id}</p>
 <p>Generated: {new Date(generatedReport.generatedAt).toLocaleString()}</p>
 <p>Evidence: {generatedReport.metadata.evidenceCount} items</p>
 </div>
 </div>

 <!-- Report Sections -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg overflow-hidden">
 {#each generatedReport.sections as section (section.title)}
 <div class="border-b border-sand/20 last border-b-0">
 <button
 onclick={() => activeSection = activeSection === section.title ? null : section.title}
 class="w-full text-left px-4 py-3 hover:bg-panelSoft transition-colors flex items-center justify-between"
 >
 <h4 class="font-medium text-info/80">{section.title}</h4>
 <span class="text-sand/40 text-sm">
 {activeSection === section.title ? '−' : '+'}
 </span>
 </button>

 {#if activeSection === section.title}
 <div class="px-4 pb-4">
 <div class="bg-panel rounded p-3 text-sm text-sand/40 whitespace-pre-wrap">
 {section.content}
 </div>
 </div>
 {/if}
 </div>
 {/each}
 </div>

 <!-- Full Report Preview -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-info mb-3">Full Report Preview</h4>
 <div class="bg-panel rounded p-3 max-h-64 overflow-y-auto text-sm text-sand/40 whitespace-pre-wrap">
 {generatedReport.content}
 </div>
 </div>
 {:else}
 <!-- Placeholder -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-8 text-center">
 <div class="text-4xl mb-4">📋</div>
 <h3 class="text-lg font-medium text-sand/40 mb-2">No Report Generated</h3>
 <p class="text-sm text-sand/60">
 Provide a narrative and/or select evidence, then click "Generate Report" to create a professional police report.
 </p>
 </div>
 {/if}
 </div>
 </div>
</div>

<style>
 .animate-spin {
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 from { transform: rotate(0deg); }
 to { transform: rotate(360deg); }
 }
</style>




