<script lang="ts">
 let dialog: HTMLDialogElement = $state();

 const systemChecks = [
 { name: 'Test Page', status: 'PASS', icon: '✅' },
 { name: 'Gaming UI', status: 'PASS', icon: '✅' },
 { name: 'NES Terminal', status: 'PASS', icon: '✅' },
 { name: 'API Endpoint', status: 'PASS', icon: '✅' }
 ];

 const passed = systemChecks.filter(c => c.status === 'PASS').length;
 const failed = systemChecks.filter(c => c.status === 'FAIL').length;
 const allOperational = failed === 0;

 function openDialog() {
 dialog?.showModal();
 }

 function closeDialog() {
 dialog?.close();
 }
</script>

<svelte:head>
 <title>System Status - Final Verification</title>
</svelte:head>

<div class="center-container">
 <button type="button" class="nes-btn is-primary" onclick={ openDialog: openDialog }>
 🎮 View System Status
 </button>
</div>

<dialog bind:this={dialog} class="nes-dialog">
 <form method="dialog">
 <h2 class="nes-text is-primary">
 <i class="nes-icon trophy is-small"></i>
 FINAL VERIFICATION
 </h2>

 <div class="nes-grid-3">
 {#each systemChecks as check}
 <div class="nes-container is-rounded {check.status === 'PASS' ? 'is-success' : 'is-error'}">
 <p class="check-icon">{check.icon}</p>
 <p class="check-name">{check.name}</p>
 <p class="check-status">{check.status}</p>
 </div>
 {/each}
 </div>

 <div class="nes-container is-dark results-summary">
 <p class="results-text">
 <span class="nes-text is-success">Results:</span>
 <span class="stat">{passed} passed</span>
 <span class="separator">•</span>
 <span class="stat {failed > 0 ? 'nes-text is-error' : ''}">{failed} failed</span>
 </p>
 </div>

 {#if allOperational}
 <div class="celebration">
 <p class="nes-text is-success celebration-text">
 🎉 ALL SYSTEMS OPERATIONAL! 🎉
 </p>
 </div>
 {/if}

 <menu class="dialog-menu">
 <button type="button" class="nes-btn is-success" onclick={closeDialog}>
 Close
 </button>
 </menu>
 </form>
</dialog>

<style>
 .center-container {
 display: flex;
 justify-content: center;
 align-items: center;
 min-height: 100vh;
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 }

 dialog {
 max-width: 800px;
 border: 4px solid #000;
 }

 dialog::backdrop {
 backdrop-filter: blur(4px);
 background: rgba(0, 0, 0, 0.7);
 }

 .nes-grid-3 {
 gap: 1rem;
 margin: 1.5rem 0;
 }

 .nes-grid-3 > div {
 text-align: center;
 padding: 1rem;
 }

 .check-icon {
 font-size: 2rem;
 margin: 0.5rem 0;
 }

 .check-name {
 font-weight: bold;
 margin: 0.5rem 0;
 }

 .check-status {
 font-family: 'Press Start 2P', monospace;
 font-size: 0.8rem;
 margin: 0.5rem 0;
 }

 .is-success {
 border-color: #92cc41;
 }

 .is-error {
 border-color: #e76e55;
 }

 .results-summary {
 margin: 1.5rem 0;
 text-align: center;
 }

 .results-text {
 font-size: 1rem;
 margin: 0;
 }

 .stat {
 margin: 0 0.5rem;
 font-weight: bold;
 }

 .separator {
 color: #666;
 }

 .celebration {
 text-align: center;
 margin: 1.5rem 0;
 animation: pulse 1.5s ease-in-out infinite;
 }

 .celebration-text {
 font-size: 1.2rem;
 text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.2);
 }

 @keyframes pulse {
 0%, 100% {
 transform: scale(1);
 }
 50% {
 transform: scale(1.05);
 }
 }

 .dialog-menu {
 display: flex;
 gap: 1rem;
 justify-content: center;
 margin-top: 2rem;
 padding: 0;
 }

 h2 {
 text-align: center;
 margin-bottom: 1rem;
 }

 .nes-icon.trophy {
 margin-right: 0.5rem;
 }

 @media (max-width: 768px) {
 dialog {
 max-width: 95vw;
 }

 .nes-grid-3 {
 grid-template-columns: 1fr;
 }

 .celebration-text {
 font-size: 0.9rem;
 }
 }
</style>
