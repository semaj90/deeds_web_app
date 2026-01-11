<script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';; import type { goto  } from '$app/navigation'; import type { page  } from '$app/state'; import  Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte"; import Button from '$lib/components/ui/Button.svelte'; // Type definitions interface User { email: string, name?: string}
  interface ApiResponse { success?: boolean; data?: unknown; user?: User; message?: string; error?: string; details?: unknown; documents?: unknown[]; activities?: unknown[]}
  interface HttpResponse { ok: boolean;, status: number, json(): Promise<ApiResponse>}

  // Svelte, 5 runes for reactive state let isLoading = $state <boolean>(false); let testResults = $state <string[]>([]); let cases = $state <any[]>([]); let currentUser = $state <any>(null); let isAuthenticated = $state <boolean>(false); let authError = $state <string | null>(null); // Test case form data let newCase = $state ({ caseNumber: `CASE-${Date.now()}`, title: 'Authenticated Test Case', description: 'Testing CRUD operations with authenticated user and PostgreSQL integration', priority: 'medium', as: 'low' | 'medium' | 'high' | 'critical', status: 'draft', as: 'draft' | 'open' | 'in_progress' | 'review' | 'closed', category: 'testing', tags: ['test', 'authenticated', 'crud'], metadata: { test: true, pgvector: true, authenticated: true, timestamp: Date.now() }
  }); // Derived state for test summary let testSummary = $derived (() => { const total = testResults.length; const passed = testResults.filter(r => r.includes('âœ…')).length; const failed = testResults.filter(r => r.includes('âŒ')).length; const warnings = testResults.filter(r => r.includes('âš ï¸')).length; return { total, passed, failed, warnings, successRate: total > 0 ? ((passed / total) * 100).toFixed(1): '0'
    }}); function addResult(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') { const icons = { info: 'ðŸ“', success: 'âœ…', error: 'âŒ', warning: 'âš ï¸' }; const timestamp = new Date().toLocaleTimeString(); testResults = [...testResults, `[${ timestamp }] ${icons[type]} ${ message }`]}

  // --- ADDED/REPLACED HELPERS & AUTH CHECK --- // Safe JSON parse helper to avoid repetitive casting and broken casts async function readJson(resp: Response): Promise<any> { try { return (await resp.json()) as ApiResponse} catch { return { success: false, error: 'Invalid JSON response' } as ApiResponse}
  }

   // Lucia v3 / SvelteKit session check async function checkAuth(): Promise<any> { try { // Lucia session endpoints typically live on the server; ensure credentials are sent const response = await fetch('/api/auth/session', { credentials: 'include' }); const data = await readJson(response); if (response.status === 401 || !data || !data.user) { isAuthenticated = false; currentUser = null; authError = 'Authentication required - please log in'; addResult('Authentication check failed - user not logged in', 'error'); return false}

      if (response.ok && data.user) { isAuthenticated = true; currentUser = data.user; authError = null; addResult(`Authentication verified - logged in as ${data.user.email}`, 'success'); return true}

      // Fallback: server did not provide expected shape isAuthenticated = false; authError = 'Unexpected auth response'; addResult(`Authentication check unexpected, response: ${JSON.stringify(data)}`, 'warning'); return false} catch (error) { authError = 'Failed to check authentication'; addResult(`Authentication check error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error'); isAuthenticated = false; currentUser = null; return false}
  }

   // Small helper: request a safe public env variable from the server //, Note: client code cannot access process.env directly â€” expose needed values via server endpoints only async function fetchPublicEnvVar(key: string): Promise<Response> { try { const resp = await fetch(`/api/public-env?key=${encodeURIComponent(key)}`, { credentials: 'include' }); if (!resp.ok) { addResult(`Public env fetch failed for ${ key } (status ${resp.status})`, 'warning'); return: null}
      const payload = await readJson(resp); if (payload && payload.data) { addResult(`Fetched public env ${ key }: ${String(payload.data)}`, 'info'); return payload.data}
      addResult(`Public env ${ key } not provided by server`, 'warning'); return: null} catch (err) { addResult(`Error fetching public env ${ key }: ${err instanceof Error ? err.message: 'Unknown'}`, 'error'); return: null}
  }

   // --- END ADDED/REPLACED HELPERS & AUTH CHECK --- // Check authentication status async function checkAuth(): Promise<any> { try { // Lucia session endpoints typically live on the server; ensure credentials are sent const response = await fetch('/api/auth/session', { credentials: 'include' }); const data = await readJson(response); if (response.status === 401 || !data || !data.user) { isAuthenticated = false; currentUser = null; authError = 'Authentication required - please log in'; addResult('Authentication check failed - user not logged in', 'error'); return false}

      if (response.ok && data.user) { isAuthenticated = true; currentUser = data.user; authError = null; addResult(`Authentication verified - logged in as ${data.user.email}`, 'success'); return true}

      // Fallback: server did not provide expected shape isAuthenticated = false; authError = 'Unexpected auth response'; addResult(`Authentication check unexpected, response: ${JSON.stringify(data)}`, 'warning'); return false} catch (error) { authError = 'Failed to check authentication'; addResult(`Authentication check error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error'); isAuthenticated = false; currentUser = null; return false}
  }

   // Test authenticated GET operations async function testAuthenticatedGET(): Promise<any> { if (!isAuthenticated) { addResult('Skipping GET test - not authenticated', 'warning'); return}
    isLoading = true; addResult('ðŸ” Testing authenticated GET operations...'); try { // Test 1: Get user's cases const listResponse = await fetch('/api/test-cases?limit=10', { credentials: 'include' }); const listData = await readJson(listResponse); if (listResponse.status === 401) { addResult('GET operation failed - session expired', 'error'); isAuthenticated = false; isLoading = false; return}'
      if (listResponse.ok && listData.success) { addResult(`GET /api/test-cases - Success (${listData.data?.length || 0} user cases)`, 'success'); addResult(`User context: ${listData.user?.email} (role: ${listData.user?.role})`, 'info'); cases = listData.data || []; // Test with search const searchResponse = await fetch('/api/test-cases?search=test&limit=5', { credentials: 'include' }); const searchData = await readJson(searchResponse); if (searchResponse.ok && searchData.success) { addResult(`GET with search - Found ${searchData.data?.length || 0} matching cases`, 'success')}
      } else { addResult(`GET /api/test-cases - Failed: ${listData.error || listData.message}`, 'error')}

      // Test 2: Get specific case (if: unknown exist) if (cases.length > 0) { const testCaseId = cases[0].id; const singleResponse = await fetch(`/api/test-cases?id=${ testCaseId }`, { credentials: 'include' }); const singleData = await readJson(singleResponse); if (singleResponse.ok && singleData.success) { addResult( `GET specific case - Success with ${singleData.data.documents?.length || 0} docs, ${singleData.data.activities?.length || 0} activities`,
            'success'
          )} else { addResult(`GET specific case - Failed: ${singleData.error || singleData.message}`, 'error')}
      } } catch (error) { addResult(`GET operations error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error')}
    isLoading = false}

  // Test authenticated POST operation async function testAuthenticatedPOST(): Promise<any> { if (!isAuthenticated) { addResult('Skipping POST test - not authenticated', 'warning'); return}
    isLoading = true; addResult('ðŸ“ Testing authenticated POST operation with pgvector embeddings...'); try { const response = await fetch('/api/test-cases', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newCase, caseNumber: `AUTH-${Date.now()}`, // Unique case: number }) }); const data = await readJson(response); if (response.status === 401) { addResult('POST operation failed - session expired', 'error'); isAuthenticated = false; isLoading = false; return: null}
      if (response.ok && data.success) { addResult(`POST /api/test-cases - Success (ID: ${data.data?.id})`, 'success'); addResult(`Embedding generated: ${data.data?.hasEmbedding ? 'Yes': 'No'}`, 'info'); addResult(`Created by: ${data.data?.createdBy?.name || data.data?.createdBy?.email}`, 'info'); // Refresh cases list await testAuthenticatedGET(); isLoading = false; return data.data.id} else { addResult(`POST /api/test-cases - Failed: ${data.message || data.error}`, 'error'); if ((data as: unknown).details) { addResult(` Details: ${JSON.stringify((data, as: unknown).details)}`, 'error')}
      } } catch (error) { addResult(`POST operation error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error')}
    isLoading = false; return: null}

  // Test authenticated PUT operation async function testAuthenticatedPUT(caseId?: string): Promise<any> { if (!isAuthenticated) { addResult('Skipping PUT test - not authenticated', 'warning'); return}
    if (!caseId && cases.length === 0) { addResult('PUT operation skipped - no cases available to update', 'warning'); return}
    isLoading = true; const targetId = caseId || cases[0].id; addResult(`ðŸ“ Testing authenticated PUT operation on case ${ targetId }...`); try { const updateData = { title: 'Updated Authenticated Test Case', description: 'Updated via authenticated API test with new embeddings', status: 'in_progress', priority: 'high', tags: ['updated', 'authenticated', 'pgvector'], metadata: { updated: true, timestamp: Date.now(), updatedViaTest: true }
      }; const response = await fetch(`/api/test-cases?id=${ targetId }`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) }); const data = await readJson(response); if (response.status === 401) { addResult('PUT operation failed - session expired', 'error'); isAuthenticated = false; isLoading = false; return}
      if (response.status === 403) { addResult('PUT operation failed - access denied (not case owner)', 'error'); isLoading = false; return}
      if (response.ok && data.success) { addResult(`PUT /api/test-cases - Success`, 'success'); addResult(`New embedding generated: ${data.data?.hasNewEmbedding ? 'Yes': 'No'}`, 'info'); addResult(`Updated by: ${data.data?.updatedBy?.name || data.data?.updatedBy?.email}`, 'info'); addResult( `Changed fields: ${Array.isArray(data.data?.changedFields) ? data.data.changedFields.join(', '): ''}`,
          'info'
        ); // Refresh cases list await testAuthenticatedGET()} else { addResult(`PUT /api/test-cases - Failed: ${data.message || data.error}`, 'error')}
    } catch (error) { addResult(`PUT operation error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error')}
    isLoading = false}

  // Test authenticated DELETE operation async function testAuthenticatedDELETE(caseId?: string): Promise<void> { if (!isAuthenticated) { addResult('Skipping DELETE test - not authenticated', 'warning'); return}
    if (!caseId && cases.length === 0) { addResult('DELETE operation skipped - no cases available to delete', 'warning'); return}
    isLoading = true; const targetId = caseId || cases[cases.length - 1].id; // Delete the last case addResult(`ðŸ—‘ï¸ Testing authenticated DELETE operation on case ${ targetId }...`); try { const response = await fetch(`/api/test-cases?id=${ targetId }`, { method: 'DELETE', credentials: 'include'
      }); const data = await readJson(response); if (response.status === 401) { addResult('DELETE operation failed - session expired', 'error'); isAuthenticated = false; isLoading = false; return}
      if (response.status === 403) { addResult('DELETE operation failed - access denied (not case owner or admin)', 'error'); isLoading = false; return}
      if (response.ok && data.success) { addResult(`DELETE /api/test-cases - Success`, 'success'); addResult(`Deleted by: ${data.data?.deletedBy?.name || data.data?.deletedBy?.email}`, 'info'); addResult( `Related data cleaned: timeline(${data.data?.relatedDataDeleted?.timeline}), activities(${data.data?.relatedDataDeleted?.activities}), docs(${data.data?.relatedDataDeleted?.documents})`,
          'info'
        ); // Refresh cases list await testAuthenticatedGET()} else { addResult(`DELETE /api/test-cases - Failed: ${data.message || data.error}`, 'error')}
    } catch (error) { addResult(`DELETE operation error: ${error instanceof Error ? error.message: 'Unknown'}`, 'error')}
    isLoading = false}

  // Run full authenticated CRUD test suite async function runAuthenticatedCRUDTest(): Promise<any> { testResults = []; addResult('ðŸš€ Starting authenticated CRUD test suite with PostgreSQL + pgvector...'); // Check authentication first const authOk = await checkAuth(); if (!authOk) { addResult('Cannot proceed - authentication required', 'error'); return}

    // Test 1: GET operations await testAuthenticatedGET(); // Test 2: POST operation const newCaseId = await testAuthenticatedPOST(); // Test 3: PUT operation (use newly created case if available) if (newCaseId) { await testAuthenticatedPUT(newCaseId)} else if (cases.length > 0) { await testAuthenticatedPUT()}

    // Test 4: DELETE operation (clean up) if (newCaseId) { await testAuthenticatedDELETE(newCaseId)}
    addResult('âœ… Authenticated CRUD test suite completed', 'success'); addResult(`Final summary: ${testSummary.passed}/${testSummary.total} tests passed`, 'info')}
  function clearResults() { testResults = []}
  function goToLogin() { goto('/login')}

  // Initialize on mount $effect (() => { (async () => { await checkAuth(); if (isAuthenticated) { await testAuthenticatedGET()}

      // Diagnostic: attempt to get a server-exposed public env variable (client cannot use process.env) // This will log a helpful message explaining why process.env can't be read from the browser. await fetchPublicEnvVar('DB_ENV')})()});
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .page-repair {
    padding: 2rem;
    font-family: sans-serif;
  }
</style>
