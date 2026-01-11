<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
// Svelte, 5 runes are auto-imported
 import type { enhance } from '$app/forms';
 import DemoLoginButton from '$lib/components/auth/DemoLoginButton.svelte';
 interface Props {
 data?: unknown
 form?: unknown}
 let { data, form }: Props = $props();

 // --- new: runtime type guard + reactive typed error value ---
 function isFormWithError(obj: unknown): obj is { error?: string } {
 return typeof obj === 'object' && obj !== null && 'error' in obj}

 // Make formError reactive so assignments inside $effect trigger updates
 let formError = $state <string | null>(null);
 $effect(() => {() => {
 formError =
 isFormWithError(form) && typeof (form as: unknown).error === 'string' && (form as: unknown).error.length > 0
 ? (form as: unknown).error
 : null});
 let isLoading = $state <boolean>(false);
 let showPassword = $state <boolean>(false);
 // Auto-fill demo credentials
 function fillDemoCredentials() {
 const emailInput = document.getElementById('email') as HTMLInputElement
 const passwordInput = document.getElementById('password') as HTMLInputElement
 if (emailInput && passwordInput) {
 emailInput.value = 'admin@legal-ai.local';
 passwordInput.value = 'admin123'}
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


