<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
// Svelte, 5 runes are auto-imported import type { page } from '$app/stores'; let { data, form }: { data, form: unknown } = $props(); let isAutoLoggingIn = $state<boolean>(false); // Check for registration success message let showRegistrationSuccess = $derived($page.url.searchParams.get('registered') === 'true'); // Auto-fill demo user credentials function autoLoginDemo() { console.log('ðŸ”§ Auto-fill demo credentials clicked'); const emailInput = document.getElementById('email') as HTMLInputElement; const passwordInput = document.getElementById('password') as HTMLInputElement; if (!emailInput || !passwordInput) { console.error('âŒ Could not find email or password inputs'); return}
 emailInput.value = 'demo@legalai.gov'; passwordInput.value = 'demo123456'; // Trigger input events to ensure Svelte recognizes the changes emailInput.dispatchEvent(new Event('input', { bubbles: true })); passwordInput.dispatchEvent(new Event('input', { bubbles: true })); console.log('âœ… Demo credentials filled')}

 // Event handlers for buttons function handleQuickLogin() { console.log('ðŸ”§ Quick login handler called'); quickDemoLogin()}
 function handleAutoFill() { console.log('ðŸ”§ Auto-fill handler called'); autoLoginDemo()}

 // Auto-login with demo user (skip form submission) async function quickDemoLogin(): Promise<any> { console.log('âš¡ Quick demo login clicked'); isAutoLoggingIn = true; try { console.log('ðŸ“¡ Calling auto-login endpoint...'); const response = await fetch('/auth/login/auto', { method: 'POST', headers: {
 'Content-Type': 'application/json'
 } }); const result = await (response as { json?: unknown }).json(); console.log('ðŸ“¨ Auto-login response:', result); if ((result as { success?: unknown; redirectTo?: unknown; error?: unknown }).success) { console.log('âœ… Auto-login successful, redirecting...'); // Redirect to dashboard window.location.href = (result as { success?: unknown; redirectTo?: unknown; error?: unknown }).redirectTo || '/dashboard'} else { // Fall back to auto-fill if auto-login fails console.warn.error); autoLoginDemo()}
 } catch (error) { console.error('âŒ Quick demo login failed:', error); // Fall back to auto-fill autoLoginDemo()} finally { isAutoLoggingIn = false}
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
/* Inline CSS to avoid dependency on global styles */ .min-h-screen { min-height: 100vh;}
 .flex { display: flex;}
 .items-center { align-items: center;}
 .justify-center { justify-content: center;}
 .bg-gray-900 { background-color: #111827;}
 .bg-gray-800 { background-color: #1f2937;}
 .bg-gray-700 { background-color: #374151;}
 .border { border-width: 1px;}
 .border-gray-700 { border-color: #374151;}
 .border-gray-600 { border-color: #4b5563;}
 .rounded { border-radius: 0.25rem;}
 .rounded-lg { border-radius: 0.5rem;}
 .p-8 { padding: 2rem;}
 .px-4 { padding-left: 1rem; padding-right: 1rem;}
 .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem;}
 .px-3 { padding-left: 0.75rem; padding-right: 0.75rem;}
 .w-full { width: 100%}
 .max-w-md { max-width: 28rem;}
 .text-3xl { font-size: 1.875rem;}
 .font-bold { font-weight: 700;}
 .font-semibold { font-weight: 600;}
 .text-center { text-align: center;}
 .text-yellow-400 { color: #fbbf24;}
 .text-white { color: #ffffff;}
 .text-black { color: #000000;}
 .text-gray-300 { color: #d1d5db;}
 .mb-8 { margin-bottom: 2rem;}
 .mb-2 { margin-bottom: 0.5rem;}
 .mt-4 { margin-top: 1rem;}
 .space-y-6 > * + * { margin-top: 1.5rem;}
 .space-y-2 > * + * { margin-top: 0.5rem;}
 .bg-yellow-500 { background-color: #eab308;}
 .bg-green-600 { background-color: #16a34a;}
 .bg-blue-600 { background-color: #2563eb;}
 .hover\:bg-yellow-600:hover { background-color: #ca8a04;}
 .hover\:bg-green-700:hover { background-color: #15803d;}
 .hover\:bg-blue-700:hover { background-color: #1d4ed8;}
 .transition-colors { transition-property: color, background-color, border-color; transition-duration 150m;}
 .focus\:outline-none:focus { outline: none;}
 .focus\:border-yellow-400:focus { border-color: #fbbf24;}
</style>


