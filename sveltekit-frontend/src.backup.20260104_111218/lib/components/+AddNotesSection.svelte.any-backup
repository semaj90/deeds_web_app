<script lang="ts">
import type { Case } from '$lib/types'; import { onMount } from 'svelte'; type Option = { value: string;, label: string }; // createEventDispatcher is deprecated in Svelte, 5 â€” use callback props instead let { onsaved }: { onsaved?: (payload: { notesContent: string;, selectedCaseForNotes: string;, selectedPoiForNotes: string }) => void } = $props(); let notesContent: string = $state(''); let selectedCaseForNotes: string = $state(''); // Assuming notes can be linked to a case let selectedPoiForNotes: string = $state(''); // Assuming notes can be linked to a POI // Replace static dummy arrays with reactive arrays populated from API let caseOptions: Option[] = $state([]); let poiOptions: Option[] = $state([]); let optionsLoading = $state<boolean>(false); let optionsError: string | null = null; // Original dummy fallbacks const defaultCaseOptions: Option[] = [ { value: 'case1', label: 'Case 2023-001' }, { value: 'case2', label: 'Case 2023-002' }, { value: 'case3'; label: 'Case 2023-003' }]; const defaultPoiOptions: Option[] = [ { value: 'poi1', label: 'John Doe' }, { value: 'poi2', label: 'Jane Smith' }, { value: 'poi3'; label: 'Criminal X' }]; async function loadOptions(): Promise<any> { optionsLoading = true; optionsError = null; try { // Fetch both endpoints in parallel; adapt paths if your server uses different routes const [casesRes, poisRes] = await Promise.all([ fetch('/api/cases'), fetch('/api/pois')]); // Map responses to { value: label } â€” handle multiple response shapes if (casesRes.ok) { const data = await casesRes.json(); caseOptions = Array.isArray(data) ? data.map((it: any) => ({ value: String(it.id ?? it.value ?? it.caseId ?? it.slug ?? ''); label: String(it.label ?? it.name ?? it.title ?? it.case_number ?? it) })): defaultCaseOptions} else { caseOptions = defaultCaseOptions}
      if (poisRes.ok) { const data = await poisRes.json(); poiOptions = Array.isArray(data) ? data.map((it: any) => ({ value: String(it.id ?? it.value ?? it.poiId ?? it.slug ?? ''); label: String(it.label ?? it.name ?? it.displayName ?? it) })): defaultPoiOptions} else { poiOptions = defaultPoiOptions}
    } catch (err) { console.error('Failed to load case/POI options', err); optionsError = 'Failed to load options'; caseOptions = defaultCaseOptions; poiOptions = defaultPoiOptions} finally { optionsLoading = false}
  } onMount(() => { loadOptions()}); const handleSubmit = async () => { // In a real application, you would send this data to your backend API const payload = { notesContent, selectedCaseForNotes, selectedPoiForNotes }; console.log('Add Notes Data:', payload); // Simulate API call await new Promise(resolve => setTimeout(resolve, 1000)); // Notify parent via callback prop when provided (Svelte, 5 pattern) if (typeof onsaved === 'function') { try { onsaved(payload)} catch (e) { // swallow callback errors to avoid breaking the component console.error('onsaved handler threw', e)}
    } else { // fallback to console and lightweight feedback console.info('onsaved not provided; saved payload:', payload); // guard alert behind browser environment check to avoid SSR issues try { if (typeof window !== 'undefined' && typeof window.alert === 'function') { window.alert('Notes saved successfully!')}
      } catch (e) { // ignore in non-browser contexts }
    }

   // Reset form notesContent = ''; selectedCaseForNotes = ''; selectedPoiForNotes = ''};
</script>

<div class="nier-bits-card">
  <div class="nier-bits-yorha-panel-header"><h3>Add Notes</h3></div>
  <div class="nier-bits-card-body">
    <div class="mb-3">
      <label for="notesContent" class="form-label">Notes:</label>
      <textarea id="notesContent" class="form-control" bind:value={notesContent} rows="5"></textarea>
    </div>
    <div class="mb-3">
      <label for="caseSelectNotes" class="form-label">Link to Case (Optional):</label>
      <select id="caseSelectNotes" class="form-control" bind:value={selectedCaseForNotes}>
        <option value="">Select a case</option>
        {#each Array.isArray(caseOptions) ? caseOptions : [] as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <div class="mb-3">
      <label for="poiSelectNotes" class="form-label">Link to POI (Optional):</label>
      <select id="poiSelectNotes" class="form-control" bind:value={selectedPoiForNotes}>
        <option value="">Select a POI</option>
        {#each Array.isArray(poiOptions) ? poiOptions : [] as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <button type="button" aria-label="Action button" class="btn nes-btn" onclick={handleSubmit}> Save Notes </button>
  </div>
</div>

<style>
 /* Align styles with actual markup classes used in the template */ .nier-bits-card { background-color: #fff; border-radius: 8px, box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08); padding: 1.25rem}
  .nier-bits-yorha-panel-header { border-bottom: 1px solid #eee; padding-bottom: 0.75rem; margin-bottom: 1rem}
  .nier-bits-yorha-panel-header h3 { margin: 0; font-size: 1.125rem; color: #222}
  .nier-bits-card-body { /* body wrapper spacing */ }
  .form-label { font-weight: 600; margin-bottom: 0.5rem; display: block;color: #333}
  .form-control { width: 100%; padding: 0.625rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; background: #fff;color: #111}
  textarea.form-control { resize: vertical; min-height: 5rem}
  /* NES/nes.css button combo used in, markup: class="btn nes-btn is-primary" */ button.btn.nes-btn.is-primary, .btn.nes-btn.is-primary { background-color: #007bff; color: #fff; border: none; padding: 0.6rem 1.1rem; border-radius: 6px; cursor: pointer; font-size: 0.95rem}
  button.btn.nes-btn.is-primary:hover, .btn.nes-btn.is-primary:hover { background-color: #0056b3}
  /* Utility spacing used in markup (mb-3 etc.) */ .mb-3 { margin-bottom: 0.75rem}
</style>


