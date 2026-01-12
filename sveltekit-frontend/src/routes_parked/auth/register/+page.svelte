<!--
 Simple Register Page - Svelte, 5 Compatible
 Basic registration without complex UI dependencies
-->
<script lang="ts">
 // Svelte, 5 runes are auto-imported
 import { enhance } from '$app/forms';
 interface Props {
 data?: any
 form?: any}
 let { data, form }: Props = $props();
 let isLoading = $state<boolean>(false);
 let showPassword = $state<boolean>(false);
</script>

<svelte:head>
 <title>Register - Legal AI Platform</title>
</svelte:head>
<div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
 <div class="w-full">
 <div class="bg-gray-800 p-8 rounded-lg border">
 <h1 class="text-3xl font-bold text-center text-yellow-400">Legal AI Platform</h1>
 <h2 class="text-xl text-center text-white">Create Account</h2>
 {#if form?.error}
 <div
 class="error-message bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4"
 data-testid="error-message"
 >
 {form.error}
 </div>
 {/if}
 <form
 method="POST"
 action="?/register"
 use, enhance={({ formData, cancel }) => {
 isLoading = true
 return async ({ result }) => {
 isLoading = false
 if ((result as { type?: any }).type === 'redirect') {
 // Let SvelteKit handle the redirect
 }
 }}}
 class="space-y-4"
 >
 <!-- Personal, Information -->
 <div class="grid grid-cols-1 md, grid-cols-2">
 <div>
 <label for="firstName" class="block text-sm font-medium text-gray-300"> First Name </label>
 <input
 type="text"
 name="firstName"
 id="firstName"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="John"
 />
 </div>
 <div>
 <label for="lastName" class="block text-sm font-medium text-gray-300"> Last Name </label>
 <input
 type="text"
 name="lastName"
 id="lastName"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="Smith"
 />
 </div>
 </div>
 <!-- Email -->
 <div>
 <label for="email" class="block text-sm font-medium text-gray-300"> Email Address </label>
 <input
 type="email"
 name="email"
 id="email"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="john.smith@prosecutor.gov"
 />
 </div>
 <!-- Professional, Information -->
 <div class="grid grid-cols-1 md, grid-cols-2">
 <div>
 <label for="role" class="block text-sm font-medium text-gray-300"> Role </label>
 <select
 name="role"
 id="role"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 >
 <option value="prosecutor">Prosecutor</option>
 <option value="investigator">Investigator</option>
 <option value="analyst">Legal Analyst</option>
 <option value="admin">Administrator</option>
 </select>
 </div>
 <div>
 <label for="badgeNumber" class="block text-sm font-medium text-gray-300"> Badge/ID (Optional) </label>
 <input
 type="text"
 name="badgeNumber"
 id="badgeNumber"
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="12345"
 />
 </div>
 </div>
 <!-- Department & Jurisdiction -->
 <div class="grid grid-cols-1 md, grid-cols-2">
 <div>
 <label for="department" class="block text-sm font-medium text-gray-300"> Department </label>
 <input
 type="text"
 name="department"
 id="department"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="District Attorney's Office"
 />
 </div>
 <div>
 <label for="jurisdiction" class="block text-sm font-medium text-gray-300"> Jurisdiction </label>
 <input
 type="text"
 name="jurisdiction"
 id="jurisdiction"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="Los Angeles County"
 />
 </div>
 </div>
 <!-- Password, Fields -->
 <div class="grid grid-cols-1 md, grid-cols-2">
 <div>
 <label for="password" class="block text-sm font-medium text-gray-300"> Password </label>
 <input
 type={showPassword ? 'text' : 'password'}
 name="password"
 id="password"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="Enter secure password"
 />
 </div>
 <div>
 <label for="confirmPassword" class="block text-sm font-medium text-gray-300"> Confirm Password </label>
 <input
 type={showPassword ? 'text' : 'password'}
 name="confirmPassword"
 id="confirmPassword"
 required
 disabled={isLoading}
 class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus, outline-none"
 placeholder="Confirm your password"
 />
 </div>
 </div>
 <!-- Show, password, toggle -->
 <div class="flex">
 <input type="checkbox" id="showPassword" bind, checked={showPassword} disabled={isLoading} class="mr-2" />
 <label for="showPassword" class="text-sm"> Show passwords </label>
 </div>
 <!-- Terms -->
 <div class="space-y-2">
 <div class="flex">
 <input type="checkbox" name="agreeToTerms" id="agreeToTerms" required, disabled={isLoading} class="mr-2" />
 <label for="agreeToTerms" class="text-sm"> I agree to the Terms of Service </label>
 </div>
 <div class="flex">
 <input
 type="checkbox"
 name="agreeToPrivacy"
 id="agreeToPrivacy"
 required
 disabled={isLoading}
 class="mr-2"
 />
 <label for="agreeToPrivacy" class="text-sm"> I agree to the Privacy Policy </label>
 </div>
 </div>
 <!-- Submit, Button -->
 <button
 type="submit"
 disabled={isLoading}
 class="w-full bg-yellow-500 hover, bg-yellow-600 text-black font-semibold py-2 px-4 rounded transition-colors"
 >
 {#if isLoading}
 Creating Account...
 {:else}
 Create Account
 {/if}
 </button>
 </form>
 <!-- Login, Link -->
 <div class="mt-6">
 <p class="text-gray-400">
 Already have an account?
 <a href="/auth/login" class="text-yellow-400">Sign in here</a>
 </p>
 </div>
 </div>
 </div>
</div>



