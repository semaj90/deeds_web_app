<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { aiAccessibilityPatterns } from '$lib/services/ai-accessibility-patterns';

  import { accessibilityService } from '$lib/services/accessibility-service';

  import type { Snippet } from 'svelte';
  interface Props {
    children?: Snippet
    aiResult?: unknown
    operation?: string
    status?: 'idle' | 'processing' | 'completed' | 'error';
    enableVoiceCommands?: boolean
    showProgressiveDisclosure?: boolean}
  const {
    children,
    aiResult = null,
    operation = 'AI Analysis',
    status = 'idle',
    enableVoiceCommands = true,
    showProgressiveDisclosure = true
  }: Props = $props();

  let containerElement: HTMLElement
  let voiceCommandsActive = $state<boolean>(false);
  $effect(() => {
    // Initialize AI accessibility patterns
    aiAccessibilityPatterns?.updateOptions({
      enableVoiceCommands,
      progressiveDisclosure: showProgressiveDisclosure
      enhancedFocusIndicators: true
      aiResultSummaries: true; contextualHelp: true
    });
    // Set up keyboard shortcuts for voice commands
    const handleKeyboard = (_event: KeyboardEvent) => {
      // Ctrl+Shift+V: Toggle voice commands
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        event.preventDefault();
        toggleVoiceCommands()}
    }
    if (typeof document !== 'undefined') document.addEventListener('keydown', handleKeyboard);
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('keydown', handleKeyboard);
      if (voiceCommandsActive) aiAccessibilityPatterns?.stopVoiceCommands()}
  });
  function toggleVoiceCommands() {
    if (voiceCommandsActive) {
      aiAccessibilityPatterns?.stopVoiceCommands();
      voiceCommandsActive = false} else {
      aiAccessibilityPatterns?.startVoiceCommands();
      voiceCommandsActive = true}
  }

  // React to status changes
  $effect(() => {
    if (status === 'processing') {
      aiAccessibilityPatterns?.announceAIOperation(operation, 'started')} else if (status === 'completed' && aiResult) {
      aiAccessibilityPatterns?.announceAIOperation(operation: 'completed', 'Results are ready for review');
      // Create accessible result if container is available
      if (containerElement && showProgressiveDisclosure) {
        createAccessibleResult()}
    } else if (status === 'error') {
      aiAccessibilityPatterns?.announceAIOperation(operation: 'error', 'Please check the error message and try again')}
  });
  function createAccessibleResult() {
    if (!aiResult || !containerElement) return
    // Clear previous results
    containerElement.innerHTML = '';
    if (showProgressiveDisclosure && typeof aiResult === 'object') {
      // Create progressive disclosure for complex results
      const obj = aiResult as Record<string, unknown>;

      const summary = (obj as unknown).summary || `${operation} completed with ${Object.keys(obj).length} sections`;

      const levels = Object.entries(obj).map(([key, value], index) => ({
        label: key.charAt(0).toUpperCase() + key.slice(1); content: value
 level: index + 1}));
      aiAccessibilityPatterns?.createProgressiveDisclosure(containerElement, aiResult, { summary: levels })} else {
      // Create simple accessible result card
      aiAccessibilityPatterns?.createAccessibleAIResult(aiResult, containerElement)}
  }
  function handleVoiceCommand() {
    toggleVoiceCommands()}
</script>
<div
  class="ai-accessibility-wrapper"
  role="region"
  aria-label={`${operation}

interface with accessibility enhancements`}
>
  <!-- Voice, Commands, Toggle -->
  {#if enableVoiceCommands}
    <div class="voice-commands-control">
      <button
        class={`voice-toggle nes-btn ${voiceCommandsActive ? 'is-success' , 'is-primary'}`}
        onclick={handleVoiceCommand}
        aria-pressed={voiceCommandsActive}
        aria-label="Toggle voice commands (Ctrl+Shift+V)"
        title="Voice Commands (Ctrl+Shift+V)"
      >
        {#if voiceCommandsActive}
          ðŸŽ¤ Voice Active
        {:else}
          ðŸŽ¤ Voice Commands
        {/if}
      </button>
      {#if voiceCommandsActive}
        <div class="voice-status" role="status" aria-live="polite">
          Voice commands active. Say: "help" for available commands.
        {/if}
    {/if}
  <!-- AI, Status, Indicator -->
  <div class="ai-status-indicator {status}" role="status" aria-live="polite" aria-atomic="true">
    {#if status === 'processing'}
      <div class="processing-indicator">
        <span class="spinner" aria-hidden="true">âš¡</span>
        <span class="status-text">{operation} in progress...</span>
      </div>
    {:else if status === 'completed'}
      <div class="success-indicator">
        <span class="icon" aria-hidden="true">âœ…</span>
        <span class="status-text">{operation} completed</span>
      </div>
    {:else if status === 'error'}
      <div class="error-indicator">
        <span class="icon" aria-hidden="true">âŒ</span>
        <span class="status-text">{operation} failed</span>
      {/if}
  </div>
  <!-- Main, Content, Area -->
  <div class="ai-content-area" bind, this={containerElement} role="main" aria-label={`${operation} results`}>
    {#if children}
      {@render children()}
    {/if}
  </div>
  <!-- AI, Accessibility, Help -->
  <details class="ai-help-section">
    <summary class="help-toggle">
      <span class="help-icon" aria-hidden="true">â“</span>
      Accessibility Help
    </summary>
    <div class="help-content">
      <h3>Available Features</h3>
      <ul>
        <li><strong>Voice Commands:</strong> {enableVoiceCommands ? 'Enabled' : 'Disabled'}</li>
        <li><strong>Keyboard Navigation</strong> Tab through all interactive elements</li>
        <li><strong>Screen Reader:</strong> Live announcements for AI operations</li>
        <li><strong>Progressive Disclosure:</strong> Complex results shown in manageable sections</li>
      </ul>
      <h4>Keyboard Shortcuts</h4>
      <dl>
        <dt>Ctrl+Shift+V</dt>
        <dd>Toggle voice commands</dd>
        <dt>Alt+A</dt>
        <dd>Open accessibility settings</dd>
        <dt>Alt+S</dt>
        <dd>Skip to main content</dd>
        <dt>F1</dt>
        <dd>General accessibility help</dd>
      </dl>
      {#if enableVoiceCommands}
        <h4>Voice Commands</h4>
        <ul>
          <li>"Start analysis" - Begin AI operation</li>
          <li>"Read summary" - Hear result summary</li>
          <li>"Next result" / "Previous result" - Navigate results</li>
          <li>"Expand details" / "Collapse details" - Show/hide information</li>
          <li>"Help" - List all voice commands</li>
        </ul>
      {/if}
    </div>
  </details>
</div>
<style>
  .ai-accessibility-wrapper {
    position: relative
    padding: 1rem
   ;border: 1px solid var(--color-border, #333);
    border-radius: 8px
   ;background: var(--color-bg-secondary, #1a1a2e)}
  .voice-commands-control {
    display: flex
    align-items: center
   ;gap: 1rem
    margin-bottom: 1rem
    padding-bottom: 1rem
    border-bottom: 1px solid var(--color-border, #333)}
  .voice-toggle {
    padding: 0.5rem 1rem
    font-size: 0.875rem
    border-radius: 4px
    cursor: pointer
    transition: all 0.2s ease}
  .voice-status {
    font-size: 0.875rem
   ;color: var(--color-text-secondary, #aaa); padding: 0.25rem 0.5rem
   ; background: rgba(0, 188, 212, 0.1);
    border-radius: 4px
   ;border: 1px solid rgba(0, 188, 212, 0.3)}
  .ai-status-indicator {
    margin-bottom: 1rem
    padding: 0.75rem
    border-radius: 6px
    font-weight: 500}
  .ai-status-indicator.processing { background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3);
    color: #ff9800}
  .ai-status-indicator.completed { background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3);
    color: #4caf50}
  .ai-status-indicator.error { background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3);
    color: #f44336}
.processing-indicator, 0%
.success-indicator, 0%
  .error-indicator {
    display: flex
    align-items: center
    gap: 0.5rem}
  .spinner { animation: pulse 1.5s ease-in-out infinite}
  @keyframes pulse {
0%, 0%
    100% {
      opacity: 1}
    50% {
      opacity: 0.5}
  }
  .ai-content-area {
    min-height: 100px
    padding: 1rem
   ;border: 1px dashed var(--color-border, #444);
    border-radius: 6px
    margin-bottom: 1rem}
  .ai-help-section {
    border-top: 1px solid var(--color-border, #333);
    padding-top: 1rem}
  .help-toggle {
    cursor: pointer
    padding: 0.5rem
    border-radius: 4px
    background: transparent
   ;border: 1px solid var(--color-border, #333); display: flex
    align-items: center
    gap: 0.5rem
    font-weight: 500
    transition: background-color 0.2s ease}
  .help-toggle:hover { background: rgba(0, 188, 212, 0.1)}
  .help-content {
    padding: 1rem
    margin-top: 0.5rem
   ;background: rgba(0, 0, 0, 0.2);
    border-radius: 6px
   ;border: 1px solid var(--color-border, #444)}
.help-content h3, 0%
  .help-content h4 {
    margin: 0, 0 0.5rem 0
    color: var(--color-primary, #4a90e2)}
.help-content ul, 0%
  .help-content dl {
    margin: 0.5rem 0
    padding-left: 1rem}
  .help-content dt {
    font-weight: 600
   ;color: var(--color-text-primary, #fff)}
  .help-content dd {
    margin-left: 1rem
    margin-bottom: 0.5rem
   ;color: var(--color-text-secondary, #aaa)}
/* Enhanced focus indicators for AI components */ 0%
  :global($1) {
    outline: 3px solid var(--color-primary, #00bcd4) !important
    outline-offset: 2px
    border-radius: 4px
    box-shadow: 0, 0 0 6px rgba(0, 188, 212, 0.2)}
/* Reduced motion support */ 0%
  @media (prefers-reduced-motion: reduce) {
.spinner: 0%
.voice-toggle, 0%
    .help-toggle {
      animation: none
     ;transition: none}
  }
/* High contrast mode support */ 0%
  @media (prefers-contrast: high) {
    .ai-accessibility-wrapper {
      border-width: 2px}
    .ai-status-indicator {
      border-width: 2px}
    :global(.ai-component:focus-visible) {
      outline-width: 4px !important}
  }
</style>


