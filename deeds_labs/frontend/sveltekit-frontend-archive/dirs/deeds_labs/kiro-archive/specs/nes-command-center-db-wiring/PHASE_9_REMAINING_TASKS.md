# Phase 9: Remaining Tasks (Tasks 5-10)

**Status:** Ready to Begin
**Estimated Time:** 7 hours
**Tasks:** 5-10

---

## Task 5: ErrorBrainModal - Save Analysis (1 hour)

### Objective
Integrate ErrorBrainModal to save error brain analysis to database.

### Implementation Steps

1. **Find ErrorBrainModal component**
   ```bash
   find sveltekit-frontend/src -name "*ErrorBrain*" -o -name "*error-brain*"
   ```

2. **Add analysis save function**
   ```typescript
   async function saveAnalysis() {
     try {
       const response = await fetch(
         `/api/routes/${routePath}/error-brain-analysis`,
         {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             suggestions: suggestions,
             selected_suggestion_index: selectedIndex,
             phase: 'suggesting',
             error_message: errorMessage,
             metadata: { timestamp: new Date().toISOString() }
           })
         }
       );

       if (!response.ok) throw new Error('Failed to save analysis');
       const analysis = await response.json();
       analysisId = analysis.id; // Store for later reference
       showToast('Analysis saved successfully', 'success');
     } catch (error) {
       console.error('Error saving analysis:', error);
       showToast('Failed to save analysis', 'error');
     }
   }
   ```

3. **Call on analysis completion**
   - Hook into error brain completion event
   - Call `saveAnalysis()` when suggestions are ready
   - Store `analysisId` for patch linking

### Testing
- Test analysis saves with valid data
- Test error handling and user notification
- Test analysisId is stored for reference
- Verify API call includes correct route_path

---

## Task 6: ErrorBrainModal - Save Patch (1 hour)

### Objective
Integrate ErrorBrainModal to save error brain patch to database.

### Implementation Steps

1. **Add patch save function**
   ```typescript
   async function savePatch(patchContent: string, filePath: string) {
     try {
       const response = await fetch(
         `/api/routes/${routePath}/error-brain-patch`,
         {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             file_path: filePath,
             patch_content: patchContent,
             description: `Patch from error brain analysis`,
             analysis_id: analysisId,
             risk_level: 'medium'
           })
         }
       );

       if (!response.ok) throw new Error('Failed to save patch');
       const patch = await response.json();
       patchId = patch.id; // Store for verification
       showToast('Patch saved successfully', 'success');
     } catch (error) {
       console.error('Error saving patch:', error);
       showToast('Failed to save patch', 'error');
     }
   }
   ```

2. **Call when patch is applied**
   - Hook into patch application event
   - Call `savePatch()` with patch content and file path
   - Store `patchId` for verification

### Testing
- Test patch saves with valid data
- Test patchId is stored for verification
- Test error handling and user notification
- Verify API call includes correct route_path and analysis_id

---

## Task 7: ErrorBrainModal - Update Verification (1 hour)

### Objective
Integrate ErrorBrainModal to update patch verification status.

### Implementation Steps

1. **Add verification update function**
   ```typescript
   async function updateVerification(
     status: 'passed' | 'failed',
     message?: string
   ) {
     try {
       const response = await fetch(
         `/api/routes/${routePath}/error-brain-patch/${patchId}`,
         {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             verification_status: status,
             verification_message: message
           })
         }
       );

       if (!response.ok) throw new Error('Failed to update verification');
       const updated = await response.json();
       showToast(`Patch verification: ${status}`, 'success');
       updateUI(updated);
     } catch (error) {
       console.error('Error updating verification:', error);
       showToast('Failed to update verification', 'error');
     }
   }
   ```

2. **Call when verification completes**
   - Hook into patch verification event
   - Call `updateVerification()` with status and message
   - Update UI to show verification result

### Testing
- Test verification update on completion
- Test verification_status is correctly set
- Test error handling and user notification
- Verify API call includes correct patchId

---

## Task 8: Display Error Brain History (2 hours)

### Objective
Display error brain analysis history on all-routes page.

### Implementation Steps

1. **Find all-routes page**
   ```bash
   find sveltekit-frontend/src/routes -name "*all-routes*" -o -name "*all*routes*"
   ```

2. **Add history section to route modal**
   ```svelte
   <div class="error-brain-history">
     <h3>Error Brain History</h3>
     {#if loading}
       <p>Loading history...</p>
     {:else if error}
       <p class="error">{error}</p>
     {:else if analyses.length === 0}
       <p>No error brain analyses yet</p>
     {:else}
       <div class="analyses-list">
         {#each analyses as analysis (analysis.id)}
           <div class="analysis-item">
             <div class="timestamp">{formatDate(analysis.created_at)}</div>
             <div class="suggestions">
               {analysis.suggestions.length} suggestions
             </div>
             <div class="patches">
               {#each analysis.patches as patch (patch.id)}
                 <div class="patch-status {patch.verification_status}">
                   {patch.verification_status}
                 </div>
               {/each}
             </div>
           </div>
         {/each}
       </div>
     {/if}
   </div>
   ```

3. **Fetch history on route selection**
   ```typescript
   async function loadHistory(routePath: string) {
     try {
       loading =
       const response = await fetch(
         `/api/routes/${routePath}/error-brain-analyses?limit=20&offset=0`
       );
       if (!response.ok) throw new Error('Failed to load history');
       const data = await response.json();
       analyses = data.data;
       total = data.total;
     } catch (err) {
       error = err.message;
     } finally {
       loading = false;
     }
   }
   ```

4. **Add styling for history display**
   - Style analysis items
   - Style patch verification status badges
   - Add loading and error states

### Testing
- Test history displays for routes with analyses
- Test history is empty for routes without analyses
- Test patch verification status is displayed correctly
- Test loading and error states
- Test pagination (if needed)

---

## Task 9: Write Integration Tests (1 hour)

### Objective
Create integration tests for the full error brain flow.

### Implementation Steps

1. **Create integration test file**
   ```bash
   touch sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-integration.test.ts
   ```

2. **Test full flow**
   ```typescript
   describe('Error Brain Integration Tests', () => {
     it('should complete full analysis-patch-verification flow', async () => {
       // 1. Create analysis
       const analysisRes = await POST_analysis({
         suggestions: [...],
         phase: 'suggesting'
       });
       const analysisId = analysisRes.id;

       // 2. Create patch
       const patchRes = await POST_patch({
         file_path: 'src/test.ts',
         patch_content: 'patch',
         analysis_id: analysisId
       });
       const patchId = patchRes.id;

       // 3. Verify patch
       const verifyRes = await PUT_verification(patchId, {
         verification_status: 'passed'
       });

       // 4. Get history
       const historyRes = await GET_analyses();

       // Verify chain
       expect(analysisId).toBeDefined();
       expect(patchId).toBeDefined();
       expect(verifyRes.verification_status).toBe('passed');
       expect(historyRes.data.length).toBeGreaterThan(0);
     });
   });
   ```

### Testing
- Test full flow from analysis to verification
- Test data integrity through flow
- Test error handling at each step
- Test pagination in history retrieval

---

## Task 10: Write Component Tests (1 hour)

### Objective
Create component tests for ErrorBrainModal integration.

### Implementation Steps

1. **Create component test file**
   ```bash
   touch sveltekit-frontend/src/lib/components/error-brain/ErrorBrainModal.test.ts
   ```

2. **Test component integration**
   ```typescript
   describe('ErrorBrainModal Component', () => {
     it('should save analysis on completion', async () => {
       const { component } = render(ErrorBrainModal, {
         props: { routePath: 'test-route' }
       });

       // Trigger analysis completion
       await component.completeAnalysis({
         suggestions: [...],
         phase: 'suggesting'
       });

       // Verify API call was made
       expect(fetch).toHaveBeenCalledWith(
         '/api/routes/test-route/error-brain-analysis',
         expect.any(Object)
       );
     });

     it('should save patch on application', async () => {
       // Similar test for patch saving
     });

     it('should update verification on completion', async () => {
       // Similar test for verification update
     });
   });
   ```

### Testing
- Test analysis save on completion
- Test patch save on application
- Test verification update on completion
- Test error handling and user notifications
- Test UI updates after API calls

---

## Quick Reference: API Calls

### Save Analysis
```typescript
POST /api/routes/:routePath/error-brain-analysis
{
  suggestions: Array<{title, description, code?, file?}>,
  selected_suggestion_index?: number,
  phase: string,
  error_message?: string,
  metadata?: object
}
```

### Save Patch
```typescript
POST /api/routes/:routePath/error-brain-patch
{
  file_path: string,
  patch_content: string,
  description?: string,
  analysis_id?: UUID,
  risk_level?: 'low' | 'medium' | 'high',
  cluster_id?: string
}
```

### Update Verification
```typescript
PUT /api/routes/:routePath/error-brain-patch/:patchId
{
  verification_status: 'passed' | 'failed',
  verification_message?: string
}
```

### Get History
```typescript
GET /api/routes/:routePath/error-brain-analyses?limit=20&offset=0
```

---

## Common Patterns

### Error Handling
```typescript
try {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
} catch (error) {
  console.error('API error:', error);
  showToast(error.message, 'error');
  throw error;
}
```

### Loading States
```typescript
let loading = $state(false);
let error = $state<string | null>(null);

async function load() {
  loading = true;
  error = null;
  try {
    // API call
  } catch (err) {
    error = err.message;
  } finally {
    loading = false;
  }
}
```

### Toast Notifications
```typescript
function showToast(message: string, type: 'success' | 'error' | 'info') {
  // Use existing toast system in app
  // Example: toastStore.trigger({ message, type });
}
```

---

## Testing Checklist

### Task 5 Tests
- [ ] Analysis saves with valid data
- [ ] analysisId is stored
- [ ] Error handling works
- [ ] User notification shown

### Task 6 Tests
- [ ] Patch saves with valid data
- [ ] patchId is stored
- [ ] analysis_id is included
- [ ] Error handling works

### Task 7 Tests
- [ ] Verification updates status
- [ ] verification_timestamp is set
- [ ] verification_message is included
- [ ] Error handling works

### Task 8 Tests
- [ ] History displays for routes with analyses
- [ ] History is empty for routes without analyses
- [ ] Patch status badges display correctly
- [ ] Loading and error states work

### Task 9 Tests
- [ ] Full flow completes successfully
- [ ] Data integrity maintained
- [ ] Error handling at each step
- [ ] Pagination works

### Task 10 Tests
- [ ] Component saves analysis
- [ ] Component saves patch
- [ ] Component updates verification
- [ ] Error notifications shown

---

## Estimated Timeline

| Task | Duration | Status |
|------|----------|--------|
| Task 5 | 1 hour | ⏳ Ready |
| Task 6 | 1 hour | ⏳ Ready |
| Task 7 | 1 hour | ⏳ Ready |
| Task 8 | 2 hours | ⏳ Ready |
| Task 9 | 1 hour | ⏳ Ready |
| Task 10 | 1 hour | ⏳ Ready |
| **Total** | **7 hours** | ⏳ Ready |

---

## Next Steps

1. **Begin Task 5**
   - Locate ErrorBrainModal component
   - Add analysis save function
   - Test with API endpoint

2. **Continue with Tasks 6-7**
   - Add patch save function
   - Add verification update function
   - Test integration

3. **Complete Tasks 8-10**
   - Add history display
   - Write integration tests
   - Write component tests

---

## Success Criteria

- ✅ All 4 API endpoints working
- ✅ ErrorBrainModal saves analyses
- ✅ ErrorBrainModal saves patches
- ✅ ErrorBrainModal updates verification
- ✅ History displays on all-routes page
- ✅ All integration tests passing
- ✅ All component tests passing
- ✅ Zero TypeScript diagnostics
- ✅ Complete documentation

---

**Status:** ✅ READY FOR TASKS 5-10
**Estimated Completion:** 7 hours
**Next Phase:** Phase 10 (Real-Time Updates)

🚀 **Ready to Continue!**
