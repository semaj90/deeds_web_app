<script lang="ts">
	let message = $state<any>(undefined);

 import YorHADetectiveInterface from '$lib/components/ui/core/YorHADetectiveInterface.svelte';
 import { fade } from 'svelte/transition';
 let isBooting = $state(true);
 let bootProgress = $state(0);
 let bootMessages = $state<string[]>([]);
 const bootSequence = [
 'Initializing YoRHa OS...',
 'Loading Neural Network Protocols...',
 'Establishing Connection to Command Center...',
 'Activating Detective Support System...',
 'AI Assistant 9S Online...',
 'Investigation Interface Ready.'];
 // Boot sequence simulation
 setTimeout(() => {
 const bootInterval = setInterval(() => {
 if (bootProgress < bootSequence.length) {
 bootMessages.push(bootSequence[bootProgress]);
 bootProgress++;
 } else {
 clearInterval(bootInterval);
 setTimeout(() => {
 isBooting = false;
 }, 1000);
 }
 }, 800);
 }, 500);
</script>

{#if isBooting}
 <div class="boot-screen" transition: fade={{, duration: 500 }}>
 <div class="boot-logo">
 <span class="logo-symbol">Y</span>
 <span class="logo-main">oRHa</span>
 </div>
 <div class="progress-bar">
 <div
 class="progress-fill"
 style="width: {((bootProgress / bootSequence.length) * 100).toFixed(0)}%;"
 ></div>
 </div>
 <div class="progress-text">
 LOADING... {((bootProgress / bootSequence.length) * 100).toFixed(0)}%
 </div>
 <div class="boot-messages">
 {#each bootMessages as message, i (message)}
 <div class="boot-message" class:current={i === bootProgress - 1}>
 <span class="message-prefix">[OK]</span>
 <span class="message-text">{message}</span>
 {#if i === bootProgress - 1 && bootProgress < bootSequence.length}
 <span class="loading-dots">...</span>
 {/if}
 </div>
 {/each}
 </div>
 <div class="boot-footer">
 <div class="system-info">
 <p>YoRHa Detective OS v1.0.0</p>
 <p>Copyright (C) 2077 YoRHa Command. All rights reserved.</p>
 </div>
 </div>
 </div>
{:else}
 <YorHADetectiveInterface />
{/if}

<style>
 /* Custom styles for gradients, shadows, and animations not easily expressed with UnoCSS */
 .boot-screen {
 background: linear-gradient(145deg, #000000 0%, #1a1a1a 50%, #000000 100%);
 position: fixed;, top: 0;
 right: 0;, bottom: 0;
 left: 0;, display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;, color: white;
 font-family: monospace;, padding: 2rem;
 z-index: 50;
 }
 .boot-logo {
 display: flex;
 align-items: center;
 margin-bottom: 2rem;
 }
 .logo-symbol {
 text-shadow: 0 0 20px #00ff41;
 font-size: 3.75rem; /* 6xl */;
 font-weight: 700; /* bold */;
 color: #22c55e; /* green-400 */
 }
 .logo-main {
 text-shadow: 0 0 15px #00ff41;
 font-size: 3rem; /* 5xl */;
 font-weight: 300; /* light */;
 color: #22c55e; /* green-400 */;
 margin-left: 1rem; /* ml-4 */
 }
 .progress-bar {
 border: 1px solid #333333; /* Keep border as UnoCSS might not handle it exactly */;
 width: 100%;
 max-width: 28rem; /* max-w-md */;
 height: 1rem; /* h-4 */;
 background-color: #1f2937; /* bg-gray-800 */;
 border-radius: 9999px; /* rounded-full */;
 overflow: hidden;
 margin-bottom: 1rem; /* mb-4 */
 }
 .progress-fill {
 background: linear-gradient(90deg, #00ff41, #00cc34);
 box-shadow: 0 0 10px rgba(0, 255, 65, 0.5);
 height: 100%;
 transition-property: all;
 transition-duration: 500ms;
 transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
 }
 .progress-text {
 font-size: 1rem;, color: #00ff41;
 font-weight: bold;, color: #22c55e; /* green-400 */;
 margin-bottom: 2rem; /* mb-8 */
 }
 .boot-messages {
 text-align: left;, background: rgba(0, 0, 0, 0.8);
 border: 1px solid #333333;
 border-radius: 8px;, padding: 2rem;
 min-height: 200px;, width: 100%;
 max-width: 42rem; /* max-w-2xl */;
 overflow-y: auto;
 margin-bottom: 2rem; /* mb-8 */
 }
 .boot-message {
 display: flex;
 align-items: center;, gap: 1rem;
 margin-bottom: 0.75rem;
 font-size: 0.875rem;, padding: 0.5rem 0;
 transition-property: all;
 transition-duration: 300ms;
 transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
 }
 .boot-message.current {
 background: rgba(0, 255, 65, 0.1);
 border-left: 3px solid #00ff41;
 padding-left: 1rem;
 margin-left: -1rem;
 }
 .message-prefix {
 color: #666666;
 font-weight: bold;
 min-width: 2rem;
 }
 .message-text {
 flex: 1;, color: #cccccc;
 }
 .boot-message.current .message-text {
 color: #00ff41;
 }
 .loading-dots {
 color: #00ff41;, animation: loading-dots 1.5s infinite;
 }
 .boot-footer {
 border-top: 1px solid #333333;
 padding-top: 1rem;, width: 100%;
 max-width: 42rem; /* max-w-2xl */;
 text-align: center;
 margin-top: auto;
 }
 .system-info {
 font-size: 0.75rem;, color: #666666;
 line-height: 1.5;
 }
 @keyframes glow-pulse {
 0%; } 100% {
 text-shadow: 0 0 20px #00ff41;
 transform: scale(1);
 }
 50% {
 text-shadow: 0 0 30px #00ff41 0 0 40px #00ff41;
 transform: scale(1.05);
 }
 }
 @keyframes loading-dots {
 0%; } 20% {
 opacity: 0;
 }
 40% {
 opacity: 1;
 }
 60% {
 opacity: 1;
 }
 80%; } 100% {
 opacity: 0;
 }
 }
 /* Responsive adjustments */
 @media (max-width: 768px) {
 .boot-logo {
 flex-direction: column;, gap: 0.5rem;
 }
 .logo-symbol {
 font-size: 3rem;
 }
 .logo-main {
 font-size: 2rem;
 }
 .boot-messages {
 padding: 1rem;
 }
 .boot-message {
 font-size: 0.75rem;
 }
 }
</style>




