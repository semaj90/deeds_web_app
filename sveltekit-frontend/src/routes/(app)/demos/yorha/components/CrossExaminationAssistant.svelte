<script lang="ts">



 interface Evidence { id: string, title: string;
 description?: string;
 content?: string;
 fileName?: string;
 }

 interface Witness { id: string, name: string;
 statement?: string;
 credibility?: number;
 }

 interface CrossExamQuestion { id: string, question: string;
 type: 'general' | 'timeline' | 'credibility' | 'contradiction';
 priority: 'high' | 'medium' | 'low';
 category: string;
	reasoning: string;
 followUp?: string[];
 }

 interface CrossExamSession { id: string, witness: Witness;
 questions: CrossExamQuestion[];
	generatedAt: string;
 strategy: string;
 }

 interface Props {
  onquestionsgenerated?: (...args: any[]) => void;
  witness?: Witness | null;
  evidence?: Evidence[];
  caseContext?: string;
 }

 let { witness = null, evidence = [], caseContext = '' , onquestionsgenerated }: Props = $props();
let isGenerating = $state(false);
 let session = $state<CrossExamSession | null>(null);
 let selectedQuestionType = $state<'all' | 'general' | 'timeline' | 'credibility' | 'contradiction'>('all');
 let selectedPriority = $state<'all' | 'high' | 'medium' | 'low'>('all');
 let expandedQuestion = $state<string | null>(null);

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
witness: evidence,
 caseContext: caseContext.trim()
 })
 });

 if (!response.ok) {
 throw new Error(`Failed to generate questions: ${response.status}`);
 }

 const data = await response.json();
 session = data.session;

 onquestionsgenerated?.({ session });
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
  } function getQuestionTypeIcon(type: string) {
 switch (type) {
 case 'general': return '❓';
 case 'timeline': return '⏰';
 case 'credibility': return '⚖️';
 case 'contradiction': return '⚠️';
 default:return '❓';
 }
 }

 function getPriorityColor(priority: string) {
 switch (priority) {
 case 'high': return 'text-danger/80 bg-danger/10';
 case 'medium': return 'text-warning bg-warning/20';
 case 'low': return 'text-accent bg-accent/10';
 default:return 'text-sand/40 bg-panel/20';
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

<div class="cross-exam-assistant bg-panel rounded-lg p-6">
 <div class="flex items-center gap-3 mb-6">
 <div class="text-2xl">⚖️</div>
 <h2 class="text-xl font-bold text-info/80">AI-Guided Cross-Examination Assistant</h2>
 </div>

 <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <!-- Input Section -->
 <div class="lg:col-span-1 space-y-6">
 <!-- Witness Selection -->
 <div>
 <span class="block text-sm font-medium text-sand/40 mb-2">
 Witness to Examine
 </span>
 {#if witness}
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <div class="flex items-center gap-3">
 <div class="text-2xl">👤</div>
 <div>
 <p class="font-medium text-white">{witness.name}</p>
 {#if witness.credibility}
 <p class="text-sm text-sand/40">
 Credibility: {witness.credibility}/10
 </p>
 {/if}
 </div>
 </div>
 {#if witness.statement}
 <div class="mt-3">
 <p class="text-xs text-sand/40 mb-1">Statement:</p>
 <p class="text-sm text-sand/40 bg-panel rounded p-2 max-h-20 overflow-y-auto">
 {witness.statement}
 </p>
 </div>
 {/if}
 </div>
 {:else}
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">👤</div>
 <p class="text-sand/60">No witness selected</p>
 </div>
 {/if}
 </div>

 <!-- Case Context -->
 <div>
 <label for="case-context" class="block text-sm font-medium text-sand/40 mb-2">
 Case Context (Optional)
 </label>
 <textarea id="case-context"
 bind:value={ caseContext }
 placeholder="Additional context about the case, allegations, or specific areas to focus on..."
 class="w-full h-24 bg-panelSoft border border-sand/30 rounded-lg px-3 py-2 text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info resize-none text-sm"
 ></textarea>
 </div>

 <!-- Evidence Summary -->
 {#if evidence.length > 0}
 <div>
 <span class="block text-sm font-medium text-sand/40 mb-2">
 Available Evidence ({evidence.length})
 </span>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-3 max-h-32 overflow-y-auto">
 <div class="space-y-1">
 {#each evidence as item (item.id)}
 <p class="text-sm text-sand/40 truncate">• {item.title}</p>
 {/each}
 </div>
 </div>
 </div>
 {/if}

 <!-- Generate Button -->
 <button
 onclick={generateQuestions}
 disabled={isGenerating || !witness}
 class="w-full bg-gradient-to-r from-info to-info/80 hover:from-info hover:to-info disabled:from-panelSoft disabled to-panelSoft text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-3">
 <h3 class="text-lg font-bold text-accent">
 Cross-Examination for {session.witness.name}
 </h3>
 <div class="flex gap-2">
 <button
 onclick={exportQuestions}
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Export questions"
 >
 💾
 </button>
 <button
 onclick={ clearSession }
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Clear session"
 >
 🗑️
 </button>
 </div>
 </div>

 <p class="text-sm text-sand/40 mb-2">
 Generated: {new Date(session.generatedAt).toLocaleString()}
 </p>
 <p class="text-sm text-sand/40 bg-panel rounded p-2">
 <strong>Strategy:</strong> {session.strategy}
 </p>
 </div>

 <!-- Filters -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-sand/40 mb-3">Filter Questions</h4>
 <div class="grid grid-cols-2 gap-4">
 <div>
 <label for="question-type-filter" class="block text-xs text-sand/40 mb-1">Type</label>
 <select id="question-type-filter"
 bind:value={selectedQuestionType}
 class="w-full bg-panelSoft border border-sand/30 rounded px-3 py-2 text-white text-sm"
 >
 <option value="all">All Types</option>
 <option value="general">General</option>
 <option value="timeline">Timeline</option>
 <option value="credibility">Credibility</option>
 <option value="contradiction">Contradiction</option>
 </select>
 </div>
 <div>
 <label for="priority-filter" class="block text-xs text-sand/40 mb-1">Priority</label>
 <select id="priority-filter"
 bind:value={selectedPriority}
 class="w-full bg-panelSoft border border-sand/30 rounded px-3 py-2 text-white text-sm"
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
 <div class="bg-panelSoft border border-sand/30 rounded-lg overflow-hidden">
 <button
 onclick={() => expandedQuestion = expandedQuestion === question.id ? null : question.id}
 class="w-full text-left p-4 hover:bg-panelSoft transition-colors"
 >
 <div class="flex items-start gap-3">
 <span class="text-lg">{getQuestionTypeIcon(question.type)}</span>
 <div class="flex-1 min-w-0">
 <div class="flex items-center gap-2 mb-1">
 <span class="px-2 py-1 rounded text-xs font-medium {getPriorityColor(question.priority)}">
 {question.priority.toUpperCase()}
 </span>
 <span class="text-xs text-sand/40 uppercase">{question.type}</span>
 </div>
 <p class="text-white font-medium text-sm leading-relaxed">
 {question.question}
 </p>
 </div>
 <span class="text-sand/40 text-sm">
 {expandedQuestion === question.id ? '−' : '+'}
 </span>
 </div>
 </button>

 {#if expandedQuestion === question.id}
 <div class="px-4 pb-4 border-t border-sand/20">
 <div class="space-y-3 pt-3">
 <div>
 <p class="text-xs text-sand/40 mb-1">CATEGORY</p>
 <p class="text-sm text-sand/40">{question.category}</p>
 </div>
 <div>
 <p class="text-xs text-sand/40 mb-1">REASONING</p>
 <p class="text-sm text-sand/40">{question.reasoning}</p>
 </div>
 {#if question.followUp && question.followUp.length > 0}
 <div>
 <p class="text-xs text-sand/40 mb-1">FOLLOW-UP QUESTIONS</p>
 <ul class="text-sm text-sand/40 space-y-1">
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
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">🔍</div>
 <p class="text-sand/60">No questions match the current filters</p>
 </div>
 {/if}
 {:else}
 <!-- Placeholder -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-12 text-center">
 <div class="text-4xl mb-4">🎯</div>
 <h3 class="text-lg font-medium text-sand/40 mb-2">Ready for Cross-Examination</h3>
 <p class="text-sm text-sand/60">
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



