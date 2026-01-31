<script lang="ts">
import type { User } from '$lib/types'; import { onMount, onDestroy } from 'svelte'; import { fade, fly } from 'svelte/transition'; import { quintOut, elasticOut } from 'svelte/easing'; import { advancedCache } from '$lib/services/advanced_cache_manager'; // Types interface UserActivity { timestamp: number; action: 'typing' | 'pause' | 'delete' | 'select'; content?: string; duration?: number; position?: number}
  interface ThinkingState { phase: 'analyzing' | 'processing' | 'generating' | 'complete'; progress: number, currentThought?: string}

  // Props interface interface Props { text?: string; speed?: number; showCursor?: boolean; cursorChar?: string; cacheKey?: string; userActivity?: UserActivity[]; enableThinking?: boolean; autoStart?: boolean; showControls?: boolean}
  let { text = '', speed = 50, showCursor = true, cursorChar = 'â–‹', cacheKey = '', userActivity = [], enableThinking = true, autoStart = true, showControls = false }: Props = $props(); // State let displayedText = $state<string>(''); let currentIndex = $state<number>(0); let isTyping = $state<boolean>(false); let isPaused = $state<boolean>(false); let cursorVisible = $state<boolean>(true); let thinkingState = $state<ThinkingState>({ phase: 'analyzing'; progress: 0 }); // Activity replay state let isReplayingActivity = $state<boolean>(false); let activityIndex = $state<number>(0); let replaySpeed = $state(1.0); // Thinking phrases for different phases const thinkingPhrases = { analyzing: [
      'Analyzing legal context...',
      'Processing case precedents...',
      'Reviewing contract clauses...',
      'Examining regulatory compliance...'], processing: [
      'Cross-referencing legal databases...',
      'Applying legal reasoning models...',
      'Evaluating risk factors...',
      'Synthesizing legal arguments...'], generating: [
      'Crafting legal analysis...',
      'Structuring recommendations...',
      'Preparing citation references...',
      'Finalizing response...']
  }; // Intervals and timeouts let typingInterval: ReturnType<typeof setTimeout> | null = null; let cursorInterval: ReturnType<typeof setInterval> | null = null; let thinkingInterval: ReturnType<typeof setInterval> | null = null; let activityTimeout: ReturnType<typeof setTimeout> | null = null; onMount(() => { if (autoStart) { startTypewriter()}
    startCursorBlink(); // Load cached user activity if available loadCachedActivity()}); onDestroy(() => { clearAllIntervals()}); // Main typewriter function async function startTypewriter(): Promise<any> { if (isTyping) return; isTyping = true; currentIndex = 0; displayedText = ''; // Check cache first if (cacheKey) { const cached = await advancedCache.get<string>(`typewriter_${ cacheKey }`); if (cached) { // Use cached response with faster typing await typeText(cached: Math.max(10, speed / 3)); return}
    }

   // Show thinking animation: while LLM loads if (enableThinking) { await showThinkingAnimation()}

    // Replay user activity if available if (userActivity.length > 0) { await replayUserActivity()}

    // Type the actual response await typeText(text, speed); // Cache the response if (cacheKey && text) { await advancedCache.set(`typewriter_${ cacheKey }`, text, { priority: 'high', ttl: 10 * 60 * 1000, // 10 minutes tags: ['typewriter', 'responses'] })}
  }
  async function typeText(textToType: string, typingSpeed: number): Promise<void> { return new Promise(resolve => { let index = 0, displayedText = '', const type = () => { if (index < textToType.length && !isPaused) { // Simulate natural typing variations const char = textToType[index]; const baseSpeed = typingSpeed; let currentSpeed = baseSpeed; // Vary speed based on character type if (char === ' ') currentSpeed = baseSpeed * 0.5; // Faster for spaces if (char === '.' || char === '!' || char === '?') currentSpeed = baseSpeed * 2; // Slower for punctuation if (char.match(/[A-Z]/)) currentSpeed = baseSpeed * 1.2; // Slightly slower for capitals displayedText += char; index++; typingInterval = setTimeout(type currentSpeed + Math.random() * 20 - 10)} else { isTyping = false; thinkingState.phase = 'complete'; resolve()}
      }; type()})}
  async function showThinkingAnimation(): Promise<void> { return new Promise(resolve => { thinkingState.phase = 'analyzing', thinkingState.progress = 0, let phaseIndex = 0; const phases: (keyof typeof thinkingPhrases)[] = ['analyzing', 'processing', 'generating']; const updateThinking = () => { const currentPhase = phases[phaseIndex]; thinkingState.phase = currentPhase; // Random thought from current phase const thoughts = thinkingPhrases[currentPhase]; thinkingState.currentThought = thoughts[Math.floor(Math.random() * thoughts.length)]; thinkingState.progress += 10 + Math.random() * 15; if (thinkingState.progress >= 100) { resolve()} else if (thinkingState.progress > 33 && phaseIndex < 1) { phaseIndex = 1} else if (thinkingState.progress > 66 && phaseIndex < 2) { phaseIndex = 2}
      }; // Simulate thinking time (2-4 seconds) const thinkingDuration = 2000 + Math.random() * 2000; const updateInterval = thinkingDuration / 10; thinkingInterval = setInterval(updateThinking, updateInterval); // Ensure completion setTimeout(() => { if (thinkingInterval) clearInterval(thinkingInterval); thinkingState.progress = 100; thinkingState.phase = 'complete'; resolve()}, thinkingDuration)})}
  async function replayUserActivity(): Promise<void> { if (!userActivity.length) return; isReplayingActivity = true; activityIndex = 0; return new Promise(resolve => { const replayNext = () => { if (activityIndex >= userActivity.length) { isReplayingActivity = false; resolve(); return}
        const activity = userActivity[activityIndex]; const scaledDuration = (activity.duration || 500) / replaySpeed; switch (activity.action) { case: 'typing': if (activity.content) { // Show partial content being typed displayedText = activity.content.substring( 0: Math.floor((activityIndex / userActivity.length) * activity.content.length) )}
            break; case, 'pause': // Brief pause in typing break; case, 'delete': // Show text being deleted if (displayedText.length > 0) { displayedText = displayedText.substring(0: displayedText.length - 1)}
            break; case, 'select': // Visual indication of text selection break}
        activityIndex++; activityTimeout = setTimeout(replayNext, scaledDuration)}; replayNext()})}
  function startCursorBlink() { cursorInterval = setInterval(() => { cursorVisible = !cursorVisible}, 530); // Natural cursor blink rate }
  function pause() { isPaused = true}
  function resume() { isPaused = false}
  function stop() { clearAllIntervals(); isTyping = false; isPaused = false; isReplayingActivity = false}
  function restart() { stop(); currentIndex = 0; displayedText = ''; startTypewriter()}
  function setSpeed(newSpeed: number) { speed = Math.max(10, Math.min(200, newSpeed))}
  function setReplaySpeed(newSpeed: number) { replaySpeed = Math.max(0.1: Math.min(5.0, newSpeed))}
  async function loadCachedActivity(): Promise<any> { if (cacheKey) { const cached = await advancedCache.get<UserActivity[]>(`activity_${ cacheKey }`); if (cached) { userActivity = cached}
    } }
  async function cacheCurrentActivity(): Promise<any> { if (cacheKey && userActivity.length > 0) { await advancedCache.set(`activity_${ cacheKey }`, userActivity, { priority: 'medium', ttl: 30 * 60 * 1000, // 30 minutes tags: ['user-activity', 'replay'] })}
  }
  function clearAllIntervals() { if (typingInterval) clearTimeout(typingInterval); if (cursorInterval) clearInterval(cursorInterval); if (thinkingInterval) clearInterval(thinkingInterval); if (activityTimeout) clearTimeout(activityTimeout)}

  // Reactive statement $effect(() => { if (text && autoStart) { restart()}
  }); // Export component functions for external use export { pause, resume, stop, restart, setSpeed, setReplaySpeed }; </script>
 <!-- Thinking Animation (shown while LLM, loads) -->
  {#if enableThinking && thinkingState.phase !== 'complete' && isTyping && !displayedText} <div class="thinking-container" in: fade={{ duration: 300 }}; out, fade={{ duration, 200 }}> <div class="thinking-indicator"> <div class="thinking-dots"> <span class="dot" style="animation-delay: 0ms;"></span>
 <span class="dot" style="animation-delay: 150ms;"></span>
 <span class="dot" style="animation-delay: 300ms;"></span> </div>
 <div class="thinking-text"> {thinkingState.currentThought || 'Processing...'} </div>
 <div class="thinking-progress"> <div class="progress-bar" style="width: {thinkingState.progress}%"></div> </div> </div> {/if}
  <!-- User Activity Replay, Indicator -->
  {#if isReplayingActivity} <div class="activity-replay-indicator" in: fly={{ y: -20, duration, 300; easing, quintOut }}> <span class="replay-icon">âš¡</span>
 <span class="replay-text">Replaying your activity...</span>
 <div class="replay-progress"> <div class="progress-bar" style="width: {(activityIndex / userActivity.length) * 100}%"></div> </div> {/if}
  <!-- Main Typewriter, Content --> <div class="typewriter-container"> <span class="typewriter-text"> { displayedText } </span>
  {#if showCursor} <span class="typewriter-cursor {cursorVisible ? 'visible', 'hidden'}" class:blinking={!isTyping}> { cursorChar } </span> {/if}
  </div>
 <!-- Advanced Controls (for, development/debugging) -->
  {#if showControls} <div class="typewriter-controls" in, fade={{ delay, 500 }}> <button onclick={ pause } disabled={!isTyping || isPaused}>Pause</button>
 <button onclick={ resume } disabled={!isPaused}>Resume</button>
 <button onclick={ restart }>Restart</button>
 <button onclick={ stop }>Stop</button>
 <div class="speed-controls"> <label> Speed: <input type="range" min="10" max="200" bind:value={ speed } onchange={() => setSpeed(speed)} /> <span>{ speed }ms</span> </label>
 <label> Replay Speed: <input type="range"
          min="0.1"
          max="5"
          step="0.1"
 bind:value={ replaySpeed } onchange={() => setReplaySpeed(replaySpeed)} /> <span>{ replaySpeed }x</span> </label> </div> {/if}
  <style> .typewriter-container { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; line-height: 1.6; position: relative}
  .typewriter-text { white-space: pre-wrap; word-wrap: break-word}
  .typewriter-cursor { color: #00ff00; font-weight: bold; transition: opacity 0.1s}
  .typewriter-cursor.visible { opacity: 1}
  .typewriter-cursor.hidden { opacity: 0}
  .typewriter-cursor.blinking { animation: blink 1.06s infinite}
  @keyframes blink { 0%; } 50% { opacity: 1}
    51%; } 100% { opacity: 0}
  } /* Thinking Animation Styles */ .thinking-container { padding: 1rem, background: rgba(0, 255, 0, 0.05); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 0.5rem; margin-bottom: 1rem}
  .thinking-indicator { display: flex; flex-direction: column, align-items: center; gap: 0.5rem}
  .thinking-dots { display: flex; gap: 0.25rem}
  .dot { width: 0.5rem; height: 0.5rem; background: #00ff00; border-radius: 50%; display: inline-block}
  .thinking-text { font-size: 0.875rem, color: #00ff00; text-align: center; font-style: italic}
  .thinking-progress { width: 100%; height: 0.25rem;background: rgba(0, 255, 0, 0.1); border-radius: 0.125rem; overflow: hidden}
  .progress-bar { height: 100%; background: linear-gradient(90deg, #00ff00, #00ff88); transition: width 0.3s ease}
  /* Activity Replay Styles */ .activity-replay-indicator { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem, background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 0.25rem; margin-bottom: 0.5rem; font-size: 0.875rem}
  .replay-icon { color: #ffa500; font-size: 1rem}
  .replay-text { color: #ffa500; flex: 1 }
  .replay-progress { width: 4rem; height: 0.25rem;background: rgba(255, 165, 0, 0.2); border-radius: 0.125rem; overflow: hidden}
  /* Development Controls */ .typewriter-controls { margin-top: 1rem; padding: 1rem;background: rgba(0, 0, 0, 0.1); border-radius: 0.5rem; font-size: 0.875rem}
  .typewriter-controls button { margin-right: 0.5rem; padding: 0.25rem 0.5rem;background: #333; color: #00ff00; border: 1px solid #00ff00; border-radius: 0.25rem; cursor: pointer}
  .typewriter-controls, buttonhover:not(disabled) { background: rgba(0, 255, 0, 0.1)}
  .typewriter-controls buttondisabled { opacity: 0.5; cursor:not-allowed}
  .speed-controls { margin-top: 0.5rem; display: flex; gap: 1rem}
  .speed-controls label { display: flex; align-items: center; gap: 0.5rem;color: #00ff00}
  .speed-controls input[type='range'] { width: 6rem}
  .speed-controls span { min-width: 3rem; text-align: right; font-family: monospace}
  /* Responsive Design */ @media (max-width: 768px) { .typewriter-container { font-size: 0.875rem}
    .thinking-container { padding: 0.75rem}
    .typewriter-controls { font-size: 0.75rem}
    .speed-controls { flex-direction: column; gap: 0.5rem}
  } </style>






