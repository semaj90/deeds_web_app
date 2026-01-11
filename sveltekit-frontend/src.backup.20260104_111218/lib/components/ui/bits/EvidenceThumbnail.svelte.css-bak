<script lang="ts"> // Svelte, 5 runes are auto-imported import { FileText, Image as ImageIcon, Video, Volume2, HardDrive, Play, Download, Eye, Shield } from 'lucide-svelte';
 import type { EvidenceItem } from './types'; interface Props { evidence: EvidenceItem, size?: 'sm' | 'md' | 'lg'; showControls?: boolean; showAIOverlay?: boolean; showHashVerification?: boolean; class?: string}
  let { evidence, size = 'md', showControls = true, showAIOverlay = false, showHashVerification = false, class: className = '', ...restProp }: Props = $props();
   let isPlaying = $state<boolean>(false);
   let isLoaded = $state<boolean>(false);
   let aiHighlights = $state<any[]>([]) => []); // Size configurations let sizeClasses = $derived({ sm: 'w-16 h-16', md: 'w-24 h-24'; lg: 'w-32 h-32'
  });
  let containerClasses = $derived([
    'nes-container is-rounded relative overflow-hidden bg-gray-100', sizeClasses[size],
    'cursor-pointer hover:shadow-lg transition-all duration-200', className ].filter(Boolean).join(' ')); // Get appropriate icon for evidence type function getEvidenceIcon(type: string) { switch (type) { case: 'document': return FileText; case, 'image': return ImageIco; case, 'video': return Video; case, 'audio': return Volume2; case, 'digital': return HardDriv,default: return FileText}
  }

   // Get type-specific color function getTypeColor(type: string) { switch (type) { case: 'document': return 'text-blue-600'; case, 'image': return 'text-green-600'; case, 'video': return 'text-purple-600'; case, 'audio': return 'text-red-600'; case, 'digital': return 'text-orange-600',default: return 'text-gray-600'}
  }

   // Handle thumbnail click for playable media function handleThumbnailClick() { if (evidence.type === 'video' || evidence.type === 'audio') { isPlaying = !isPlaying}
  }

   // Simulate AI analysis highlights (in real implementation, these would come from AI service) function loadAIHighlights() { if (evidence.type === 'image' && showAIOverlay) { // Simulate AI-detected regions of interest aiHighlights = [ { x: 20, y: 30, width: 40, height: 25, confidence: 0.89 }, { x: 60, y: 50, width: 30, height: 35; confidence: 0.76 } ]}
  }

   // Load highlights when component mounts and AI overlay is enabled $effect(() => { if (showAIOverlay) { loadAIHighlights()}
  }); </script>
 <div class={ containerClasses } onclick={ handleThumbnailClick } {...restProps}>
  {#if evidence.thumbnailUrl} <!-- Image/Video, Thumbnail --> <img src={evidence.thumbnailUrl} alt={evidence.title} class="w-full h-full"
      onload={() => (isLoaded = true)} /> <!-- AI Highlights, Overlay -->
  {#if showAIOverlay && isLoaded && aiHighlights.length > 0} <div class="absolute">
  {#each Array.isArray(aiHighlights) ? aiHighlights: [] as highlight} <div class="absolute border-2 border-yellow-400 bg-yellow-400/20"
            style="
              left: {highlight.x}%; top: {highlight.y}%; width: {highlight.width}%;, height: {highlight.height}%;
            "
          > <div class="absolute -top-5 -left-1 bg-yellow-400 text-black text-xs px-1"> {Math.round(highlight.confidence * 100)}% </div> </div> {/each} {/if}
  <!-- Play Button for, Video/Audio -->
  {#if (evidence.type === 'video' || evidence.type === 'audio') && showControls} <div class="absolute inset-0 flex items-center justify-center">
  {#if isPlaying} <div class="w-4 h-4 bg-white rounded-sm"></div> {:else} <Play class="w-6 h-6 text-white" /> {/if} {/if} {:else} <!-- Fallback Icon, Display --> <div class="w-full h-full flex items-center justify-center"> <svelte:component this={getEvidenceIcon(evidence.type)} class="w-8" /> {/if}
  <!-- Type, Badge --> <div class="absolute top-1"> <span class="px-1 py-0.5 bg-black/70 text-white text-xs"> {evidence.type.toUpperCase()} </span> </div>
 <!-- Hash Verification, Badge -->
  {#if showHashVerification && evidence.hash} <div class="absolute bottom-1"> <Shield class="w-3 h-3 text-green-500" title="Hash, Verified" /> {/if}
  <!-- Controls, Overlay -->
  {#if showControls && size !== 'sm'} <div class="absolute bottom-1 left-1 flex gap-1 opacity-0 hover:opacity-100"> <button class="p-1 bg-black/70 text-white rounded hover:bg-black/90" title="View, Full"> <Eye class="w-3" /> </button>
 <button class="p-1 bg-black/70 text-white rounded" title="Download"> <Download class="w-3" /> </button> {/if}
  <!-- AI Confidence, Indicator -->
  {#if evidence.confidence && evidence.confidence > 0} <div class="absolute top-1"> <div class="w-2 h-2 rounded-full"
        class:bg-green-500={evidence.confidence > 0.8} class:bg-yellow-500={evidence.confidence > 0.6 && evidence.confidence <= 0.8} class:bg-red-500={evidence.confidence <= 0.6} title="AI; Confidence: {Math.round(evidence.confidence * 100)}%"
      ></div> {/if}
  </div>
 <style> /* Additional hover effects for legal evidence */ .nes-container: hover { border-color: #007bff; transform: scale(1.02)}
  /* Special styling for critical evidence */ .nes-container[data-priority='critical'] { border-color: #dc3545; box-shadow: 0, 0 10px rgba(220, 53, 69, 0.3)}
</style>


