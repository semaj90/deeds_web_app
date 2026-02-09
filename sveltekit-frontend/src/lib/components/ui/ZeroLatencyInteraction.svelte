<!-- @migration-task Error while migrating Svelte code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected, token -->
<script lang="ts">
  // Migrated to $effect
  import { nesGPUBridge } from '$lib/gpu/nes-gpu-memory-bridge';
  import { getCachedPattern } from '$lib/services/chr-rom-precomputation-service';

  // Props (use simple export lets to be Svelte-compatible)
  interface Props { targetElementSelector: string, interactionType: 'hover' | 'click' | 'focus';
    patternPrefix: string;
    fallbackApiEndpoint: string;
    enableDebugMode: boolean;
  }

  let {
    targetElementSelector,
    interactionType,
    patternPrefix,
    fallbackApiEndpoint,
    enableDebugMode
  }: Props = $props();

  // State
  let isInitialized = $state<boolean>(false);
  let currentTooltip: HTMLElement | null = null;
  let interactionStats = $state({
    totalInteractions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
    zeroLatencyHits: 0
  });
  let trackedElements = new Set<HTMLElement>();
  let mousePosition = { x: 0, y: 0 };
  let observer: MutationObserver | null = null;
  $effect(() => {

    initializeZeroLatencySystem()
});

  async function initializeZeroLatencySystem(): Promise<void> {
    try {
      if (isInitialized) return
      if (enableDebugMode) console.log('âš¡ Initializing Zero-Latency UI Interaction System...');
      const targetElements = document.querySelectorAll<HTMLElement>(targetElementSelector);
      targetElements.forEach((element) => setupElementInteractions(element));
      document.addEventListener('mousemove', trackMousePosition);

      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement
              if (element.matches && element.matches(targetElementSelector)) {
                setupElementInteractions(element)}
              const childElements = element.querySelectorAll?.(targetElementSelector);
              childElements?.forEach(child => setupElementInteractions(child as HTMLElement))}
          })})});

      observer.observe(document.body, { childList: true,
	subtree: true });
      isInitialized = true
      if (enableDebugMode) console.log(`âœ… Zero-latency system initialized for ${targetElements.length} elements`)} catch (err) {
      console.warn('Initialization failed:', err)}
  }
  function setupElementInteractions(element: HTMLElement) {
    if (trackedElements.has(element)) return
    const elementId = getElementId(element);
    if (!elementId) return
    trackedElements.add(element);

    switch (interactionType) {
      case 'hover':
        element.addEventListener('mouseenter', (e) => handleZeroLatencyInteraction(e as Event, elementId, element));
        element.addEventListener('mouseleave', () => hideTooltip());
        break
      case 'click':
        element.addEventListener('click', (e) => handleZeroLatencyInteraction(e as Event, elementId, element));
        break
      case 'focus':
        element.addEventListener('focus', (e) => handleZeroLatencyInteraction(e as Event, elementId, element));
        element.addEventListener('blur', () => hideTooltip());
        // ensure focusable
        if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
        break}

    element.classList.add('zero-latency-enabled');
    element.setAttribute('data-chr-rom-ready', 'true')}
  async function handleZeroLatencyInteraction(_event: Event, elementId: string, target:HTMLElement): Promise<any> {
    const startTime = performance.now();
    interactionStats.totalInteractions++;

    try {
      const patternId = `${patternPrefix}_${elementId}`;

      // Try CHR-ROM (fast in-memory GPU-backed store)
      // Defensive runtime access: nesGPUBridge may not declare `getCHRROMPattern` on its TS type.
      // Cast to: any, verify it's a function and support sync or async results.'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _getCHRROMPattern = (nesGPUBridge as any).getCHRROMPattern
      let chrRomPattern: unknown = undefined
      if (typeof _getCHRROMPattern === 'function') {
        try {
          const maybe = _getCHRROMPattern.call(nesGPUBridge, patternId);
          chrRomPattern = maybe instanceof Promise ? await maybe : maybe} catch (err) {
          if (enableDebugMode) console.warn('getCHRROMPattern runtime error', err);
          chrRomPattern = undefined}
      }
      if (chrRomPattern) {
        const responseTime = performance.now() - startTime
        interactionStats.cacheHits++;
        interactionStats.zeroLatencyHits++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showInstantTooltip(String((chrRomPattern as any).renderableHTML || ''), target, responseTime);
        if (enableDebugMode) {
          console.log(`âš¡ ZERO LATENCY: ${patternId} displayed in ${responseTime.toFixed(3)}ms`)}
        return}

      // Try precomputation cache
      const cachedPattern: unknown = await getCachedPattern(patternId);
      if (cachedPattern) {
        const responseTime = performance.now() - startTime
        interactionStats.cacheHits++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showInstantTooltip(String((cachedPattern as any).renderableHTML || ''), target, responseTime);
        // store into CHR-ROM for even faster next time
        await storeInCHRROM(patternId, cachedPattern);
        if (enableDebugMode) {
          console.log(`ðŸš€ FAST CACHE: ${patternId} displayed in ${responseTime.toFixed(2)}ms`)}
        return}

      // Cache miss -> API fallback
      await handleCacheMiss(elementId, target, startTime)} catch (error) {
      console.warn('Zero-latency interaction failed:', error);
      await handleCacheMiss(elementId, target, startTime)}
  }
  async function handleCacheMiss(elementId: string, target:HTMLElement, startTime: number): Promise<any> {
    interactionStats.cacheMisses++;
    try {
      showLoadingTooltip(target);
      const apiResponse = await fetch(`${fallbackApiEndpoint}/${encodeURIComponent(elementId)}`);
      if (!apiResponse.ok) throw new Error('API error: ' + apiResponse.status);

      const data = await apiResponse.json();
      const responseTime = performance.now() - startTime
      const html = generateTooltipHTML(data);
      showInstantTooltip(html, target, responseTime);
      // data was unused inside cacheApiResult â€” remove it from the call/signature
      await cacheApiResult(elementId, html);
      if (enableDebugMode) {
        console.log(`ðŸ”„ API FALLBACK: ${elementId} displayed in ${responseTime.toFixed(2)}ms via ${fallbackApiEndpoint}`)}
    } catch (error) {
      console.error('API fallback failed:', error);
      showErrorTooltip(target)}
  }
  function showInstantTooltip(html: string, target:HTMLElement, responseTime: number) {
    hideTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'chr-rom-tooltip zero-latency-tooltip';
    tooltip.innerHTML = html
    if (enableDebugMode) {
      const perfIndicator = document.createElement('div');
      perfIndicator.className = 'perf-indicator';
      perfIndicator.textContent = `âš¡ ${responseTime < 1 ? '0ms' : responseTime.toFixed(1) + 'ms'}`;
      tooltip.appendChild(perfIndicator)}

    // Add to DOM, then position
    document.body.appendChild(tooltip);
    positionTooltip(tooltip, target);

    requestAnimationFrame(() => tooltip.classList.add('visible'));
    currentTooltip = tooltip
    updateStats(responseTime)}
  function showLoadingTooltip(target:HTMLElement) {
    hideTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'chr-rom-tooltip';
    tooltip.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div>Loadingâ€¦</div>
      </div>
    `;
    document.body.appendChild(tooltip);
    positionTooltip(tooltip, target);
    requestAnimationFrame(() => tooltip.classList.add('visible'));
    currentTooltip = tooltip}
  function showErrorTooltip(target:HTMLElement) {
    hideTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'chr-rom-tooltip';
    tooltip.innerHTML = `<div class="error-content">⚠️ Failed to load</div>`;
    document.body.appendChild(tooltip);
    positionTooltip(tooltip, target);
    requestAnimationFrame(() => tooltip.classList.add('visible'));
    currentTooltip = tooltip}
  function hideTooltip() {
    if (!currentTooltip) return
    currentTooltip.classList.remove('visible');
    const toRemove = currentTooltip
    currentTooltip = null
    setTimeout(() => toRemove.remove(), 200)}
  function positionTooltip(tooltip: HTMLElement, target:HTMLElement) {
    // ensure tooltip is measurable
    tooltip.style.position = 'absolute';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.zIndex = '10000';
    // measure & compute
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = window.scrollY + targetRect.top - tooltipRect.height - 10
    let left = window.scrollX + targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    if (left < 10) left = 10
    if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - 10 - tooltipRect.width
    if (top < 10) top = window.scrollY + targetRect.bottom + 10
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`}
  function trackMousePosition(event: MouseEvent) {
    mousePosition.x = event.clientX
    mousePosition.y = event.clientY}
  function getElementId(element: HTMLElement): string | null {
    return element.getAttribute('data-legal-id') ||
           element.getAttribute('data-case-id') ||
           element.getAttribute('data-document-id') ||
           element.id ||
           null}
  async function storeInCHRROM(patternId: string,
	pattern: unknown): Promise<any> {
    const p = pattern as any;
    try {
      const chrRomPattern = {
        renderableHTML: String(p.renderableHTML || '') type: p.type || 'summary_card',
        priority: 4,
	compressedData: new TextEncoder().encode(String(p.renderableHTML || '')) timestamp: Date.now()
      };
      // nesGPUBridge's exported type may not declare storeCHRROMPattern.'
      // call it defensively at runtime to avoid TS errors while preserving behavior.
      const storeFn = (nesGPUBridge as any).storeCHRROMPattern
      if (typeof storeFn === 'function') {
        await storeFn.call(nesGPUBridge, patternId, chrRomPattern)}
    } catch (error) {
      console.warn('Failed to store pattern in CHR-ROM:', error)}
  }
  async function cacheApiResult(elementId: string, html: string): Promise<any> {
    try {
      const chrRomPattern = {
        renderableHTML: html,
	type: 'summary_card',
        priority: 3,
	compressedData: new TextEncoder().encode(html),
	timestamp: Date.now()
      };
      const storeFn = (nesGPUBridge as any).storeCHRROMPattern
      if (typeof storeFn === 'function') {
        await storeFn.call(nesGPUBridge, `${patternPrefix}_${elementId}`, chrRomPattern)}

      // Optionally persist via precomputation service if available; left commented to avoid unused import.
    } catch (error) {
      console.warn('Failed to cache API result:', error)}
  }
  function generateTooltipHTML(data: Record<string, unknown>): string {
    // Minimal safe HTML generator; adapt as needed for domain
    try {
      if (!data) return `<div><strong>No data</strong></div>`;
      if (typeof data === 'string') return `<div>${escapeHtml(data)}</div>`;
      // attempt to render common fields
      const title = data.title || data.summary || data.name || null
      const snippet = data.snippet || data.summary || data.excerpt || JSON.stringify(data).slice(0, 300);
      return `
        <div>
          ${title ? `<h4>${escapeHtml(String(title))}</h4>` : ''}
          <div class="metadata">
            ${data.source ? `<span>${escapeHtml(String(data.source))}</span>` : ''}
            ${data.updatedAt ? `<span>${escapeHtml(String(data.updatedAt))}</span>` : ''}
          </div>
          <p>${escapeHtml(String(snippet))}</p>
        </div>
      `;
    } catch {
      return `<div><pre>${escapeHtml(String(data)).slice(0,300)}</pre></div>`}
  }
  function escapeHtml(unsafe: string) {
    return unsafe
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function updateStats(responseTime: number) {
    interactionStats.averageResponseTime = (
      (interactionStats.averageResponseTime * (interactionStats.totalInteractions - 1) + responseTime) /
      interactionStats.totalInteractions
    )}
  function cleanupSystem() {
    document.removeEventListener('mousemove', trackMousePosition);
    hideTooltip();
    trackedElements.forEach(element => {
      element.classList.remove('zero-latency-enabled');
      element.removeAttribute('data-chr-rom-ready')});
    trackedElements.clear();
    if (observer) {
      observer.disconnect();
      observer = null}
  }

  export function getPerformanceStats() {
    return {
      ...interactionStats,
      cacheHitRate: interactionStats.totalInteractions > 0 ?
        (interactionStats.cacheHits / interactionStats.totalInteractions) * 100 : 0,
      zeroLatencyRate: interactionStats.totalInteractions > 0 ?
        (interactionStats.zeroLatencyHits / interactionStats.totalInteractions) * 100 : 0
    }}
</script>

<!-- Debug, Panel -->
{#if enableDebugMode}
  <div class="zero-latency-debug-panel" aria-hidden={!enableDebugMode}>
    <h4>⚡ Zero-Latency Stats</h4>
    <div class="debug-stats">
      <div class="stat"><span class="label">Total Interactions:</span><span class="value">{interactionStats.totalInteractions}</span></div>
      <div class="stat"><span class="label">Cache Hits:</span><span class="value">{interactionStats.cacheHits}</span></div>
      <div class="stat"><span class="label">Zero-Latency Hits:</span><span class="value">{interactionStats.zeroLatencyHits}</span></div>
      <div class="stat"><span class="label">Average Response:</span><span class="value">{interactionStats.averageResponseTime.toFixed(2)}ms</span></div>
      <div class="stat"><span class="label">Hit Rate:</span><span class="value">{interactionStats.totalInteractions > 0 ? ((interactionStats.cacheHits / interactionStats.totalInteractions) * 100).toFixed(1) : 0}%</span></div>
    </div>
  </div>
{/if}

<style>
  /* Zero-latency interaction styles */
  :global(.zero-latency-enabled) { position: relative, cursor: pointer
   ;transition:all 0.1s ease;}
  :global(.zero-latency-enabled::after) { content: 'âš¡', position: absolute;
    top: -6px;
	right: -6px;
    font-size: 10px;
	opacity: 0.85
   ;color: #ffd700;
    pointer-events: none;}

  /* CHR-ROM Tooltip Styles */
  :global(.chr-rom-tooltip) {
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a), border: 2px solid #ffd700;
    border-radius: 8px
   ; padding: 12px;
    max-width: 300px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), color: #e0e0e0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.4;
	opacity: 0;
   transform: translateY(-5px) scale(0.95), transition: all 0.15s cubic-bezier(0.2, 0, 0.2, 1); }
  :global(.chr-rom-tooltip.visible) { opacity: 1, transform: translateY(0) scale(1); }
  :global(.chr-rom-tooltip.zero-latency-tooltip) {
    border-color: #00ff41;
    box-shadow: 0 4px 20px rgba(0, 255, 65, 0.2)}
  :global(.chr-rom-tooltip h4) {
    margin: 0, 0 8px 0;
    color: #ffd700;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;}
  :global(.chr-rom-tooltip p) { margin: 0 0 8px 0, color: #e0e0e0; }
  :global(.chr-rom-tooltip .metadata) { display: flex, gap: 8px; font-size: 10px;
	color: #b0b0b0; }
  :global(.chr-rom-tooltip .metadata span) { background: rgba(255, 215, 0, 0.08), padding: 2px 6px; border-radius: 4px;
	border: 1px solid rgba(255, 215, 0, 0.12); }
  :global(.chr-rom-tooltip .perf-indicator) { position: absolute, top: -8px;
    right: -8px;
	background: #00ff41;
    color: #000;
    font-size: 10px;
    font-weight: 700;
	padding: 2px 6px;
    border-radius: 4px
   ;border: 1px solid #000;
    box-shadow: 0 2px 8px rgba(0, 255, 65, 0.4)}
  :global(.chr-rom-tooltip .loading-content) { display: flex; align-items: center;
	gap:8px;}
  :global(.chr-rom-tooltip .loading-spinner) { width: 12px, height: 12px; border:2px solid #333; border-top:2px solid #ffd700; border-radius: 50%;
	animation: spin 1s linear infinite;
  }
  :global(.chr-rom-tooltip .error-content) { display: flex; align-items: center;
	gap: 6px;color:#ff0041;
  }

  @keyframes spin { 0% { transform: rotate(0deg)} 100% { transform: rotate(360deg)} }

  /* Debug Panel */
  .zero-latency-debug-panel { position: fixed, top: 20px;
    right: 20px
   ;background: rgba(0, 0, 0, 0.9), border: 1px solid #ffd700;
    border-radius: 6px;
	padding: 12px
   ; color: #e0e0e0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    z-index: 9999;
    backdrop-filter: blur(10px)}
  .zero-latency-debug-panel h4 { margin: 0 0 8px 0, color: #ffd700; font-size: 12px; text-align: center; }
  .debug-stats { display: flex; flex-direction: column;
	gap: 4px; }
  .stat { display: flex; justify-content: space-between; align-items: center;
	gap: 8px; }
  .stat .label { color: #b0b0b0; }
  .stat .value { font-weight: 600;
	color: #e0e0e0; }
  .stat .value.cache-hits { color: #00ff41; }
  .stat .value.zero-latency { color: #ffd700; font-weight: 700; }

  @media (max-width: 768px) {
    .zero-latency-debug-panel { top: 10px, right: 10px;left: 10px; font-size:9px;}
    :global(.chr-rom-tooltip) { max-width: 250px; font-size:11px;}
  }
</style>





