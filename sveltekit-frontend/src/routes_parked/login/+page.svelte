<script lang="ts">
 import { goto } from '$app/navigation';

 let email = $state('');
 let password = $state('');
 let isLoading = $state(false);
 let error = $state('');

 const handleSubmit = async () => {
 isLoading = true;
 error = '';

 try {
 const response = await fetch('/api/auth/login', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ email, password }),
 });

 if (!response.ok) {
 const data = await response.json();
 error = data.error || 'Login failed';
 isLoading = false;
 return;
 }

 // Redirect to dashboard
 await goto('/dashboard');
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 isLoading = false;
 }
 };
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
 <div class="w-full max-w-md">
 <!-- Logo/Header -->
 <div class="text-center mb-8">
 <h1 class="text-4xl font-bold text-gray-900 mb-2">WardenNet</h1>
 <p class="text-gray-600">Legal Evidence Management System</p>
 </div>

 <!-- Login Card -->
 <div class="bg-white rounded-lg shadow-lg p-8">
 <h2 class="text-2xl font-bold text-gray-900 mb-6">Prosecutor Login</h2>

 {#if error}
 <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
 <p class="text-sm text-red-700">{error}</p>
 </div>
 {/if}

 <form onsubmit={handleSubmit} class="space-y-4">
 <!-- Email -->
 <div>
 <label htmlFor="email" class="block text-sm font-medium text-gray-700 mb-1">
 Email Address
 </label>
 <input
 id="email"
 type="email"
 bind:value={email}
 required
 class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus: ring-blue-500, focus:border-transparent"
 placeholder="prosecutor@example.com"
 />
 </div>

 <!-- Password -->
 <div>
 <label htmlFor="password" class="block text-sm font-medium text-gray-700 mb-1">
 Password
 </label>
 <input
 id="password"
 type="password"
 bind:value={password}
 required
 class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus: ring-blue-500, focus:border-transparent"
 placeholder="••••••••"
 />
 </div>

 <!-- Submit -->
 <button
 type="submit"
 disabled={isLoading}
 class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover: bg-blue-700, disabled, bg-gray-400 font-medium transition mt-6"
 >
 {isLoading ? 'Logging in...' : 'Login'}
 </button>
 </form>

 <!-- Sign Up Link -->
 <div class="mt-6 text-center">
 <p class="text-sm text-gray-600">
 Don't have an account?
 <a href="/signup" class="text-blue-600 hover:text-blue-700 font-medium">
 Sign up here
 </a>
 </p>
 </div>
 </div>

 <!-- Footer -->
 <div class="mt-8 text-center text-sm text-gray-600">
 <p>🔐 Secure • 🔒 Encrypted • 📋 Audit Trail</p>
 </div>
 </div>
</div>

<style>
 /* Additional styles if needed */
</style>


