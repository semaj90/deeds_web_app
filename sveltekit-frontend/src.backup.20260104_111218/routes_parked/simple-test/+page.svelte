<script lang="ts">
import type { Case } from '$lib/types';

// Keep this page small and valid while we repair corrupted portions elsewhere.
let isSubmitting = false;
let submitResult = '';
let formData: { caseNumber: string; title: string; description: string; priority: string } = {
 caseNumber: '',
 title: '',
 description: '',
 priority: 'medium'
};

async function handleSubmit(e: Event) {
 e.preventDefault();
 isSubmitting = true;
 submitResult = '';
 try {
 const response = await fetch('/api/test-case', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(formData)
 });

 const result = await response.json();
 if (response.ok) {
 submitResult = `✓ SUCCESS: Case created with ID ${result?.id ?? 'unknown'}`;
 console.log('Case creation success:', result);
 } else {
 submitResult = `✖ ERROR: ${result?.error ?? 'unknown error'}`;
 console.error('Case creation error:', result);
 }
 } catch (err) {
 submitResult = `✖ NETWORK ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`;
 console.error('Network error:', err);
 } finally {
 isSubmitting = false;
 }
}

async function testDatabaseConnection() {
 try {
 const response = await fetch('/api/test-db');
 const result = await response.json();
 submitResult = `DB: ${result?.status ?? 'ok'}`;
 } catch (err) {
 submitResult = 'DB connection failed';
 console.error('DB check failed', err);
 }
}
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
