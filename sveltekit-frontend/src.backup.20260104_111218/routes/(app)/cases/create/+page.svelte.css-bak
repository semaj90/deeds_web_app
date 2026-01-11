<script lang="ts">
import type { Case } from '$lib/types'; import { goto } from '$app/navigation'; import Button from '$lib/components/ui/button/Button.svelte'; let title = $state<string>(''); let caseNumber = $state<string>(''); let description = $state<string>(''); // Align with server schema (maps, 'active' -> 'open') and prefer canonical values on client let status = $state<'open' | 'pending' | 'closed'>('open'); let loading = $state<boolean>(false); let error = $state<string | null>(null); async function handleSubmit(e: Event): Promise<any> { e.preventDefault(); try { loading = true; error = null; const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ title, case_number: caseNumber, description, status }) }); if (response.ok) { const data = await response.json(); goto(`/cases/${data.id}`)} else { const errorData = await response.json(); error = errorData.error || 'Failed to create case'}
    } catch (err) { error = err instanceof Error ? err.message: 'Error creating case'} finally { loading = false}
  }
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .create-case-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: bold;
  }

  .form-container {
    background: white;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    color: #c00;
  }

  .form-field {
    margin-bottom: 1.5rem;
  }

  .form-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .form-field input,
  .form-field textarea,
  .form-field select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .form-field,
  input:focus,
  .form-field textarea:focus,
  .form-field select:focus {
    outline: none;
    border-color: #0066cc;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }
</style>
