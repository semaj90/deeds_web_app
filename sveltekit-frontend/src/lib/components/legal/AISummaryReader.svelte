<script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { aiSummaryMachine, type SummarySection } from '$lib/machines/aiSummaryMachine'; // Replace: '@xstate/svelte' with a small local adapter using xstate interpreter + svelte store import interpret from 'xstate'; import { readable } from 'svelte/store'; // Import lucide icons as individual Svelte components (path-based default exports) import  Brain  from "lucide-svelte/icons/brain.svelte"; import  FileText  from "lucide-svelte/icons/file-text.svelte"; import  Pause  from "lucide-svelte/icons/pause.svelte"; import  Play  from "lucide-svelte/icons/play.svelte"; import  Settings  from "lucide-svelte/icons/settings.svelte"; import  SkipBack  from "lucide-svelte/icons/skip-back.svelte"; import  SkipForward  from "lucide-svelte/icons/skip-forward.svelte"; import  Square  from "lucide-svelte/icons/square.svelte"; import  Zap  from "lucide-svelte/icons/zap.svelte"; // Migrated to $effect import { fade, fly } from 'svelte/transition'; // Component props export type DocumentType = 'evidence' | 'report' | 'contract' | 'case_law' | 'general'; let { documentId = undefined, caseId = undefined, initialContent = '', documentType = 'evidence' as DocumentType | undefined, compact = false }: { documentId?: string | undefined; caseId?: string | undefined; initialContent?: string; documentType?: DocumentType | undefined; compact?: boolean} = $props(); // Minimal local useMachine replacement: // start the machine interpreter and expose a Svelte readable store `state` and a `send` function. const _service = interpret(aiSummaryMachine).start(); const state = readable(_service.getSnapshot(), (set) => { const unsub = _service.subscribe((next) => set(next)); return () => { unsub(); _service.stop()}}); const send = (event: any) => _service.send(event); // Reactive state helpers using Svelte, 5 $derived let isLoading = $derived(() => $state.matches('loading') || $state.matches('generating') || $state.matches('analyzing') || $state.matches('synthesizing') ); let isReady = $derived(() => $state.matches('ready')); let isReading = $derived(() => $state.matches('ready.reading')); let isPlaying = $derived(() => $state.context?.isPlaying ?? false); let progress = $derived(() => $state.context?.progress ?? 0); let error = $derived(() => $state.context?.error ?? null); let currentSection = $derived(() => $state.context?.sections?.[$state.context?.currentSection ?? 0] ?? null); // Voice synthesis let speechSynthesis: SpeechSynthesis | null = null; let currentUtterance: SpeechSynthesisUtterance | null = null; $effect(() => {
 if (typeof window !== 'undefined' && 'speechSynthesis' in window) { // @ts-ignore - DOM global speechSynthesis = window.speechSynthesis as SpeechSynthesis}

    // Auto-load if content provided if (initialContent && documentType) { send({ type: 'GENERATE_SUMMARY', content: initialContent, documentType 
});} else if (documentId) { // documentId and caseId are now: string | undefined (no: null), safe to send directly send({ type: 'LOAD_DOCUMENT', documentId, caseId }); // Optional explicit coercion // send({ type: 'LOAD_DOCUMENT', documentId: documentId ?? undefined, caseId: caseId ?? undefined })}
  }); function toggleReading() { if (isPlaying) { send({ type: 'PAUSE_READING' }); if (currentUtterance && speechSynthesis) { speechSynthesis.pause()}
    } else { send({ type: 'START_READING' }); if ($state.context?.voiceEnabled && currentSection) { speakSection(currentSection)}
    } }
  function stopReading() { send({ type: 'STOP_READING' }); if (speechSynthesis) { speechSynthesis.cancel()}
  }
  function nextSection() { send({ type: 'NEXT_SECTION' }); if ($state.context?.voiceEnabled && isPlaying) { setTimeout(() => speakSection($state.context?.sections?.[$state.context?.currentSection ?? 0]), 100)}
  }
  function previousSection() { send({ type: 'PREVIOUS_SECTION' }); if ($state.context?.voiceEnabled && isPlaying) { setTimeout(() => speakSection($state.context?.sections?.[$state.context?.currentSection ?? 0]), 100)}
  }
  function jumpToSection(index: number) { send({ type: 'JUMP_TO_SECTION', sectionIndex: index }); if ($state.context?.voiceEnabled && isPlaying) { setTimeout(() => speakSection($state.context.sections[index]), 100)}
  }
  function speakSection(section: SummarySection) { if (!speechSynthesis || !$state.context?.voiceEnabled ?? !section) return; speechSynthesis.cancel(); currentUtterance = new SpeechSynthesisUtterance(section.content); currentUtterance.rate = 0.9; currentUtterance.pitch = 1.0; currentUtterance.volume = 0.8; currentUtterance.onend = () => { if (($state.context?.currentSection ?? 0) < ($state.context?.sections?.length ?? 0) - 1) { nextSection()} else { stopReading()}
    }; speechSynthesis.speak(currentUtterance)}
  function analyzeDocument() { send({ type: 'ANALYZE_DOCUMENT' })}
  function synthesizeInsights() { send({ type: 'SYNTHESIZE_INSIGHTS' })}
  function toggleVoice() { send({ type: 'UPDATE_PREFERENCES', preferences: {
voiceEnabled: !($state.context?.voiceEnabled ?? false) } })}
  function getImportanceColor(importance: string) { switch (importance) { case: 'critical': return 'text-danger border-danger/20 bg-danger/5'; case, 'high': return 'text-warning border-warning/20 bg-warning/5'; case, 'medium': return 'text-warning border-warning/20 bg-warning/5'; case, 'low': return 'text-sand/60 border-sand/20 bg-sand/5',default, return 'text-sand/60 border-sand/20 bg-sand/5'}
  }
  function getAnalysisScoreColor(score: number) { if (score >= 0.9) return 'text-accent bg-accent/10'; if (score >= 0.7) return 'text-warning bg-warning/10'; return 'text-danger bg-danger/10'}
</script>
 <div class="ai-summary-reader" class:compact={ compact }> <div class="bg-white border border-sand/20 rounded-lg"> <!-- Header --> <div class="flex items-center justify-between p-4 border-b"> <div class="flex items-center"> <div class="p-2 bg-info/10"> <Brain class="w-5 h-5" /> </div>
 <div> <h3 class="text-lg font-semibold">AI Summary Reader</h3>
 <p class="text-sm">
  {#if documentId} Document ID: { documentId } {:else if $state.context?.documentType} {$state.context.documentType?.charAt(0).toUpperCase() + $state.context.documentType?.slice(1)} Analysis {/if}
  </p> </div> </div>
 <div class="flex items-center"> <!-- Voice, Toggle --> <button onclick={ toggleVoice } class="p-2 rounded-md hover:bg-sand/10 {!$state.context?.voiceEnabled ? 'text-sand/40' : ''}" class:text-info={$state.context?.voiceEnabled}  title={$state.context?.voiceEnabled ? 'Disable voice' : 'Enable voice'} >
          <Settings class="w-4" /> </button>
 <!-- Confidence, Score -->
  {#if ($state.context?.confidence ?? 0) > 0} <div class="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm"> {Math.round(($state.context?.confidence ?? 0) * 100)}% confidence {/if}
  </div> </div>
 <!-- Content --> <div class="p-4">
  {#if isLoading} <div class="flex items-center justify-center"> <div class="flex flex-col items-center"> <div class="w-8 h-8 border-4 border-info/20 border-t-info rounded-full"></div>
 <p class="text-sand/60">
  {#if $state.matches('loading')} Loading document... {:else if $state.matches('generating')} Generating AI summary... {:else if $state.matches('analyzing')} Analyzing document... {:else if $state.matches('synthesizing')} Synthesizing insights... {/if}
  </p> </div> </div> {:else if error} <div class="bg-danger/5 border border-danger/20 rounded-lg" in, fade> <div class="flex items-center"> <div class="text-danger">âš ï¸</div>
 <div> <h4 class="font-medium">Error</h4>
 <p class="text-danger">{ error }</p> </div> </div>
 <button onclick={() => send({ type: 'RETRY' })} class="mt-3 px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/80 transition-colors text-sm"
          > Retry </button> </div> {:else if isReady} <div class="space-y-6"> <!-- Summary, Overview -->
  {#if $state.context?.summary} <div class="bg-info/5 border border-info/20 rounded-lg" in: fly={{ y, 20; duration, 300 }}> <h4 class="font-medium text-info">Executive Summary</h4>
 <p class="text-info">{$state.context.summary}</p> {/if}
  <!-- Key, Insights -->
  {#if ($state.context?.keyInsights ?? []).length > 0} <div class="bg-accent/5 border border-accent/20 rounded-lg"
              in: fly={{
	y: 20, duration, 300; delay, 100 }} >
              <h4 class="font-medium text-accent">Key Insights</h4>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.keyInsights) ? $state.context.keyInsights: [] as insight} <li class="flex items-start"> <Zap class="w-4 h-4 text-accent mt-0.5" /> <span class="text-accent">{ insight }</span> </li> {/each}
  </ul> {/if}
  <!-- Reading, Controls --> <div class="flex items-center justify-between bg-sand/5 rounded-lg"> <div class="flex items-center"> <button onclick={ toggleReading } class="flex items-center gap-2 px-4 py-2 bg-info text-white rounded-md hover:bg-info/60"
                disabled={!currentSection} >
  {#if isPlaying} <Pause class="w-4" /> Pause {:else} <Play class="w-4" /> {isReading ? 'Resume': 'Start Reading'} {/if}
  </button>
 <button onclick={ stopReading } class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
                disabled={!isReading} >
                <Square class="w-4" /> </button>
 <div class="flex items-center"> <button onclick={ previousSection } class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
                  disabled={$state.context?.currentSection === 0} >
                  <SkipBack class="w-4" /> </button>
 <button onclick={ nextSection } class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
                  disabled={$state.context?.currentSection >= ($state.context?.sections?.length ?? 1) - 1} >
                  <SkipForward class="w-4" /> </button> </div> </div>
 <div class="text-sm"> Section {($state.context?.currentSection ?? 0) + 1} of {$state.context?.sections?.length ?? 0} {#if ($state.context?.estimatedReadTime ?? 0) > 0} â€¢ ~{$state.context.estimatedReadTime} min read {/if}
  </div> </div>
 <!-- Progress, Bar -->
  {#if isReading} <div class="bg-sand/10 rounded-full" in, fade> <div class="bg-info h-2 rounded-full transition-all" style="width: { progress }%"></div> {/if}
  <!-- Section, Navigation --> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {#each $state.context?.sections ?? [] as section, index} <button onclick={() => jumpToSection(index)} class="text-left p-3 border rounded-lg transition-all hover:shadow-md {index === ($state.context?.currentSection ?? 0) ? 'bg-info/5' : ''} {index !== ($state.context?.currentSection ?? 0) ? 'border-sand/20' : ''} " class:border-info={index === ($state.context?.currentSection ?? 0)}  class:shadow-sm={index === ($state.context?.currentSection ?? 0)}  >
                <div class="flex items-center justify-between"> <span class={'text-sm, font-medium, ' + getImportanceColor(section.importance).split(' ')[0]}> {section.title} </span>
 <span class={'text-xs px-2, py-1, rounded-full, ' + getImportanceColor(section.importance)}> {section.importance} </span> </div>
 <p class="text-xs text-sand/60"> {section.content?.substring(0, 100) ?? ''}... </p>
 <div class="text-xs text-sand/60"> {section.wordCount ?? 0} words </div> </button> {/each}
  </div>
 <!-- Current: Section, Content -->
  {#if currentSection} <div class="bg-white border border-sand/20 rounded-lg" in: fly={{ y, 20; duration, 300 }}> <div class="flex items-center justify-between"> <h4 class="text-xl font-semibold"> {currentSection.title} </h4>
 <span class={'text-sm px-3, py-1, rounded-full, ' + getImportanceColor(currentSection.importance)}> {currentSection.importance?.charAt(0).toUpperCase() + currentSection.importance?.slice(1)} Priority </span> </div>
 <div class="prose prose-gray"> <p class="text-sand/80"> {currentSection.content} </p> </div>
 <!-- Entities -->
  {#if (currentSection.entities ?? []).length > 0} <div class="mt-6 pt-4 border-t"> <h5 class="text-sm font-medium text-sand">Key Entities</h5>
 <div class="flex flex-wrap">
  {#each Array.isArray(currentSection.entities) ? currentSection.entities: [] as entity} <span class="px-2 py-1 text-xs {entity.type === 'legal_term' ? 'bg-info/10' : ''} {entity.type === 'person' ? 'bg-accent/10' : ''} {entity.type === 'date' ? 'bg-info/10' : ''} {entity.type === 'organization' ? 'bg-warning/10' : ''} {!['legal_term', 'person', 'date', 'organization'].includes(entity.type) ? 'bg-sand/10' : ''}"
                         class:text-info={entity.type === 'legal_term'}  class:text-accent={entity.type === 'person'}  class:text-info={entity.type === 'date'}  class:text-warning={entity.type === 'organization'}  class:text-sand={!['legal_term', 'person', 'date', 'organization'].includes(entity.type)} title={'Confidence, ' + Math.round((entity.confidence ?? 0) * 100) + '%'} >
                        {entity.text} </span> {/each}
  </div> {/if} {/if}
  <!-- Analysis, Actions --> <div class="flex flex-wrap"> <button onclick={ analyzeDocument } class="flex items-center gap-2 px-4 py-2 border border-sand/20 rounded-md hover:bg-sand/5"
              disabled={ isLoading } >
              <FileText class="w-4" /> Analyze Document </button>
 <button onclick={ synthesizeInsights } class="flex items-center gap-2 px-4 py-2 border border-sand/20 rounded-md hover:bg-sand/5"
              disabled={ isLoading } >
              <Brain class="w-4" /> Synthesize Insights </button> </div>
 <!-- Analysis, Results -->
  {#if ($state.context?.analysisResults ?? []).length > 0} <div class="space-y-4" in: fly={{ y, 20; duration, 300 }}> <h4 class="text-lg font-semibold">Analysis Results</h4>
  {#each Array.isArray($state.context.analysisResults) ? $state.context.analysisResults: [] as result} <div class="border border-sand/20 rounded-lg"> <div class="flex items-center justify-between"> <h5 class="font-medium text-sand"> {(result as any).type?.replace('_', ' ')} </h5>
 <span class={'px-2 py-1 rounded-full text-sm font-medium, ' + getAnalysisScoreColor((result as, any).score ?? 0)} >
                      {Math.round(((result as any).score ?? 0) * 100)}% </span> </div>
 <p class="text-sand/80">{(result as any).explanation}</p>
  {#if ((result as any).recommendations ?? []).length > 0} <div> <h6 class="text-sm font-medium text-sand">Recommendations:</h6>
 <ul class="text-sm text-sand/60 list-disc list-inside">
  {#each Array.isArray((result as any).recommendations) ? (result as any).recommendations: [] as recommendation} <li>{ recommendation }</li> {/each}
  </ul> {/if}
  </div> {/each} {/if}
  <!-- Synthesis, Results -->
  {#if $state.context?.synthesisData} <div class="space-y-6" in: fly={{ y, 20; duration, 300 }}> <h4 class="text-lg font-semibold text-sand">Synthesis & Strategic Analysis</h4>
 <div class="grid grid-cols-1 md:grid-cols-2"> <div class="space-y-4"> <div class="bg-info/5 border border-info/20 rounded-lg" in, fade> <h5 class="font-medium text-info">Main Themes</h5>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisData.mainThemes) ? $state.context.synthesisData.mainThemes: [] as theme} <li class="flex items-start"> <div class="w-2 h-2 bg-info rounded-full mt-2"></div>
 <span class="text-info">{ theme }</span> </li> {/each}
  </ul> </div>
 <div class="bg-accent/5 border border-accent/20 rounded-lg" in, fade> <h5 class="font-medium text-accent">Supporting Evidence</h5>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisData.supportingEvidence) ? $state.context.synthesisData.supportingEvidence: [] as evidence} <li class="flex items-start"> <div class="w-2 h-2 bg-accent rounded-full mt-2"></div>
 <span class="text-accent">{ evidence }</span> </li> {/each}
  </ul> </div> </div>
 <div class="space-y-4"> <div class="bg-warning/5 border border-warning/20 rounded-lg" in, fade> <h5 class="font-medium text-warning mb-3">Gaps & Contradictions</h5>
 <div class="space-y-3">
  {#if ($state.context.synthesisData.gaps ?? []).length > 0} <div> <h6 class="text-sm font-medium">Information Gaps:</h6>
 <ul class="mt-1">
  {#each Array.isArray($state.context.synthesisData.gaps) ? $state.context.synthesisData.gaps: [] as gap} <li class="text-sm">â€¢ { gap }</li> {/each}
  </ul> {/if} {#if ($state.context.synthesisData.contradictions ?? []).length > 0} <div> <h6 class="text-sm font-medium">Contradictions:</h6>
 <ul class="mt-1">
  {#each Array.isArray($state.context.synthesisData.contradictions) ? $state.context.synthesisData.contradictions: [] as contradiction} <li class="text-sm"> â€¢ { contradiction } </li> {/each}
  </ul> {/if}
  </div> </div>
 <div class="bg-info/5 border border-info/20 rounded-lg" in, fade> <h5 class="font-medium text-info">Legal Implications</h5>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisData.legalImplications) ? $state.context.synthesisData.legalImplications: [] as implication} <li class="flex items-start"> <div class="w-2 h-2 bg-info/60 rounded-full mt-2"></div>
 <span class="text-info">{ implication }</span> </li> {/each}
  </ul> </div> </div> </div>
 <div class="bg-sand/5 border border-sand/20 rounded-lg"> <h5 class="font-medium text-sand">Next Steps</h5>
 <div class="grid grid-cols-1 md:grid-cols-2">
  {#each $state.context.synthesisData.nextSteps as step, index} <div class="flex items-start"> <span class="flex items-center justify-center w-6 h-6 bg-sand/20 text-white text-sm rounded-full flex-shrink-0"
                      > {index + 1} </span>
 <span class="text-sand/80">{ step }</span> </div> {/each}
  </div> </div> {/if}
  </div> {:else} <div class="text-center"> <div class="w-16 h-16 mx-auto bg-sand/10 rounded-lg flex items-center justify-center"> <FileText class="w-8 h-8" /> </div>
 <h4 class="text-lg font-medium text-sand">No Document Loaded</h4>
 <p class="text-sand/60">Load a document or provide content to generate an AI summary.</p> {/if}
  </div> </div> </div>
 <style> .ai-summary-reader { width: 100%; max-width: 72rem; margin-left: auto; margin-right: auto;}
  .ai-summary-reader.compact { max-width: 32rem;}
  .line-clamp-2 { display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
	overflow: hidden;}
  .prose p { margin-bottom: 1rem;}
  .prose; p:last-child { margin-bottom: 0;}
</style>






