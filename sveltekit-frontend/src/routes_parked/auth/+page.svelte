<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
// Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { fade, slide } from 'svelte/transition'; import { cubicOut } from 'svelte/easing'; // Authentication mode state let authMode = $state <'login' | 'register'>('login'); let isLoading = $state <boolean>(false); let error = $state <string>(''); let success = $state <string>(''); // Form data let formData = $state ({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '', role: 'prosecutor', department: '', jurisdiction: '', badgeNumber: '', agreeToTerms: false, agreeToPrivacy: false });
  

 // Handle form submission async function handleSubmit(_event: Event): Promise<any> { event.preventDefault(); isLoading = true; error = ''; success = ''; try { const form = new FormData(); // Add common fields form.append('email', formData.email); form.append('password', formData.password); // Add register-specific fields if (authMode === 'register') { form.append('confirmPassword', formData.confirmPassword); form.append('firstName', formData.firstName); form.append('lastName', formData.lastName); form.append('role', formData.role); form.append('department', formData.department); form.append('jurisdiction', formData.jurisdiction); form.append('badgeNumber', formData.badgeNumber); form.append('agreeToTerms', formData.agreeToTerms.toString()); form.append('agreeToPrivacy', formData.agreeToPrivacy.toString())}
 const endpoint = authMode === 'login' ? '/auth/login': '/auth/register'; const response = await fetch(endpoint, { method: 'POST', body: form }); if ((response as { ok?: unknown; json?: unknown }).ok) { success = authMode === 'login' ? 'Login successful! Redirecting...': 'Registration successful! Redirecting...'; // Redirect on success setTimeout(() => { window.location.href = '/dashboard'}, 1500)} else { const result = await (response as { ok?: unknown; json?: unknown }).json(); error = (result as { error?: unknown }).error || `${authMode === 'login' ? 'Login': 'Registration'} failed`}
 } catch (err) { error = 'Network error. Please try again.'} finally { isLoading = false}
 }

 // Validate form let isFormValid = $state <boolean>(false); // Compute form validity reactively $effect (() => { if (authMode === 'login') { isFormValid = !!formData.email && !!formData.password} else { isFormValid = !!formData.email && !!formData.password && formData.password === formData.confirmPassword && !!formData.firstName && !!formData.lastName && !!formData.department && !!formData.jurisdiction && formData.agreeToTerms && formData.agreeToPrivacy}
 });
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 /* Custom checkbox styling for better visibility */
 input[type='checkbox'] {
 accent-color: #eab308;
 }
</style>


