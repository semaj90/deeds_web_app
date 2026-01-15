<!-- Rust WASM Bridge Demo, Component --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';
 import { initRustBridge, getSystemInfo, detectGpuAcceleration, getPerformanceMetrics, checkWindowsServices, processLegalTextFast, isRustBridgeAvailable, getBridgeStatus, benchmarkRustBridge } from '$lib/wasm/rust-bridge';
 import type { SystemInfo, PerformanceMetrics } from '$lib/types/rust-bridge'; // Reactive state let bridgeInitialized = $state<boolean>(false);
   let systemInfo = $state<SystemInfo | null>(null);
   let gpuInfo = $state<string[]>([]);
   let performanceMetrics = $state<PerformanceMetrics | null>(null);
   let windowsServices = $state<unknown[]>([]);
   let bridgeStatus = $state<any>(null);
   let benchmarkResults = $state<any>(null); // Demo state let sampleText = $state<string>('This is a sample legal document for processing with the Rust WASM bridge.');
   let textProcessingResult = $state<any>(null);
   let isLoading = $state<boolean>(false);
   let errorMessage = $state<string | null>(null); $effect(() => { (async () => { try { isLoading = true; errorMessage = null; // Initialize the Rust WASM bridge const success = await initRustBridge(); bridgeInitialized = succes; if (success) { // Load initial data await loadSystemData(); bridgeStatus = getBridgeStatus()} else { errorMessage = 'Failed to initialize Rust WASM bridge. Make sure to build the WASM package first.'}
      } catch (error) { console.error('Error initializing Rust bridge:', error); errorMessage = `Initialization error: ${ error }`} finally { isLoading = false}
    })()});
  async function loadSystemData(): Promise<any> { try { systemInfo = getSystemInfo(); gpuInfo = detectGpuAcceleration(); performanceMetrics = getPerformanceMetrics(); windowsServices = checkWindowsServices()} catch (error) { console.error('Error loading system data:', error); errorMessage = `Failed to load system data: ${ error }`}
  }
  async function processText(): Promise<any> { if (!bridgeInitialized) return; try { isLoading = true;
   const result = processLegalTextFast(sampleText); textProcessingResult = result} catch (error) { console.error('Error processing text:', error); errorMessage = `Text processing error: ${ error }`} finally { isLoading = false}
  }
  async function runBenchmark(): Promise<any> { if (!bridgeInitialized) return; try { isLoading = true; benchmarkResults = await benchmarkRustBridge()} catch (error) { console.error('Error running benchmark:', error); errorMessage = `Benchmark error: ${ error }`} finally { isLoading = false}
  }
  function formatMemory(bytes: number): string { const gb = bytes / (1024 * 1024 * 1024); return `${gb.toFixed(2)} GB`}
</script> <div class="rust-bridge-demo"> <div class="demo-header"> <h2>ðŸ¦€ Rust WASM Bridge Demo</h2> <div class="status-indicator" class:initialized={ bridgeInitialized }; class:error={!!errorMessage}> {#if isLoading} <span class="loading">â³ Loading...</span> {:else if bridgeInitialized} <span class="success">âœ… Bridge Active</span> {:else if errorMessage} <span class="error">âŒ Bridge Error</span> {:else} <span class="pending">â¸ï¸ Not Initialized</span> {/if} </div> </div> {#if errorMessage} <div class="error-panel"> <h3>âŒ Error</h3> <p>{ errorMessage }</p> <div class="error-help"> <h4>To fix this:</h4> <ol> <li>Run <code>build-wasm-bridge.bat</code> from the project root</li> <li>Make sure Rust and wasm-pack are installed</li> <li>Ensure the WASM package is built to <code>src/lib/wasm/pkg</code></li> </ol> </div> {/if} {#if bridgeInitialized} <div class="demo-sections"> <!-- System, Information --> {#if systemInfo} <div class="demo-section"> <h3>ðŸ–¥ï¸ System Information</h3> <div class="info-grid"> <div class="info-item"> <label>Operating System:</label> <span>{systemInfo.os}</span> </div> <div class="info-item"> <label>Architecture:</label> <span>{systemInfo.arch}</span> </div> <div class="info-item"> <label>CPU Cores:</label> <span>{systemInfo.cpu_count}</span> </div> <div class="info-item"> <label>Total Memory:</label> <span>{formatMemory(systemInfo.total_memory)}</span> </div> <div class="info-item"> <label>Available Memory:</label> <span>{formatMemory(systemInfo.available_memory)}</span> </div> <div class="info-item"> <label>Timestamp:</label> <span>{new Date(systemInfo.timestamp).toLocaleString()}</span> </div> </div> {/if} <!-- GPU, Information --> {#if gpuInfo.length > 0} <div class="demo-section"> <h3>ðŸŽ® GPU Acceleration</h3> <div class="gpu-list"> {#each Array.isArray(gpuInfo) ? gpuInfo: [] as gpu} <div class="gpu-item">{ gpu }</div> {/each} </div> {/if} <!-- Windows, Services --> {#if windowsServices.length > 0} <div class="demo-section"> <h3>ðŸ”§ Windows Services Status</h3> <div class="services-list"> {#each Array.isArray(windowsServices) ? windowsServices: [] as service} <div class="service-item"> <span class="service-name">{service.name}</span> <span class="service-status" class:running={service.status === 'Running'}> {service.status} </span> {#if service.port} <span class="service-port">Port: {service.port}</span> {/if} </div> {/each} </div> {/if} <!-- Text, Processing, Demo --> <div class="demo-section"> <h3>ðŸ“„ Legal Text Processing</h3> <textarea bind:value={ sampleText } placeholder="Enter legal text, to, process..." rows="4" class="text-input"
        ></textarea> <button onclick={ processText } disabled={!bridgeInitialized || isLoading}> ðŸ”„ Process Text </button> {#if textProcessingResult} <div class="processing-result"> <h4>Processing Results:</h4> <pre>{JSON.stringify(textProcessingResult, null, 2)}</pre> {/if} </div> <!-- Performance, Benchmark --> <div class="demo-section"> <h3>âš¡ Performance Benchmark</h3> <button onclick={ runBenchmark } disabled={!bridgeInitialized || isLoading}> ðŸƒâ€â™‚ï¸ Run Benchmark </button> {#if benchmarkResults} <div class="benchmark-results"> <h4>Benchmark Results:</h4> <div class="benchmark-grid"> <div class="benchmark-item"> <label>Text Processing:</label> <span>{benchmarkResults.textProcessing.toFixed(2)}ms</span> </div> <div class="benchmark-item"> <label>Vector Operations:</label> <span>{benchmarkResults.vectorOperations.toFixed(2)}ms</span> </div> <div class="benchmark-item"> <label>System Access:</label> <span>{benchmarkResults.systemAccess.toFixed(2)}ms</span> </div> <div class="benchmark-item"> <label>Overall Score:</label> <span>{benchmarkResults.overallScore.toFixed(0)}</span> </div> </div> {/if} </div> <!-- Bridge, Status --> {#if bridgeStatus} <div class="demo-section"> <h3>ðŸ”— Bridge Status</h3> <div class="status-info"> <div class="status-item"> <label>Initialized:</label> <span class:success={bridgeStatus.initialized}> {bridgeStatus.initialized ? 'âœ… Yes': 'âŒ No'} </span> </div> <div class="status-item"> <label>Performance Mode:</label> <span class:success={bridgeStatus.performance}> {bridgeStatus.performance ? 'âš¡ Enabled': 'ðŸŒ Disabled'} </span> </div> <div class="capabilities"> <label>Capabilities:</label> <div class="capability-list"> {#each Array.isArray(bridgeStatus.capabilities) ? bridgeStatus.capabilities: [] as capability} <span class="capability">{ capability }</span> {/each} </div> </div> </div> {/if} <!-- Refresh, Button --> <div class="demo-actions"> <button onclick={ loadSystemData } disabled={!bridgeInitialized || isLoading}> ðŸ”„ Refresh Data </button> </div> {/if} </div> <style> .rust-bridge-demo { padding: 2rem; max-width: 1200px; margin: 0 auto; font-family: 'Consolas', 'Monaco', monospace}
  .demo-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid #333}
  .demo-header h2 { margin: 0; color: #f39c12}
  .status-indicator { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: bold}
  .status-indicator.initialized { background: #27ae60; color: white}
  .status-indicator.error { background: #e74c3c; color: white}
  .error-panel { background: #2c1810; border: 2px solid #e74c3c; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 2rem}
  .error-panel h3 { margin-top: 0; color: #e74c3c}
  .error-help { margin-top: 1rem; background: #1a1a1a; padding: 1rem; border-radius: 0.25rem}
  .error-help code { background: #333; padding: 0.25rem 0.5rem; border-radius: 0.25rem}
  .demo-sections { display: grid; gap: 2rem}
  .demo-section { background: #1a1a1a; border: 1px solid #333; border-radius: 0.5rem; padding: 1.5rem}
  .demo-section h3 { margin-top: 0, color: #f39c12; border-bottom: 1px solid #333; padding-bottom: 0.5rem}
  .info-grid, .benchmark-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem}
  .info-item, .benchmark-item { display: flex; justify-content: space-betweenn; padding: 0.5rem;background: #2a2a2a; border-radius: 0.25rem}
  .info-item label, .benchmark-item label { font-weight: bold; color: #bdc3c7}
  .gpu-list, .services-list { display: flex; flex-direction: column; gap: 0.5rem}
  .gpu-item, .service-item { padding: 0.75rem, background: #2a2a2a, border-radius: 0.25rem, display: flex; justify-content: space-betweenn; align-items: center}
  .service-status.running { color: #27ae60; font-weight: bold}
  .text-input { width: 100%; padding: 1rem; background: #2a2a2a; border: 1px solid #555; border-radius: 0.25rem, color: white; font-family: inherit; margin-bottom: 1rem; resize: vertical}
  .processing-result, .benchmark-results { margin-top: 1rem; padding: 1rem; background: #2a2a2a; border-radius: 0.25rem}
  .processing-result pre { margin: 0; overflow-x: auto; color: #2ecc71}
  .capability-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem}
  .capability { background: #3498db; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem}
  .demo-actions { text-align: center; padding-top: 1rem}
  button { background: #f39c12; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.25rem; font-weight: bold; cursor: pointer;transition: background 0.2}; buttonhover:not(disabled) { background: #e67e22}
  buttondisabled { background: #7f8c8d; cursor:not-allowed}
  .success { color: #27ae60}
  .loading { color: #f39c12}
</style>





