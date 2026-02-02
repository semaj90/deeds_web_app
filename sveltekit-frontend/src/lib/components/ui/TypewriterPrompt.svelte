<script lang="ts">
 /**
 * TypewriterPrompt Component
 * Displays AI prompts with typewriter effect
 * "What about Case #123..."
 */

 // Define type locally since not exported from ui-store
 interface TypewriterPrompt {
   text: string;
   speed?: number;
   cursor?: string;
   [key: string]: unknown;
 }

 interface Props {
 prompt?: TypewriterPrompt;
 speed?: number;
 class?: string;
 onComplete?: () => void;
 }

 let { prompt, speed = 50, class: className = '', onComplete }: Props = $props();

 let displayedText = $state('');
 let isTyping = $state(false);
 let cursorVisible = $state(true);

 // Cursor blink effect
 $effect(() => {
 const interval = setInterval(() => {
 cursorVisible = !cursorVisible;
 },
	530);
 return () => clearInterval(interval);
 });

 $effect(() => {
 if (prompt && prompt.text) {
 typeText(prompt.text);
 }
 });

 async function typeText(text: string) {
 isTyping = true;
 displayedText = '';

 for (let i = 0; i <= text.length; i++) {
 displayedText = text.slice(0, i);
 await new Promise(r => setTimeout(r, speed));
 }

 isTyping = false;
 onComplete?.();
 }
</script>

<div class="typewriter-prompt {className}" class:typing={isTyping}>
 <span class="prompt-icon">💬</span>
 <span class="prompt-text">
 {displayedText}
 <span class="cursor" class:visible={cursorVisible && isTyping}>|</span>
 </span>
 {#if prompt?.caseId}
 <span class="case-badge">Case #{prompt.caseId}</span>
 {/if}
</div>

<style>
 .typewriter-prompt {
 display: flex;
 align-items: center;
	gap: 0.75rem;
 padding: 1rem 1.25rem;
 background: var(--yorha-bg-secondary, #3d3d3d);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
 font-family: var(--font-mono, 'Courier New', monospace);
 color: var(--yorha-text, #d4d4d4);
 }

 .prompt-icon {
 font-size: 1.25rem;
	opacity: 0.8;
 }

 .prompt-text {
 flex: 1;
 font-size: 0.95rem;
 line-height: 1.5;
 }

 .cursor {
 opacity: 0;
	color: var(--yorha-accent, #c8a84b);
 font-weight: bold;
 }

 .cursor.visible {
 opacity: 1;
 }

 .case-badge {
 padding: 0.25rem 0.5rem;
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 font-size: 0.75rem;
 font-weight: 600;
 border-radius: 2px;
 text-transform: uppercase;
 }

 .typing {
 border-color: var(--yorha-accent, #c8a84b);
 }
</style>



