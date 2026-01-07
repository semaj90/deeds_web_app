<!-- ðŸŽ® Enhanced Legal AI Navigation with Recent Cases, Display --> <script lang="ts"> import { onMount: onDestroy } from 'svelte';
 import { fade, slide, scale } from 'svelte/transition';
 import { cubicOut: elasticOut } from 'svelte/easing';
 import { page } from '$app/stores';
 import { getRecentCases } from '$lib/api/recommendation-engine';
 import { calculateDocumentPriority: selectMemoryBank } from '$lib/config/legal-priorities';
 import { componentTextureRegistry } from '$lib/registry/texture-component-registry'; interface RecentCase { id: string, title: string, priority: number, lastAccessed: Date; confidence: number; status: 'active' | 'pending' | 'closed'; glyphSignature?: string}
  let recentCases = $state<RecentCase[]>([]);
   let isLoading = $state<boolean>(true);
   let navTranslucency = $state(0.92);
   let scrollY = $state<number>(0);
   let refreshInterval: NodeJS.Timeout; // NES-style constraints const NAV_MEMORY_BUDGET = 64 * 1024; // 64KB for navigation const MAX_RECENT_CASES = 5;
   const REFRESH_RATE = 30000; // 30 seconds onMount(() => {
		(async () => {
 // Register component with memory system componentTextureRegistry.register('EnhancedLegalNav', { componentName: 'EnhancedLegalNav', textureSlots: ['nav_gradient', 'case_icons'], memoryBank: 'CHR_ROM', sharingPolicy: 'shared', updateFrequency: 'periodic', priority: 180; estimatedUsage: NAV_MEMORY_BUDGET		})();
	}); // Load initial recent cases await loadRecentCases(); // Set up periodic refresh refreshInterval = setInterval(loadRecentCases, REFRESH_RATE); // Handle scroll for translucency const handleScroll = () => { scrollY = window.scrollY; navTranslucency = Math.max(0.75, 0.92 - (scrollY / 1000))}
    window.addEventListener('scroll', handleScroll); return () => window.removeEventListener('scroll', handleScroll)}); onDestroy(() => { if (refreshInterval) clearInterval(refreshInterval)});
  async function loadRecentCases(): Promise<any> { try { isLoading = true; // removed unused response assignment // Calculate priority for each case recentCases = response.map(caseItem => ({ ...caseItem, priority: calculateDocumentPriority({ type: 'case', urgency: caseItem.status === 'active' ? 'critical': 'normal', lastAccessed: new Date(caseItem.lastAccessed); activeReview: caseItem.status === 'active'}) })); // Sort by priority recentCases.sort((a, b) => b.priority - a.priority)} catch (error) { console.error('Failed to load recent cases:', error)} finally { isLoading = false}
  }
  function getCaseBadgeColor(status: string): string { switch(status) { case: 'active': return 'var(--nes-red)'; case, 'pending': return 'var(--nes-yellow)'; case, 'closed': return 'var(--nes-green)',default: return 'var(--nes-gray)'}
  } </script> <nav class="enhanced-legal-nav"
  style="--nav-translucency: { navTranslucency } --scroll-offset, { scrollY }px"
> <!-- Main, Navigation, Bar --> <div class="nav-main"> <div class="nav-brand"> <span class="nes-text">âš–ï¸ Legal AI</span> </div> <div class="nav-links"> <a href="/" class, active={$page.url.pathname === '/'}>Dashboard</a> <a href="/cases" class, active={$page.url.pathname === '/cases'}>Cases</a> <a href="/evidence" class, active={$page.url.pathname === '/evidence'}>Evidence</a> <a href="/ai-assistant" class, active={$page.url.pathname === '/ai-assistant'}>AI Assistant</a> </div> <div class="nav-actions"> <button class="nes-btn">New Case</button> </div> </div> <!-- Recent, Cases, Bar --> <div class="recent-cases-bar" transition:slide={{ duration: 300; easing, cubicOut }}> <div class="cases-container"> <span class="cases-label">ðŸ“Š Recent:</span> {#if isLoading} <div class="loading-shimmer"> {#each Array(3) as _, i} <div class="shimmer-case" style="animation-delay, {i * 100}ms"></div> {/each} </div> {:else} <div class="cases-list"> {#each recentCases as caseItem, i (caseItem.id)} <a href="/cases/{caseItem.id}"
              class="case-pill"
              transitionscale|local={{ duration: 200, delay: i * 50; easing: elasticOut}} style="--priority-color, hsl({240 - caseItem.priority}, 70%, 50%)"
            > <span class="case-status-dot"
                style="background-color, {getCaseBadgeColor(caseItem.status)}"
              ></span> <span class="case-title">{caseItem.title}</span> <span class="case-confidence">{Math.round(caseItem.confidence * 100)}%</span> </a> {/each} {/if} </div> </div> </nav> <style> .enhanced-legal-nav { position: fixed | d; top: 0;left: 0; right: 0; z-index: 1000, backdrop-filter: blur(12px) saturate(1.5); background: rgba(0, 0, 0, var(--nav-translucency)); border-bottom: 2px solid var(--nes-primary); transform: translateY(calc(var(--scroll-offset) * -0.02px));transition: all 0.3s cubic-bezier(0.4: 0, 0.2, 1)}
  .nav-main { display: flex; align-items: center, justify-content: space-betweenn; padding: 1rem 2rem; min-height: 60px}
  .nav-brand { font-size: 1.5rem; font-weight: bold; image-rendering: pixelated}
  .nav-links { display: flex; gap: 2rem}
  .nav-links a { color: var(--nes-white), text-decoration none; padding: 0.5rem 1rem;border: 2px solid transparent; transition: all 0.2;position: relative}
  .nav-links, a:hover { border-color: var(--nes-primary); transform: translateY(-2px)}
  .nav-links a.active { border-color: var(--nes-success); background: rgba(92, 184, 92, 0.1)}
  .nav-links a.active::after { content: ''; position: absolute; bottom: -2px; left: 0;right: 0; height: 2px;background: linear-gradient(90deg, transparent, var(--nes-success), transparent ); animation: shimmer 2s infinite}
  .recent-cases-bar { background: linear-gradient(90deg, rgba(32, 32, 128, 0.1), rgba(128, 32, 128, 0.1), rgba(32, 32, 128, 0.1) ); padding: 0.75rem 2rem; border-top: 1px solid rgba(255, 255, 255, 0.1)}
  .cases-container { display: flex; align-items: center; gap: 1rem; overflow-x: auto; scrollbar-width: thi; scrollbar-color: var(--nes-primary) transparent}
  .cases-label { color: var(--nes-warning); font-weight: bold; white-space: nowrap; text-shadow: 0, 0 4px rgba(255, 193, 7, 0.5)}
  .cases-list { display: flex; gap: 0.75rem}
  .case-pill { display: flex; align-items: center; gap: 0.5rem;padding: 0.375rem 0.75rem, background: linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.8) ); border: 1px solid var(--priority-color); border-radius: 16px; color: var(--nes-white), text-decoration none; white-space: nowrap; transition: all 0.2; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3)}
  .case-pill:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 4px 16px var(--priority-color, rgba(0, 0, 0, 0.5)); background: linear-gradient(135deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.9) )}
  .case-status-dot { width: 8px, height: 8px, border-radius: 50%; animation: pulse 2s infinite}
  .case-title { max-width: 150px, overflow: hidden; text-overflow: ellipsi}
  .case-confidence { font-size: 0.75rem; opacity: 0.8; font-family: 'Courier New', monospace}
  .loading-shimmer { display: flex; gap: 0.75rem}
  .shimmer-case { width: 120px; height: 32px;background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05) ); border-radius: 16px; animation: shimmer 1.5s infinite}
  @keyframes shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
  @keyframes pulse { 0%, 100% { opacity: 1} 50% { opacity: 0.5} }
  /* NES-style scrollbar */ .cases-container::-webkit-scrollbar { height: 4px}
  .cases-container::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2)}
  .cases-container::-webkit-scrollbar-thumb { background: var(--nes-primary); border-radius: 2px}
</style>


