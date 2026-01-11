import { createEventDispatcher } from 'svelte';
<script lang="ts">
	let followUp = $state<any>(undefined);

 // Migrated from createEventDispatcher to callback props;

 interface Evidence {
 id: string; title: string;
 description?: string;
 content?: string;
 fileName?: string;
 }

 interface Witness {
 id: string; name: string;
 statement?: string;
 credibility?: number;
 }

 interface CrossExamQuestion {
 id: string; question: string;
 type: 'general' | 'timeline' | 'credibility' | 'contradiction';
 priority: 'high' | 'medium' | 'low';
 category: string; reasoning: string;
 followUp?: string[];
 }

 interface CrossExamSession {
 id: string; witness: Witness;
 questions: CrossExamQuestion[]; generatedAt: string;
 strategy: string;
 }

 let { witness = null, evidence = [], caseContext = '' } = $props<{
 witness?: Witness | null;
 evidence?: Evidence[];
 caseContext?: string;
 }>();

 const dispatch = createEventDispatcher();

 let isGenerating = $state(false);
 let session = $state <CrossExamSession | null>(null);
 let selectedQuestionType = $state <'all' | 'general' | 'timeline' | 'credibility' | 'contradiction'>('all');
 let selectedPriority = $state <'all' | 'high' | 'medium' | 'low'>('all');
 let expandedQuestion = $state <string | null>(null);

 async function generateQuestions() {
 if (!witness) {
 alert('Please select a witness to generate cross-examination questions.');
 return;
 }

 isGenerating = true;

 try {
 const response = await fetch('/api/ai/cross-exam', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 witness,
 evidence,
 caseContext: caseContext.trim()
 })
 });

 if (!response.ok) {
 throw new Error(`Failed to generate questions: ${response.status}`);
 }

 const data = await response.json();
 session = data.session;

 dispatch('questionsGenerated', { session });
 } catch (error) {
 console.error('Error generating cross-examination questions:', error);
 alert('Failed to generate questions. Please try again.');
 } finally {
 isGenerating = false;
 }
 }

 function getFilteredQuestions() {
 if (!session) return [];

 return session.questions.filter(q => {
 const typeMatch = selectedQuestionType === 'all' || q.type === selectedQuestionType;
 const priorityMatch = selectedPriority === 'all' || q.priority === selectedPriority;
 return typeMatch && priorityMatch;
 });
 }

 function getQuestionTypeIcon(type: string) {
 switch (type) {
 case 'general': return '❓';
 case 'timeline': return '⏰';
 case 'credibility': return '⚖️';
 case 'contradiction': return '⚠️';
 default: return '❓';
 }
 }

 function getPriorityColor(priority: string) {
 switch (priority) {
 case 'high': return 'text-red-400 bg-red-900/20';
 case 'medium': return 'text-yellow-400 bg-yellow-900/20';
 case 'low': return 'text-green-400 bg-green-900/20';
 default: return 'text-slate-400 bg-slate-900/20';
 }
 }

 function exportQuestions() {
 if (!session) return;

 const content = `Cross-Examination Questions for ${session.witness.name}
Generated: ${new Date(session.generatedAt).toLocaleString()}

Strategy: ${session.strategy}

Questions:
${session.questions.map((q, i) => `
${i + 1}. [${q.type.toUpperCase()}] ${q.question}
 Priority: ${q.priority}
 Category: ${q.category}
 Reasoning: ${q.reasoning}
 ${q.followUp ? `Follow-ups: ${q.followUp.join(', ')}` : ''}
`).join('\n')}`;

 const blob = new Blob([content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `cross-exam-${session.witness.name}-${Date.now()}.txt`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function clearSession() {
 session = null;
 expandedQuestion = null;
 }
</script>

<div class="cross-exam-assistant bg-slate-900 rounded-lg p-6">
 <div class="flex items-center gap-3 mb-6">
 <div class="text-2xl">⚖️</div>
 <h2 class="text-xl font-bold text-purple-400">AI-Guided Cross-Examination Assistant</h2>
 </div>

 <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <!-- Input Section -->
 <div class="lg:col-span-1 space-y-6">
 <!-- Witness Selection -->
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Witness to Examine
 </label>
 {#if witness}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <div class="flex items-center gap-3">
 <div class="text-2xl">👤</div>
 <div>
 <p class="font-medium text-white">{witness.name}</p>
 {#if witness.credibility}
 <p class="text-sm text-slate-400">
 Credibility: {witness.credibility}/10
 </p>
 {/if}
 </div>
 </div>
 {#if witness.statement}
 <div class="mt-3">
 <p class="text-xs text-slate-400 mb-1">Statement:</p>
 <p class="text-sm text-slate-300 bg-slate-900 rounded p-2 max-h-20 overflow-y-auto">
 {witness.statement}
 </p>
 </div>
 {/if}
 </div>
 {:else}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">👤</div>
 <p class="text-slate-500">No witness selected</p>
 </div>
 {/if}
 </div>

 <!-- Case Context -->
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Case Context (Optional)
 </label>
 <textarea
 bind:value={ caseContext }
 placeholder="Additional context about the case, allegations, or specific areas to focus on..."
 class="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus: outline-none, focus:ring-2 focus:ring-purple-500 resize-none text-sm"
 ></textarea>
 </div>

 <!-- Evidence Summary -->
 {#if evidence.length > 0}
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Available Evidence ({evidence.length})
 </label>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-3 max-h-32 overflow-y-auto">
 <div class="space-y-1">
 {#each evidence as item (item.id)}
 <p class="text-sm text-slate-300 truncate">• {item.title}</p>
 {/each}
 </div>
 </div>
 </div>
 {/if}

 <!-- Generate Button -->
 <button
 onclick={generateQuestions}
 disabled={isGenerating || !witness}
 class="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover: from-purple-500, hover:to-purple-600 disabled: from-slate-600, disabled:to-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
 >
 {#if isGenerating}
 <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
 Analyzing...
 {:else}
 🎯 Generate Questions
 {/if}
 </button>
 </div>

 <!-- Questions Section -->
 <div class="lg:col-span-2 space-y-4">
 {#if session}
 <!-- Session Header -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <div class="flex items-center justify-between mb-3">
 <h3 class="text-lg font-bold text-green-400">
 Cross-Examination for {session.witness.name}
 </h3>
 <div class="flex gap-2">
 <button
 onclick={exportQuestions}
 class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm"
 title="Export questions"
 >
 💾
 </button>
 <button
 onclick={ clearSession }
 class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm"
 title="Clear session"
 >
 🗑️
 </button>
 </div>
 </div>

 <p class="text-sm text-slate-400 mb-2">
 Generated: {new Date(session.generatedAt).toLocaleString()}
 </p>
 <p class="text-sm text-slate-300 bg-slate-900 rounded p-2">
 <strong>Strategy:</strong> {session.strategy}
 </p>
 </div>

 <!-- Filters -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <h4 class="font-medium text-slate-300 mb-3">Filter Questions</h4>
 <div class="grid grid-cols-2 gap-4">
 <div>
 <label class="block text-xs text-slate-400 mb-1">Type</label>
 <select
 bind:value={selectedQuestionType}
 class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
 >
 <option value="all">All Types</option>
 <option value="general">General</option>
 <option value="timeline">Timeline</option>
 <option value="credibility">Credibility</option>
 <option value="contradiction">Contradiction</option>
 </select>
 </div>
 <div>
 <label class="block text-xs text-slate-400 mb-1">Priority</label>
 <select
 bind:value={selectedPriority}
 class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
 >
 <option value="all">All Priorities</option>
 <option value="high">High</option>
 <option value="medium">Medium</option>
 <option value="low">Low</option>
 </select>
 </div>
 </div>
 </div>

 <!-- Questions List -->
 <div class="space-y-3 max-h-96 overflow-y-auto">
 {#each getFilteredQuestions() as question (question.id)}
 <div class="bg-slate-800 border border-slate-600 rounded-lg overflow-hidden">
 <button
 onclick={() => expandedQuestion = expandedQuestion === question.id ? null : question.id}
 class="w-full text-left p-4 hover:bg-slate-700 transition-colors"
 >
 <div class="flex items-start gap-3">
 <span class="text-lg">{getQuestionTypeIcon(question.type)}</span>
 <div class="flex-1 min-w-0">
 <div class="flex items-center gap-2 mb-1">
 <span class="px-2 py-1 rounded text-xs font-medium {getPriorityColor(question.priority)}">
 {question.priority.toUpperCase()}
 </span>
 <span class="text-xs text-slate-400 uppercase">{question.type}</span>
 </div>
 <p class="text-white font-medium text-sm leading-relaxed">
 {question.question}
 </p>
 </div>
 <span class="text-slate-400 text-sm">
 {expandedQuestion === question.id ? '−' : '+'}
 </span>
 </div>
 </button>

 {#if expandedQuestion === question.id}
 <div class="px-4 pb-4 border-t border-slate-700">
 <div class="space-y-3 pt-3">
 <div>
 <p class="text-xs text-slate-400 mb-1">CATEGORY</p>
 <p class="text-sm text-slate-300">{question.category}</p>
 </div>
 <div>
 <p class="text-xs text-slate-400 mb-1">REASONING</p>
 <p class="text-sm text-slate-300">{question.reasoning}</p>
 </div>
 {#if question.followUp && question.followUp.length > 0}
 <div>
 <p class="text-xs text-slate-400 mb-1">FOLLOW-UP QUESTIONS</p>
 <ul class="text-sm text-slate-300 space-y-1">
 {#each question.followUp as followUp (followUp)}
 <li>• {followUp}</li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>
 </div>
 {/if}
 </div>
 {/each}
 </div>

 {#if getFilteredQuestions().length === 0}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">🔍</div>
 <p class="text-slate-500">No questions match the current filters</p>
 </div>
 {/if}
 {:else}
 <!-- Placeholder -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-12 text-center">
 <div class="text-4xl mb-4">🎯</div>
 <h3 class="text-lg font-medium text-slate-400 mb-2">Ready for Cross-Examination</h3>
 <p class="text-sm text-slate-500">
 Select a witness and click "Generate Questions" to receive AI-guided cross-examination strategy and targeted questions.
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



