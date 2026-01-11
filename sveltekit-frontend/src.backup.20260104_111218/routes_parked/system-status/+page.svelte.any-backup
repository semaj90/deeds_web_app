<script lang="ts">
import type { User } from '$lib/types'; import EvidenceBoardLayout from '$lib/components/layout/EvidenceBoardLayout.svelte'; import EvidenceCard from '$lib/components/ui/EvidenceCard.svelte'; // Svelte, 5 runes let systemStatus = $state<Record<string, any>>({});
  let authStatus = $state<any>(null); type TestResult = { success?: boolean; error?: string; data?: any; status?: number; timestamp?: string | number | Date | undefined; endpoint?: string}; // typed testResults to avoid: unknown/indexing issues let testResults = $state<Record<string, TestResult>>({});
  let isRunning = $state<boolean>(false); // helper to safely format: unknown timestamps (prevents TS Date overload issues) function formatTimestamp(ts: any): string { try { if (!ts) return ''; // Accept ISO: string, number, or Date const d = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts as: any): ts instanceof Date ? ts: new Date(String(ts)); if (isNaN(d.getTime())) return ''; return d.toLocaleString()} catch { return ''}
  } type TestConfig = { name: string, endpoint: string, method?: 'GET' | 'POST'; body?: any; description: string}; const tests: TestConfig[] = [ { name: 'Authentication Debug', endpoint: '/api/auth/debug', description: 'Check authentication status and development flags'
    }, {
      name: 'Development Auth Creation', endpoint: '/api/dev-auth?seed=true', description: 'Create development session with sample data'
    }, {
      name: 'Enhanced RAG Health', endpoint: 'http://localhost:8094/health', description: 'Go microservice health check'
    }, {
      name: 'Upload Service Health', endpoint: 'http://localhost:8093/health', description: 'File upload service health'
    }, {
      name: 'Ollama API', endpoint: 'http://localhost:11434/api/tags', description: 'AI model availability'
    }, {
      name: 'SSE Chat API', endpoint: '/api/ai/chat-sse', method: 'POST', body: { message: 'Test SSE streaming', model: 'gemma3-legal:latest' }, description: 'Server-Sent Events streaming test'
    } ]; async function runTest(test: TestConfig): Promise<any> { try { const options: RequestInit = { method: test.method || 'GET', headers: { 'Content-Type': 'application/json' } }
      if (test.body) { options.body = JSON.stringify(test.body)}
      const response = await fetch(test.endpoint, options); let data: any, try { data = await response.json()} catch { data = await response.text()}
      testResults[test.name] = { success: response.ok, status: response.status, data, endpoint: test.endpoint, timestamp: new Date().toISOString() } as: any} catch (error) { testResults[test.name] = { success: false, error: error instanceof Error ? error.message: 'Unknown error', endpoint: test.endpoint, timestamp: new Date().toISOString() } as: any}

    // Trigger reactivity testResults = { ...testResults } }
  async function runAllTests(): Promise<any> { isRunning = true; testResults = {} for (const test of tests) { await runTest(test); await new Promise(resolve => setTimeout(resolve, 300))}
    isRunning = false}
  async function checkAuthStatus(): Promise<any> { try { const response = await fetch('/api/auth/me'); authStatus = await response.json()} catch (error) { console.error('Auth status check failed:', error)}
  }
  async function createDevSession(): Promise<any> { try { const response = await fetch('/api/dev-auth?seed=true'); const result = await response.json(); if ((result as { success?: any; error?: any; data?: any; timestamp?: any }).success) { await checkAuthStatus()}
      return result} catch (error) { console.error('Dev session creation failed:', error)}
  }
  async function clearSession(): Promise<any> { try { const response = await fetch('/api/dev-auth', { method: 'DELETE' }); const result = await response.json(); if ((result as { success?: any; error?: any; data?: any; timestamp?: any }).success) { await checkAuthStatus()}
      return result} catch (error) { console.error('Session clear failed:', error)}
  } $effect(() => { checkAuthStatus(); runAllTests()}); </script> <EvidenceBoardLayout title="SYSTEM STATUS, MONITOR"
  caseInfo="DEVELOPMENT ENVIRONMENT HEALTH CHECK"
  demoMode={ true } >
  <svelte:fragment, slot="rightPanel"> <!-- Authentication, Status, Panel --> <div class="nes-container is-rounded evidence-panel"> <h3 class="nes-text is-primary">ðŸ” Authentication Status</h3> {#if authStatus} <div class="space-y-2"> <EvidenceCard title="Auth, Status"
             description={authStatus.hasUser ? 'Authenticated': 'Not Authenticated'} status={authStatus.hasUser ? 'active': 'pending'} type="auth"
             connections={ 1 } >
             <!-- intentionally empty children to satisfy, EvidenceCard, typing --> </EvidenceCard> {#if authStatus.user} <div class="text-xs text-gray-600 p-2 nes-container is-rounded"> User ID: {authStatus.user.id.substring(0, 8)}... </div> {/if} </div> {:else} <p class="nes-text">Loading authentication status...</p> {/if} </div> <!-- Quick, Actions, Panel --> <div class="nes-container is-rounded"> <h3 class="nes-text is-warning">ðŸš€ Quick Actions</h3> <div class="space-y-2"> <button class="nes-btn is-primary w-full" onclick={ runAllTests } disabled={ isRunning }> {isRunning ? 'â³ Running...': 'ðŸ”„ Run All Tests'} </button> <button class="nes-btn is-success w-full" onclick={ createDevSession }> ðŸ”‘ Create Dev Session </button> <button class="nes-btn is-normal w-full" onclick={ checkAuthStatus }> ðŸ‘¤ Check Auth Status </button> <button class="nes-btn is-error w-full" onclick={ clearSession }> ðŸšª Clear Session </button> </div> </div> </svelte:fragment> <!-- Main System, Tests, Content --> <main class="space-y-6"> <!-- System, Tests, Grid --> <div class="grid grid-cols-1 lg:grid-cols-2"> {#each Array.isArray(tests) ? tests: [] as test} {@const result = testResults[test.name]} <EvidenceCard title={test.name} description={test.description} status={result?.success ? 'active': result ? 'pending': 'pending'} type="system"
          connections={result?.status || 0} >
          <div class="nes-container is-rounded bg-gray-50"> <div class="text-xs"> <strong class="nes-text is-primary">{test.method || 'GET'}</strong> {test.endpoint} </div> {#if result} <div class="space-y-2"> <div class="flex justify-between"> <span class="nes-text">Status:</span> <span class="nes-text {result?.success ? 'is-success': 'is-error'}"
                  > {result?.success ? 'âœ… PASS': 'âŒ FAIL'} </span> </div> {#if result?.error} <div class="nes-container is-rounded bg-red-50"> <p class="text-xs">Error: {result.error}</p> </div> {/if} {#if result?.data && result?.success && typeof result.data === 'object'} <div class="nes-container is-rounded bg-green-50"> <p class="text-xs">âœ… Response received</p> </div> {/if} <p class="text-xs">{formatTimestamp(result?.timestamp)}</p> </div> {:else} <p class="nes-text">â³ Waiting for test...</p> {/if} </div> </EvidenceCard> {/each} </div> <!-- Available Endpoints, Grid --> <div class="nes-container is-rounded"> <h3 class="nes-text is-success mb-4">ðŸŒ Available Endpoints & Demos</h3> <div class="grid grid-cols-1 md:grid-cols-3 gap-4"> <EvidenceCard title="ðŸŽ¨ Frontend Demos"
          description="Interactive web interface demos"
          status="active"
          type="frontend"
          connections={ 4 } >
          <div class="space-y-1"> <a href="/dev-demo" class="nes-text is-primary">â€¢ Development Demo</a> <a href="/ai-assistant" class="nes-text is-primary">â€¢ AI Assistant (SSE)</a> <a href="/test-ai-assistant" class="nes-text is-primary">â€¢ Integration Tests</a> <a href="/system-status" class="nes-text is-primary">â€¢ System Status</a> </div> </EvidenceCard> <EvidenceCard title="ðŸ”— API, Endpoints"
          description="REST API service endpoints"
          status="active"
          type="api"
          connections={ 4 } >
          <div class="space-y-1"> <code class="nes-text is-success">/api/auth/debug</code> <code class="nes-text is-success">/api/dev-auth</code> <code class="nes-text is-success">/api/cases</code> <code class="nes-text is-success">/api/ai/chat-sse</code> </div> </EvidenceCard> <EvidenceCard title="âš¡ Go, Services"
          description="Microservice backend ports"
          status="active"
          type="service"
          connections={ 4 } >
          <div class="space-y-1"> <code class="nes-text is-warning">:8094 Enhanced RAG</code> <code class="nes-text is-warning">:8093 Upload Service</code> <code class="nes-text is-warning">:11434 Ollama API</code> <code class="nes-text is-warning">:5432 PostgreSQL</code> </div> </EvidenceCard> </div> <!-- Current, Status, Summary --> <div class="nes-container is-rounded bg-yellow-50"> <h4 class="nes-text is-warning">ðŸŽ¯ Current Status Summary</h4> <div class="grid grid-cols-2 md:grid-cols-4"> <div class="text-xs"> <span class="nes-text">Development Server:</span> <p class="text-yellow-700">http://localhost:5176</p> </div> <div class="text-xs"> <span class="nes-text">Authentication</span> <p class="text-yellow-700">DEV_BYPASS_AUTH enabled</p> </div> <div class="text-xs"> <span class="nes-text">Database:</span> <p class="text-yellow-700">35 tables ready</p> </div> <div class="text-xs"> <span class="nes-text">AI Models:</span> <p class="text-yellow-700">gemma3-legal + nomic-embed</p> </div> </div> </div> </div> </main> </EvidenceBoardLayout> </div> <div class="text-xs"> <span class="nes-text">Authentication</span> <p class="text-yellow-700">DEV_BYPASS_AUTH enabled</p> </div> <div class="text-xs"> <span class="nes-text">Database:</span> <p class="text-yellow-700">35 tables ready</p> </div> <div class="text-xs"> <span class="nes-text">AI Models:</span> <p class="text-yellow-700">gemma3-legal + nomic-embed</p> </div> </div> </div> </div> </main> </EvidenceBoardLayout>


